# Admin Guide

Panel language: Turkish (default) / English — switch from the top bar. Dark/light mode toggle in the top bar.

## First login

- Web installer (`/installer`) or `.env`-seeded admin (Super Admin role).
- Immediately enable MFA: **Profile → MFA → Enable**, scan the QR with Google
  Authenticator, store the recovery codes.

## Channels

**Channel Management → New Channel.**

- **Source**: pick the type (file, playlist, folder, M3U8, RTSP, RTMP, HTTP, UDP,
  M3U link, camera, test pattern) and set the URL/path/playlist.
- **UDP target**: multicast IP + port (e.g. `230.120.5.98:1234`), TTL, packet size
  (1316 = 7×188 TS packets), and the local interface IP for egress.
- **Encoding**: *Copy mode* passes streams through without transcoding (lowest CPU;
  source must already be TS-compatible). Untick it to transcode and set codec,
  bitrate, resolution, FPS, GOP, preset, threads, bufsize, muxrate, hwaccel.
- **Outputs**: add HLS / SRT / RTMP rows to fan the same encode out simultaneously.
  For HLS choose whether the link is public and whether a token is required.
- **Behaviour**: loop, auto start (starts with the worker), auto restart with a
  restart limit, schedule (daily HH:mm start/stop window), priority, notes.
- Engine: FFmpeg (default) or VLC (testing/fallback only).

Row actions: ▶ start, ⏹ stop (graceful; force kill available via API `/kill`),
↻ restart, 🔗 copy tokenized external HLS link, 🗑 delete (stream must be stopped).

Sample channels `230.120.5.98:1234` and `230.120.5.99:1234` (test pattern) are
seeded on install.

## Stream Monitor

Live cards per channel: state badge, PID, bitrate sparkline, uptime, restart count,
last error. Click a card for the live FFmpeg log tail. A watchdog restarts streams
whose progress stalls for 45 s.

## Video Library

Drag-drop or bulk upload (up to 20 files per batch); or drop files into the server
media folder and register them via **Server Folder → Add to library**. Duration,
codec, resolution and a thumbnail are extracted automatically (ffprobe/ffmpeg).
Rename, tag, categorize, preview, delete (optionally from disk).

## Playlists

Modes: sequential, random, single video loop, folder loop, scheduled. Items are
library videos or URLs; reorder with ↑/↓. Preview shows the resolved play order.
Assign a playlist to a channel via source type *playlist*.

## M3U / EPG

- **Export**: M3U (UDP addresses + HLS links + logo/group/EPG ID), JSON, CSV.
- **Import**: from URL or pasted content; channels are created in copy mode and
  free multicast addresses are assigned automatically from the base IP.
- **EPG**: import XMLTV from URL/content; link EPG channels to panel channels via
  the channel's EPG ID field.

## Users, Roles & Permissions

Default roles: **Super Admin** (everything), **Admin** (everything except license),
**Operator** (view + start/stop/restart + upload + playlist edit; no deletes or
system settings), **Viewer** (read-only). Create custom roles with any permission
combination. System roles cannot be deleted; Super Admin cannot be edited.

## Alerts

Configure Telegram (bot token + chat ID), SMTP e-mail recipients, generic/Slack/
Discord webhooks. Toggle per event: stream offline, FFmpeg crash, auto-restart,
high CPU/RAM, low disk, bitrate drop, login failures, backup failure. Use *Send
test alert* to verify transports.

## Logs

Unified viewer: streaming (FFmpeg), audit (all panel mutations), security (login
history), alerts. Search, level filter, live tail, export to file.

## Backups

Manual backup button; automatic daily backup at 03:30 (toggle + retention count in
System Settings). Download `.dump` files. **Restore overwrites the database** —
restart the stack afterwards (`docker compose restart`).

## System Settings

Storage paths, FFmpeg/ffprobe paths, multicast interface IP (with detected
interface list), public URL, local domain, SSL mode, default panel language,
backup schedule.

## License

Offline license keys (`MCP1.…`) — paste and activate. Status: trial / active /
grace / expired. Trial mode is unrestricted (internal use). Expired licenses fall
back to a 2-channel floor. Online validation service hooks are reserved for a
future version.

## API Tokens

Create scoped tokens (`mcp_…`) for integrations; shown once at creation. Use as
`Authorization: Bearer mcp_…`. Revoke anytime. Full API reference: `/api/docs`.

## Security checklist

- Enable MFA for all admins; enforce strong passwords (10+ chars, mixed case + digit).
- Set `IP_ALLOWLIST` for management networks.
- Serve over HTTPS (`SSL_MODE=custom` or Cloudflare Tunnel) and set `SECURE_COOKIES=true`.
- Review audit logs and login history periodically.
- 5 failed logins lock an account for 15 minutes and raise an alert.
