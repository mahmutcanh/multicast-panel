# Nginx image: serves the built Vue SPA, proxies API/WS, serves token-checked HLS.
FROM node:20-alpine AS fe-build
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/conf.d/ /etc/nginx/templates-src/
COPY docker/nginx/entrypoint.sh /docker-entrypoint.d/45-mcp-ssl.sh
RUN chmod +x /docker-entrypoint.d/45-mcp-ssl.sh
COPY --from=fe-build /fe/dist /usr/share/nginx/html
