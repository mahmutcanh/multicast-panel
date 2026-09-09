# Installation Guide

## Requirements

- Linux server (Ubuntu 22.04+ recommended) — worker uses Docker **host networking**
  for UDP multicast, which is Linux-only
- Docker Engine 24+ with the Compose v2 plugin
- LAN/VLAN with IGMP snooping configured for IPTV multicast (230.x.x.x range)
- Open ports: 80 (HTTP) and optionally 443 (HTTPS)

## Option A — One-command install

```bash
cd /opt && git clone <repo> mcp && cd mcp
bash install.sh
```

`install.sh`:
1. Copies `.env.example` → `.env` and generates strong secrets
   (DB, Redis, JWT, refresh, stream-token).
2. Creates storage folders (`./data/media`, `./data/hls`, `./data/backups`).
3. Builds images and starts the stack.
4. Waits for the API health check.

First admin: open `http://<server>/installer` (web installer), **or** seed from env:

```bash
bash install.sh --with-admin admin@example.com 'MyStr0ngPass!'
```

## Option B — Manual

```bash
cp .env.example .env
# edit .env: set DB_PASSWORD, REDIS_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET,
# STREAM_TOKEN_SECRET (openssl rand -hex 32), PUBLIC_URL, storage paths
mkdir -p data/media data/hls data/backups
docker compose up -d --build
```

Migrations and seeds (roles, permissions, sample channels 230.120.5.98/.99:1234,
default settings) run automatically when the API starts.

## Storage paths (server-side folders)

`.env` bind-mounts host folders into the containers:

| Variable       | Default          | Mounted at      |
|----------------|------------------|-----------------|
| `STORAGE_PATH` | `./data/media`   | `/data/media`   |
| `HLS_PATH`     | `./data/hls`     | `/data/hls`     |
| `BACKUP_PATH`  | `./data/backups` | `/data/backups` |

Point these at any server disk (e.g. `/srv/iptv/media`).

## Network interface for multicast

Set `MULTICAST_INTERFACE_IP` in `.env` (or panel → System Settings → Network) to the
IPv4 of the NIC that faces the IPTV VLAN. Empty = OS routing default. Per-channel
override: channel form → "Network Interface".

## External access / SSL

| `SSL_MODE`  | Behaviour |
|-------------|-----------|
| `none`      | Plain HTTP on port 80 |
| `custom`    | HTTPS on 443 with `fullchain.pem` + `privkey.pem` in `SSL_CERT_PATH` |
| `cloudflare`| HTTP origin; TLS terminated by Cloudflare Tunnel / proxy |

Cloudflare Tunnel: point the tunnel ingress at `http://<server-ip>:80`.
Set `PUBLIC_URL=https://panel.example.com` (used for CORS, links, HLS URLs)
and `SECURE_COOKIES=true` when serving over HTTPS.

IP allowlist: `IP_ALLOWLIST=192.168.1.0/24,10.0.0.5` in `.env` (empty = allow all).

## Verify the streams

Start a sample channel from the panel, then on a LAN client:

```bash
ffprobe udp://230.120.5.98:1234        # or open it in VLC
```

## Updating

```bash
git pull
docker compose build && docker compose up -d
```

## Troubleshooting

- `docker compose logs -f app|worker|scheduler|nginx`
- API health: `curl http://localhost/api/v1/system/health`
- No multicast on LAN → check worker is on host network (`docker inspect mcp_worker`),
  IGMP snooping/querier on switches, `MULTICAST_INTERFACE_IP` value.
- Worker can't reach DB → Postgres/Redis publish on `127.0.0.1` only; confirm
  `DB_PORT`/`REDIS_PORT` in `.env` match the compose port mappings.
