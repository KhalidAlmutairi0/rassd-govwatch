FROM node:20-slim

# Install Chromium + system deps for Playwright
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto \
    fonts-noto-cjk \
    ca-certificates \
    openssl \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    --no-install-recommends \
    && (apt-get install -y libasound2 2>/dev/null || apt-get install -y libasound2t64 2>/dev/null || true) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# Install Playwright's bundled Chromium (version-matched)
RUN npx playwright install chromium

# Copy source (bust cache on every deploy)
ARG CACHEBUST=1
COPY . .

# Build Next.js — SQLite needs a dummy path at build time
RUN DATABASE_URL="file:./build.db" npm run build && rm -f build.db

# Create dirs for artifacts and persistent data
RUN mkdir -p artifacts /data

EXPOSE 3000

COPY start.sh ./start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
