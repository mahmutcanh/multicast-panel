import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.43.154.160', port=25416, username='root', password='y!BHNDQ@NZBr', timeout=20)
def run(cmd):
    _, o, e = ssh.exec_command(cmd, timeout=30)
    o.channel.recv_exit_status()
    return (o.read().decode('utf-8','replace') + e.read().decode('utf-8','replace')).strip()
print(run('docker ps --format "{{.Names}}"'))
ssh.close()
