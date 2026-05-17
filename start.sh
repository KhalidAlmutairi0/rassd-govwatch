#!/bin/sh
set -e

echo "Pushing database schema..."
npx prisma db push --skip-generate

# Seed only on first deploy (if no sites exist)
SITE_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.site.count().then(c=>{console.log(c);p.\$disconnect()})" 2>/dev/null || echo "0")
if [ "$SITE_COUNT" = "0" ]; then
  echo "First run — seeding database..."
  npx tsx prisma/seed.ts
fi

# One-time migration: replace geo-blocked sites with globally accessible ones
HAS_OLD=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.site.findFirst({where:{baseUrl:'https://www.absher.sa'}}).then(s=>{console.log(s?'yes':'no');p.\$disconnect()})" 2>/dev/null || echo "no")
if [ "$HAS_OLD" = "yes" ]; then
  echo "Migrating sites to globally accessible URLs..."
  npx tsx prisma/migrate-sites.ts
fi

echo "Starting worker + WebSocket server (port ${WORKER_PORT:-3003})..."
npx tsx src/worker/scheduler.ts &

echo "Starting Next.js with WebSocket proxy (port ${PORT:-3000})..."
exec node server.js
