FROM nginx:1.27-alpine AS web
COPY dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

FROM node:22-alpine AS service
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY scripts ./scripts
COPY library ./library
RUN mkdir -p /data && chown -R node:node /data /app
USER node
ENV NODE_ENV=production STUDIO_HISTORY_HOST=0.0.0.0 STUDIO_HISTORY_PORT=8787 STUDIO_DATA_DIR=/data STUDIO_LIBRARY_DIR=/app/library STUDIO_LIBRARY_ASSET_DIR=/app/library/image-library
CMD ["node", "scripts/image-agent-studio-history-service.mjs"]
