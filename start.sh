#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npx tsx prisma/seed.ts

echo "Starting worker + WebSocket server (port ${WORKER_PORT:-3003})..."
npx tsx src/worker/scheduler.ts &

echo "Starting Next.js with WebSocket proxy (port ${PORT:-3000})..."
exec node server.js
