#!/bin/sh
# Renders the final panel.conf based on SSL_MODE.
#   none/cloudflare: plain HTTP on :80 (Cloudflare tunnel terminates TLS upstream).
#   custom:          HTTPS on :443 with certs from /etc/nginx/certs, HTTP redirects.
set -e

SRC=/etc/nginx/templates-src/panel.conf
DST=/etc/nginx/conf.d/panel.conf
mkdir -p /etc/nginx/conf.d
cp "$SRC" "$DST"

if [ "${SSL_MODE:-none}" = "custom" ] && [ -f /etc/nginx/certs/fullchain.pem ]; then
  # Redirect HTTP → HTTPS
  sed -i 's|# __SSL_REDIRECT__.*|if ($scheme = http) { return 301 https://$host$request_uri; }|' "$DST"
  # Append the TLS server block: reuse the HTTP block with listen 443 ssl.
  awk '/^server \{/{n++} n==1' "$DST" | sed \
    -e 's/listen 80;/listen 443 ssl;\n    http2 on;\n    ssl_certificate \/etc\/nginx\/certs\/fullchain.pem;\n    ssl_certificate_key \/etc\/nginx\/certs\/privkey.pem;/' \
    -e 's|if (\$scheme = http).*||' >> "$DST"
fi
