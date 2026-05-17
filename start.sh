#!/bin/sh
set -e

# Detect Chromium — prefer Playwright's own bundled binary (guaranteed compatible)
if [ -z "$CHROME_PATH" ]; then
  PW_CHROMIUM=$(node -e "try{console.log(require('playwright').chromium.executablePath())}catch{}" 2>/dev/null || true)
  if [ -n "$PW_CHROMIUM" ] && [ -f "$PW_CHROMIUM" ]; then
    export CHROME_PATH="$PW_CHROMIUM"
  fi
fi

if [ -n "$CHROME_PATH" ]; then
  echo "Chromium found at: $CHROME_PATH"
else
  echo "WARNING: No Chromium found — scans will fail"
fi

echo "Pushing database schema..."
npx prisma db push --skip-generate

# Seed only on first deploy (if no sites exist)
SITE_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.site.count().then(c=>{console.log(c);p.\$disconnect()})" 2>/dev/null || echo "0")
if [ "$SITE_COUNT" = "0" ]; then
  echo "First run — seeding database..."
  npx tsx prisma/seed.ts
fi

echo "Starting worker + WebSocket server (port ${WORKER_PORT:-3003})..."
npx tsx src/worker/scheduler.ts &

echo "Starting Next.js with WebSocket proxy (port ${PORT:-3000})..."
exec node server.js
