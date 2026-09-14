FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci
COPY backend backend
COPY frontend frontend
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=same-origin \
    NEXT_PUBLIC_WS_URL=same-origin
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    API_HOST=127.0.0.1 \
    API_PORT=4000 \
    WORKER_HOST=127.0.0.1 \
    WORKER_PORT=4001
RUN apt-get update && apt-get install -y --no-install-recommends nginx supervisor ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/supervisord.conf /etc/supervisor/conf.d/rasd.conf
COPY deploy/start.sh /app/deploy/start.sh
RUN chmod +x /app/deploy/start.sh && mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["/app/deploy/start.sh"]
