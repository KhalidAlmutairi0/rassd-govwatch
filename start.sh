#!/bin/sh
set -e

# Auto-detect Chromium for Nixpacks (Railway) if CHROME_PATH is not set
if [ -z "$CHROME_PATH" ]; then
  # Try common locations
  for p in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
    if [ -x "$p" ]; then
      export CHROME_PATH="$p"
      break
    fi
  done
fi

# Search Nix store if still not found
if [ -z "$CHROME_PATH" ]; then
  NIX_CHROMIUM=$(find /nix/store -maxdepth 4 -path "*/bin/chromium" -type f 2>/dev/null | head -1 || true)
  if [ -n "$NIX_CHROMIUM" ]; then
    export CHROME_PATH="$NIX_CHROMIUM"
  fi
fi

# Try Playwright's bundled chromium
if [ -z "$CHROME_PATH" ]; then
  PW_CHROMIUM=$(node -e "try{const p=require('playwright');p.chromium.executablePath&&console.log(p.chromium.executablePath())}catch{}" 2>/dev/null || true)
  if [ -n "$PW_CHROMIUM" ] && [ -x "$PW_CHROMIUM" ]; then
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
