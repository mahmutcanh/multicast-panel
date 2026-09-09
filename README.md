# Multicast & Broadcast Control Panel

Docker-based IPTV streaming control panel for hotel/enterprise UDP multicast, HLS, HTTP, SRT and RTMP distribution.
Streams YouTube live/videos, screen captures, local files, playlists, M3U/IPTV links, RTSP cameras, RTMP, HTTP(S), M3U8 and test patterns — managed from a secure, bilingual (TR/EN) web panel.

## Features

- **Unlimited channels**, each running as its own supervised FFmpeg process
- **Multiple simultaneous outputs** per channel:
  - **UDP Multicast** (for Hotel/Enterprise Local IPTV Networks e.g. `udp://230.120.5.98:1234`)
  - **HLS / M3U8** (for Internet / Web / Mobile / Smart TV playback e.g. `https://stream.homaklab.com/hls/<id>/index.m3u8`)
  - **HTTP Stream** (direct MPEG-TS HTTP stream e.g. `http://0.0.0.0:8080/stream.ts`)
  - **SRT** (low-latency caller/listener streaming)
  - **RTMP** (re-stream to YouTube, Twitch, Facebook Live)
- **Rich Source Types**:
  - **YouTube** (paste YouTube video or live URL directly)
  - **Screen Capture** (Desktop / X11 grab)
  - MP4 / TS / MKV / MOV / AVI video files
  - Playlists & folder playout
  - M3U8, RTSP, RTMP, HTTP(S), UDP, M3U IPTV links, Webcams (`/dev/video0`), Test Patterns
- Full FFmpeg control: copy/transcode, bitrate, resolution, FPS, GOP, preset, hardware acceleration, reconnect logic
- Crash detection, auto-restart with backoff, watchdog, live FFmpeg logs
- Video library: bulk upload, server folder import, metadata, thumbnails
- M3U import & export (+JSON/CSV) for IPTV apps
- Bilingual Web UI (Turkish / English) with dark mode

## Usage Guide (Kullanım Kılavuzu)

### 1. YouTube Canlı Yayını veya Videosu Başlatma
1. Web paneline girin (`https://stream.homaklab.com`).
2. **Kanallar > Yeni Kanal** sayfasına geçin.
3. Kaynak Türü olarak **YouTube** seçin ve YouTube linkini yapıştırın (ör. `https://www.youtube.com/watch?v=2l7XOjbOyQY`).
4. İstediğiniz çıkışları ekleyin (UDP Multicast veya HLS) ve **Kaydet** deyip **▶ Başlat** butonuna basın.

### 2. Otel İçi UDP Multicast Yayını
- Çıktılar bölümünden **UDP Multicast** ekleyin.
- **UDP IP**: `230.120.5.98` (veya Otel IPTV IP bloğu), **Port**: `1234` girin.
- Otel TV'leri veya VLC (yerel ağda): `udp://@230.120.5.98:1234` adresinden izler.

### 3. İnternet / Dış Ağdan İzleme (HLS & M3U8)
- Çıktılar bölümünden **HLS** ekleyin ve **Dışarıdan İzlenebilsin** işaretleyin.
- VLC / Mobil / Smart TV / IPTV Smarters üzerinden şu linki yapıştırın:
  `https://stream.homaklab.com/hls/<kanal-id>/index.m3u8`

### 4. HTTP Stream Kullanımı
- Çıktılar bölümünden **HTTP Stream** ekleyin (ör. `http://0.0.0.0:8080/stream.ts`).
- Yayın başladığında VLC veya oynatıcıya `http://<sunucu-ip>:8080/stream.ts` yazarak izleyebilirsiniz.

## Quick Start

```bash
git clone <repo> mcp && cd mcp
bash install.sh
```

- Web Panel: `https://stream.homaklab.com` (port 8090)
- API Documentation: `https://stream.homaklab.com/api/docs`
