FROM node:20-slim

# Install system dependencies required by Chromium
RUN apt-get update && apt-get install -y \
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

# Install Playwright's own Chromium (guaranteed compatible)
RUN npx playwright install chromium

# Copy source
COPY . .

# Build Next.js
RUN DATABASE_URL="file:./build.db" npm run build && rm -f build.db

# Create dirs for artifacts and persistent data
RUN mkdir -p artifacts /data

EXPOSE 3000

COPY start.sh ./start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
