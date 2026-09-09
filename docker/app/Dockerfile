# Backend image: API / worker / scheduler (same image, different command).
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
# ffmpeg: streaming engine. vlc: optional fallback engine.
# postgresql16-client: pg_dump/pg_restore for the backup module.
RUN apk add --no-cache ffmpeg postgresql16-client vlc tzdata wget python3 yt-dlp
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Runs as root so host bind mounts (STORAGE_PATH/HLS_PATH/BACKUP_PATH) stay writable
# regardless of host ownership. Container is single-purpose and not exposed directly.
RUN mkdir -p /data/media /data/hls /data/backups
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
