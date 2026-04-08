# GovWatch - AI-Powered Government Website Monitoring

Real-time monitoring of Saudi government websites with live browser streaming and AI-powered analysis.

## Features

- ✅ **Live Browser View**: Watch AI agents browse websites in real-time via CDP screencast
- ✅ **AI-Powered Analysis**: Automatic test generation and summaries using Claude AI
- ✅ **Instant Testing**: Test any government website URL instantly
- ✅ **Continuous Monitoring**: Automated monitoring of pre-seeded Saudi government sites
- ✅ **Incident Detection**: Automatic grouping and severity assessment of failures
- ✅ **Safe & Secure**: Black-box testing only, same-domain enforcement, no destructive actions

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Database**: SQLite + Prisma ORM
- **Browser Automation**: Playwright (Chromium)
- **Live Streaming**: CDP Screencast + WebSocket
- **AI**: Claude (Anthropic) / GPT-4 (OpenAI)
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

This will create the SQLite database and seed 5 Saudi government websites.

### 3. Configure Environment (Optional)

Add your Claude API key to `.env` for AI-powered features:

```env
ANTHROPIC_API_KEY="your-claude-api-key"
```

The system works without AI keys using template-based summaries.

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

> **Note**: The worker is optional. You can use the platform without it by manually triggering tests from the dashboard or instant test feature.

## Usage

### Instant Test

1. Go to the homepage
2. Enter any government website URL (e.g., `https://www.absher.sa`)
3. Click "Start Test"
4. Watch the live browser stream as tests execute
5. View the AI-generated report

### Dashboard

Visit `/dashboard` to see all monitored government websites with:
- Real-time health status
- Success rates
- Open incidents
- Manual test triggering

## Project Structure

```
├── src/
│   ├── app/                  # Next.js app router pages
│   │   ├── api/             # API routes
│   │   ├── dashboard/       # Dashboard UI
│   │   ├── live/           # Live browser view
│   │   └── report/         # Test reports
│   ├── components/          # React components
│   │   └── ui/             # shadcn/ui components
│   └── lib/                 # Core libraries
│       ├── executor.ts      # Playwright test executor
│       ├── page-analyzer.ts # Page structure analyzer
│       ├── test-generator.ts # Test generation (heuristic)
│       ├── test-generator-ai.ts # AI-enhanced test generation
│       ├── ai.ts           # AI provider abstraction
│       ├── ai-summary.ts   # AI summary generation
│       ├── ws-server.ts    # WebSocket server
│       ├── incidents.ts    # Incident detection
│       ├── validators.ts   # Zod schemas
│       └── prisma.ts       # Prisma client
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts            # Seed data
└── artifacts/             # Test artifacts (screenshots, traces)
```

## API Endpoints

- `GET /api/sites` - List all sites
- `POST /api/sites` - Create new site
- `GET /api/sites/[id]` - Get site details
- `POST /api/sites/[id]/runs` - Trigger test run
- `GET /api/sites/[id]/runs/[runId]` - Get run details
- `POST /api/test` - Instant test for any URL
- `GET /api/incidents` - List incidents
- `GET /api/artifacts/[...path]` - Serve artifact files

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

The system comes pre-configured with these Saudi government websites:

1. **Absher** (أبشر) - https://www.absher.sa
2. **Unified National Platform** (المنصة الوطنية الموحدة) - https://www.my.gov.sa
3. **Ministry of Health** (وزارة الصحة) - https://www.moh.gov.sa
4. **Qiwa** (قوى) - https://qiwa.sa
5. **Saudi Digital Academy** (الأكاديمية الرقمية السعودية) - https://sda.edu.sa

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

The live view uses WebSocket for real-time updates:

- `ws://localhost:3001/live/{runId}` - Connect to run stream

Message types:
- `browser-frame` - JPEG frame from CDP screencast
- `step-update` - Test step status update
- `run-status` - Overall run status
- `run-complete` - Run finished with summary

## License

MIT

## Credits

Built with ❤️ using Claude Code
