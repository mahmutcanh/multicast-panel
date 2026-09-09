# API Guide

Base URL: `/api/v1` — full interactive documentation (Swagger/OpenAPI): **`/api/docs`**.

## Envelope

Every JSON response:

```json
{ "success": true, "data": { }, "error": null, "meta": { "total": 42, "page": 1, "limit": 25, "pages": 2 } }
```

`meta` present on paginated lists (`page`, `limit`, `search` query params).

## Authentication

```http
POST /api/v1/auth/login          { "email", "password", "rememberMe" }
→ { "accessToken", "expiresIn", "user" }            # or { "mfaRequired": true, "mfaToken" }
POST /api/v1/auth/mfa/verify     { "mfaToken", "code" }
POST /api/v1/auth/refresh        (cookie mcp_refresh + header X-Requested-With: XMLHttpRequest)
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Use `Authorization: Bearer <accessToken>` (15 min TTL) or an API token
(`Authorization: Bearer mcp_…`, scoped, created under **API Tokens**).

Other auth endpoints: `mfa/setup`, `mfa/enable`, `mfa/disable`, `forgot-password`,
`reset-password`, `change-password`, `verify-email`, `login-history`.

## Main endpoint groups

| Group | Endpoints |
|---|---|
| Users / Roles | `GET/POST/PUT/DELETE /users`, `GET/POST/PUT/DELETE /roles`, `GET /roles/permissions` |
| Channels | `GET/POST /channels`, `GET/PUT/DELETE /channels/:id`, `GET /channels/categories` |
| Streams | `POST /streams/:id/start|stop|kill|restart`, `GET /streams/status`, `GET /streams/:id/status`, `GET /streams/:id/logs`, `GET /streams/:id/external-link?ttl=86400` |
| Library | `GET /library`, `POST /library/upload` (multipart `files[]`), `GET /library/server-files`, `POST /library/import-server-file`, `GET /library/:id/thumbnail|preview`, `PUT /library/:id/rename|meta`, `DELETE /library/:id` |
| Playlists | `GET/POST /playlists`, `GET/PUT/DELETE /playlists/:id`, `GET /playlists/:id/preview` |
| M3U | `POST /m3u/import`, `GET /m3u/export?format=m3u|json|csv`, `GET /m3u/imports` |
| EPG | `GET/POST /epg/channels`, `DELETE /epg/channels/:id`, `GET /epg/channels/:id/programs`, `POST /epg/import` |
| Logs | `GET /logs?kind=streaming|audit|security|alerts`, `GET /logs/export` |
| Alerts | `GET/PUT /alerts/settings`, `POST /alerts/test`, `GET /alerts/notifications` |
| Backups | `GET/POST /backups`, `GET /backups/:id/download`, `POST /backups/:id/restore`, `DELETE /backups/:id` |
| Settings | `GET/PUT /settings`, `GET /settings/interfaces` |
| License | `GET /license`, `POST /license/activate` |
| System | `GET /system/health` (public), `GET /system/stats` |
| Nodes | `GET /nodes` (v1: single local node) |
| Installer | `GET /installer/status`, `POST /installer` (locked after setup) |

## WebSocket (Socket.IO)

Connect to `/socket.io` with `auth: { token: <accessToken> }`, then:

```js
socket.emit('subscribe', ['status', 'metrics', 'alerts', 'logs:all', 'logs:<channelId>']);
socket.on('stream:status', s => …);   // state, pid, bitrateKbps, fps, restartCount, uptime
socket.on('system:metrics', m => …);  // cpu/ram/disk/network samples (5 s)
socket.on('stream:log', l => …);      // live ffmpeg lines
socket.on('alert', a => …);
```

## Example: start a stream with an API token

```bash
curl -X POST https://panel.example.com/api/v1/streams/<channelId>/start \
  -H "Authorization: Bearer mcp_xxxxxxxx"
```

## Rate limits

Global 300 req/min per IP; auth endpoints 5–10 req/min. HTTP 429 on excess.
