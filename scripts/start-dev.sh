#!/bin/bash

# GovWatch Development Startup Script
# This script starts both the Next.js dev server and the WebSocket worker

echo "🚀 Starting GovWatch Development Environment..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if database exists
if [ ! -f "prisma/dev.db" ]; then
    echo "🗄️  Setting up database..."
    npx prisma generate
    npx prisma db push
    npm run seed
fi

# Ensure Playwright is installed
if [ ! -d "node_modules/playwright/.local-browsers" ]; then
    echo "🎭 Installing Playwright browsers..."
    npx playwright install chromium
fi

echo ""
echo "✅ Environment ready!"
echo ""
echo "Starting services:"
echo "  - Next.js dev server on http://localhost:3000"
echo "  - WebSocket server on ws://localhost:3003"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to handle cleanup
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $WORKER_PID $NEXTJS_PID 2>/dev/null
    exit 0
}

# Register cleanup on script exit
trap cleanup EXIT INT TERM

# Start the worker (which includes WebSocket server)
echo "🔧 Starting worker scheduler..."
npm run worker &
WORKER_PID=$!

# Give the worker a moment to start the WebSocket server
sleep 2

# Start Next.js dev server
echo "🌐 Starting Next.js dev server..."
npm run dev &
NEXTJS_PID=$!

# Wait for both processes
wait
