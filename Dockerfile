FROM node:20-slim

# Install Chromium + system deps for Playwright
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-noto \
    fonts-noto-cjk \
    ca-certificates \
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
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# Copy source
COPY . .

# Build Next.js
RUN npm run build

# Create artifacts directory
RUN mkdir -p artifacts

EXPOSE 3000 3003

COPY start.sh ./start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
