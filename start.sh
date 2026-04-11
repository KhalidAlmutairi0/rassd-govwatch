#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting worker + WebSocket server..."
npx tsx src/worker/scheduler.ts &

echo "Starting Next.js..."
exec npm start
