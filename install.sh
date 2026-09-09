#!/usr/bin/env bash
# Multicast Control Panel — one-command installer.
# Usage: bash install.sh [--with-admin admin@example.com password]
set -euo pipefail

cd "$(dirname "$0")"

say() { printf '\033[1;36m[mcp]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[mcp]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is required. Install: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is required."

rand() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [ ! -f .env ]; then
  say "Creating .env from .env.example with generated secrets..."
  cp .env.example .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(rand)|" .env
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(rand)|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(rand)|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(rand)|" .env
  sed -i "s|^STREAM_TOKEN_SECRET=.*|STREAM_TOKEN_SECRET=$(rand)|" .env
else
  say ".env already exists — keeping it."
fi

if [ "${1:-}" = "--with-admin" ]; then
  [ -n "${2:-}" ] && [ -n "${3:-}" ] || die "Usage: install.sh --with-admin <email> <password>"
  sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$2|" .env
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$3|" .env
  say "Admin user will be seeded from .env."
fi

# shellcheck disable=SC1091
. ./.env 2>/dev/null || true
mkdir -p "${STORAGE_PATH:-./data/media}" "${HLS_PATH:-./data/hls}" "${BACKUP_PATH:-./data/backups}"

say "Building images (this can take a few minutes)..."
docker compose build

say "Starting stack..."
docker compose up -d

say "Waiting for API to become healthy..."
for i in $(seq 1 60); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/v1/system/health >/dev/null 2>&1; then
    say "API is up."
    break
  fi
  [ "$i" = 60 ] && die "API did not become healthy. Check: docker compose logs app"
  sleep 2
done

URL="${PUBLIC_URL:-http://localhost}"
say "──────────────────────────────────────────────────"
say "Installation complete."
say "Panel:    ${URL}"
say "API docs: ${URL}/api/docs"
if grep -q '^ADMIN_EMAIL=.\+' .env; then
  say "Login with the admin credentials from .env."
else
  say "No admin set — open ${URL}/installer to create the first admin."
fi
say "──────────────────────────────────────────────────"
