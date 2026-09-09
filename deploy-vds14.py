# Multicast Control Panel — vds14 deploy pipeline.
# Usage:
#   python deploy-vds14.py all       -> check + upload + install (panel on :8090)
#   python deploy-vds14.py dns       -> create panel.homaklab.com CNAME -> vds14 tunnel
#   python deploy-vds14.py ingress   -> add tunnel ingress rule + restart cloudflared
#                                       (NOTE: restarts cloudflared -> a few seconds of
#                                        downtime for ALL services on tunnel adcda483)
import json
import sys
import urllib.request

import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST, PORT, USER, PASS = '45.43.154.160', 25416, 'root', 'y!BHNDQ@NZBr'
TARBALL = r'C:\Users\Administrator\Desktop\mcp-deploy.tar.gz'
REMOTE_DIR = '/opt/multicast-panel'
HTTP_PORT = '8090'
SUBDOMAIN = 'stream'
FQDN = f'{SUBDOMAIN}.homaklab.com'
TUNNEL_CNAME = 'adcda483-9798-4263-9875-3750dfd3744a.cfargotunnel.com'
CF_ZONE = '44dab7da9ef829b2303a961983a4668b'
CF_TOKEN = os.environ.get('CF_TOKEN', '')

step = sys.argv[1] if len(sys.argv) > 1 else 'all'
ssh = None


def connect():
    global ssh
    if ssh is None:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
    return ssh


def run(cmd, timeout=1800, echo=True):
    _, o, e = connect().exec_command(cmd, timeout=timeout)
    code = o.channel.recv_exit_status()
    out = (o.read().decode('utf-8', 'replace') + e.read().decode('utf-8', 'replace')).strip()
    if echo and out:
        print(out)
    if code != 0:
        print(f'!! exit {code}: {cmd[:120]}')
    return code, out


def do_check():
    print('=== CHECK ===')
    _, ports = run("ss -tlnp | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un | tr '\\n' ' '")
    if f' {HTTP_PORT} ' in f' {ports} ':
        print(f'!! Port {HTTP_PORT} zaten dolu — HTTP_PORT degistir.')
        sys.exit(1)
    run('docker compose version')


def do_upload():
    print('=== UPLOAD ===')
    sftp = connect().open_sftp()
    sftp.put(TARBALL, '/tmp/mcp-deploy.tar.gz')
    sftp.close()
    run(f'mkdir -p {REMOTE_DIR} && tar -xzf /tmp/mcp-deploy.tar.gz -C {REMOTE_DIR} && ls {REMOTE_DIR}')


def do_install():
    print('=== INSTALL (docker build ~5-10 dk) ===')
    env_prep = f'''cd {REMOTE_DIR} && if [ ! -f .env ]; then
      cp .env.example .env
      sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
      sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 24)|" .env
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
      sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
      sed -i "s|^STREAM_TOKEN_SECRET=.*|STREAM_TOKEN_SECRET=$(openssl rand -hex 32)|" .env
    fi
    sed -i "s|^DB_PORT=.*|DB_PORT=15432|" .env
    sed -i "s|^REDIS_PORT=.*|REDIS_PORT=16379|" .env
    sed -i "s|^HTTP_PORT=.*|HTTP_PORT={HTTP_PORT}|" .env
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://{FQDN}|" .env
    sed -i "s|^SSL_MODE=.*|SSL_MODE=cloudflare|" .env
    sed -i "s|^SECURE_COOKIES=.*|SECURE_COOKIES=true|" .env'''
    run(env_prep)
    run(f'cd {REMOTE_DIR} && mkdir -p data/media data/hls data/backups && docker compose build 2>&1 | tail -5', timeout=1800)
    run(f'cd {REMOTE_DIR} && docker compose up -d && sleep 20 && docker compose ps')
    run(f'curl -sf http://127.0.0.1:{HTTP_PORT}/api/v1/system/health || echo HEALTH-FAIL')


def do_dns():
    print('=== CLOUDFLARE DNS ===')
    payload = json.dumps({
        'type': 'CNAME', 'name': SUBDOMAIN, 'content': TUNNEL_CNAME,
        'proxied': True, 'comment': 'Multicast Control Panel (vds14)',
    }).encode()
    req = urllib.request.Request(
        f'https://api.cloudflare.com/client/v4/zones/{CF_ZONE}/dns_records',
        data=payload, method='POST',
        headers={'Authorization': f'Bearer {CF_TOKEN}', 'Content-Type': 'application/json'},
    )
    try:
        res = json.load(urllib.request.urlopen(req))
        print('DNS OK:', res['result']['name'], '->', res['result']['content'])
    except urllib.error.HTTPError as err:
        print('DNS HATA:', err.read().decode())


def do_ingress():
    print('=== TUNNEL INGRESS (cloudflared restart = kisa kesinti!) ===')
    # find cloudflared config mounted into the docker container
    _, cfg = run("docker inspect cloudflared --format '{{json .Mounts}}' 2>/dev/null || true", echo=False)
    print('mounts:', cfg[:400])
    code, path = run(
        "for f in /etc/cloudflared/config.yml /root/.cloudflared/config.yml /opt/cloudflared/config.yml; do [ -f $f ] && echo $f && break; done",
        echo=False,
    )
    if not path:
        print('!! config.yml bulunamadi — tunnel remote-managed olabilir. CF dashboard > Tunnels > adcda483 > Public Hostname ekle:')
        print(f'   {FQDN} -> http://localhost:{HTTP_PORT}')
        return
    print('config:', path)
    run(f'cp {path} {path}.bak-mcp')
    # insert hostname rule before the catch-all (http_status:404) line
    rule = f'  - hostname: {FQDN}\\n    service: http://localhost:{HTTP_PORT}\\n'
    run(f"sed -i '/service: http_status:404/i\\{rule}' {path} && grep -A1 'hostname:' {path}")
    run('docker restart cloudflared')
    run(f'sleep 8 && curl -sf https://{FQDN}/api/v1/system/health || echo INGRESS-BEKLIYOR')


if step in ('check', 'all'):
    do_check()
if step in ('upload', 'all'):
    do_upload()
if step in ('install', 'all'):
    do_install()
if step == 'dns':
    do_dns()
if step == 'ingress':
    do_ingress()

if ssh:
    ssh.close()
print('DONE:', step)
