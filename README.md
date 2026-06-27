# GovWatch - AI-Powered Government Website Monitoring

Real-time monitoring of Saudi government websites with live browser streaming and AI-powered analysis.

## Features

- **Live Browser View**: Watch AI agents browse websites in real-time via CDP screencast (manual runs only)
- **AI-Powered Analysis**: Per-element verdict via OpenAI gpt-4o vision; executive summaries via gpt-4o-mini
- **Continuous Monitoring**: Automated monitoring of pre-seeded Saudi government sites every N minutes
- **Cost-gated AI**: Heuristic-first element assessment + content-hash gate skip vision calls when nothing changed
- **Incident Detection**: Automatic grouping, severity assessment, and escalation timers for failures
- **Safe & Secure**: Black-box testing only, same-domain enforcement, no destructive actions

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Database**: SQLite + Prisma ORM
- **Browser Automation**: Playwright (Chromium)
- **Live Streaming**: CDP Screencast + WebSocket
- **AI**: OpenAI gpt-4o (vision) + gpt-4o-mini (text summaries)
- **UI**: TailwindCSS + shadcn/ui

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Database

```bash
npm run db:push
npm run seed
```

This will create the SQLite database and seed 10 Saudi government websites + two demo users.

### 3. Configure Environment (Optional)

Copy `.env.example` to `.env` and add an OpenAI key to enable vision-driven page understanding and richer summaries:

```env
OPENAI_API_KEY="sk-..."
```

Without a key the system uses heuristic page analysis and template summaries — monitoring still works.

### 4. Start Development Server

**Terminal 1 - Web Server:**
```bash
npm run dev
```

**Terminal 2 - Worker (for automated monitoring):**
```bash
npm run worker
```

Open [http://localhost:3000](http://localhost:3000)

> **Note**: The worker is required for automated monitoring. The web server alone covers manual runs triggered from the dashboard.

## Usage

### Dashboard

- **Developer** (`/dashboard`) — site list with health status, manual test triggering, run history, incidents
- **Governor** (`/gov`) — portfolio-level KPI dashboard, daily brief, directives
- **Report** (`/report/[runId]`) — full run report with AI summary, per-element screenshots, console + network breakdown
- **Live view** (`/live/[runId]`) — real-time CDP screencast while a manual run executes

Login with the seeded demo credentials (printed at the end of `npm run seed`).

## Project Structure

```
├── docs/                     # Audits, design notes
├── prisma/
│   ├── schema.prisma         # DB schema (indexed)
│   └── seed.ts               # Seed data
├── public/
├── src/
│   ├── app/                  # Frontend pages + API routes (Next.js app router)
│   │   ├── api/              # auth, sites, runs, gov, artifacts, …
│   │   ├── dashboard/        # Developer dashboard
│   │   ├── gov/              # Governor dashboard
│   │   ├── live/             # Live browser view
│   │   └── report/           # Test reports
│   ├── components/           # Frontend React (layout / live / report / ui)
│   ├── lib/
│   │   └── utils.ts          # Shared frontend/backend util (tailwind cn())
│   ├── server/               # Backend logic — server-only, no React
│   │   ├── ai/ai-agent.ts            # AI prompts + heuristic-first verdict
│   │   ├── auth/auth.ts              # Session + password reset
│   │   ├── browser/
│   │   │   ├── ai-executor.ts        # Playwright execution + per-element loop
│   │   │   └── accessibility-tree.ts
│   │   ├── db/
│   │   │   ├── prisma.ts             # Prisma client singleton
│   │   │   ├── incidents.ts          # Incident grouping
│   │   │   ├── scoring.ts            # Site score computation
│   │   │   └── escalation.ts         # Incident escalation timers
│   │   ├── notifications/
│   │   │   ├── notifications.ts      # Email / Slack alerts
│   │   │   └── ably-broadcast.ts     # WS fallback over Ably (optional)
│   │   ├── ws/
│   │   │   ├── ws-server.ts          # WebSocket server
│   │   │   └── init-ws.ts
│   │   └── validators.ts             # Zod schemas + isSameDomain
│   └── worker/scheduler.ts   # node-cron scheduler + artifact retention
└── artifacts/                # Run-scoped screenshots, traces (gitignored)
```

## API Endpoints

- `POST /api/auth/login`, `/logout`, `/me`, `/forgot-password`, `/reset-password`
- `GET /api/sites`, `POST /api/sites` — list / create monitored site
- `GET /api/sites/[id]`, `DELETE /api/sites/[id]`
- `POST /api/sites/[id]/runs` — queue a manual run
- `GET /api/sites/[id]/runs/[runId]` — run details
- `POST /api/runs/[runId]/start` — execute a queued run (called by live view)
- `GET /api/runs/[runId]/status`, `GET /api/runs/[runId]/elements`
- `GET /api/gov/...` — governor dashboard endpoints
- `GET /api/artifacts/[...path]` — serve screenshots / traces

## Safety Features

The system enforces strict safety rules:

❌ **Never:**
- Bypass CAPTCHA, MFA, or OTP
- Submit forms or create records
- Navigate outside target domain
- Click destructive buttons (delete, remove, etc.)
- Execute arbitrary JavaScript
- Download files from target sites

✅ **Always:**
- Same-domain enforcement
- Black-box testing only
- Read-only operations
- Safe selectors and actions

## Pre-Seeded Sites

The system seeds 10 Saudi government websites: Absher, Unified National Platform (my.gov.sa), Ministry of Health, Qiwa, Hadaf, Tawakkalna, Unified Admission (rbu.edu.sa), Balady, Taminaty (GOSI), and Najiz. See `prisma/seed.ts` for the full list.

## Development Commands

```bash
npm run dev          # Start Next.js dev server
npm run worker       # Start background worker for automated monitoring
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push schema to database
npm run db:studio    # Open Prisma Studio
npm run seed         # Seed database with government sites
npm run setup        # Install Playwright browsers (run once)
```

## WebSocket Protocol

The worker process exposes a WebSocket server (default port `3003`, override with `WORKER_PORT`) that the live view connects to:

- `ws://localhost:3003/live/{runId}` - Connect to run stream

Message types:
- `browser-frame` - JPEG frame from CDP screencast
- `step-update` - Test step status update
- `run-status` - Overall run status
- `run-complete` - Run finished with summary

## License

MIT

## Credits

Built with ❤️ using Claude Code
