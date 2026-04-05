# GovWatch — Current Status

## ✅ Application is LIVE and RUNNING

### Services Status

| Service | Port | Status | URL |
|---------|------|--------|-----|
| **Next.js Dev Server** | 3000 | ✅ Running | http://localhost:3000 |
| **WebSocket Server** | 3003 | ✅ Running | ws://localhost:3003 |
| **Worker Scheduler** | N/A | ✅ Running | Background process |

### Quick Links

- **Landing Page**: http://localhost:3000
- **Dashboard**: http://localhost:3000/dashboard
- **Database Studio**: Run `npm run db:studio` to open Prisma Studio

---

## 🎯 What You Can Do Now

### 1. Test the Quick Website Test Flow

1. Go to http://localhost:3000
2. Enter a government website URL, for example:
   - `https://www.absher.sa`
   - `https://www.moh.gov.sa`
   - `https://www.my.gov.sa`
3. Click **"Start Test"**
4. Watch the **Live Browser View** with real-time CDP Screencast
5. See the test report with AI summary when complete

### 2. View the Monitoring Dashboard

1. Go to http://localhost:3000/dashboard
2. See all 5 pre-seeded Saudi government websites:
   - Absher (أبشر)
   - Unified National Platform (المنصة الوطنية الموحدة)
   - Ministry of Health (وزارة الصحة)
   - Qiwa (قوى)
   - Saudi Digital Academy (الأكاديمية الرقمية السعودية)
3. View real-time status, success rates, and incidents
4. Click any site to see detailed metrics

### 3. Watch a Live Test

1. From the dashboard, click any site card
2. Click **"Run Now"** to trigger a manual test
3. Click **"Watch Live"** to see the browser stream in real-time

---

## 🔍 System Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (http://localhost:3000)            │
│  - Landing Page                             │
│  - Dashboard                                │
│  - Live View                                │
│  - Report                                   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Next.js Server (:3000)                     │
│  - API Routes                               │
│  - Server Components                        │
└──────────────┬──────────────────────────────┘
               │
               ├──► SQLite DB (prisma/dev.db)
               │
               └──► WebSocket Client Connection
                              │
                              ▼
               ┌────────────────────────────────┐
               │ WebSocket Server (:3003)       │
               │ - Real-time frame broadcast    │
               │ - CDP Screencast relay         │
               └──────────────┬─────────────────┘
                              │
                              ▼
               ┌────────────────────────────────┐
               │ Worker Process                 │
               │ - node-cron scheduler          │
               │ - Playwright executor          │
               │ - AI agent                     │
               │ - Chrome DevTools Protocol     │
               └────────────────────────────────┘
```

---

## 📊 Database Contents

The database is pre-seeded with 5 Saudi government websites:

| Site | URL | Schedule | Status |
|------|-----|----------|--------|
| Absher | https://www.absher.sa | Every 10 min | Healthy |
| Unified National Platform | https://www.my.gov.sa | Every 10 min | Degraded |
| Ministry of Health | https://www.moh.gov.sa | Every 10 min | Degraded |
| Qiwa | https://qiwa.sa | Every 10 min | Degraded |
| Saudi Digital Academy | https://sda.edu.sa | Every 10 min | Degraded |

---

## 🔧 Key Features Working

### ✅ Fully Implemented

- [x] **Live Browser Streaming** via CDP Screencast
- [x] **Real-time WebSocket** communication
- [x] **AI-Powered Test Generation** (Claude/OpenAI/Template)
- [x] **Automated Scheduling** (every 10 minutes)
- [x] **Incident Detection** and grouping
- [x] **Rich Artifacts** (screenshots, traces, console, network)
- [x] **Dual Language Support** (English + Arabic)
- [x] **Safety Enforcement** (same-domain, no CAPTCHA bypass)
- [x] **Interactive Dashboard** with metrics
- [x] **Detailed Test Reports** with AI summaries

---

## 🛠️ Development Commands

```bash
# View all running processes
ps aux | grep -E "next|worker|tsx"

# Stop all services
pkill -f "next dev"
pkill -f scheduler

# Restart everything
./start-dev.sh

# Check WebSocket server
lsof -i :3003

# Check Next.js server
lsof -i :3000

# View database
npm run db:studio

# Check logs
# Worker logs: Check the terminal running `npm run worker`
# Next.js logs: Check the terminal running `npm run dev`
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `src/worker/scheduler.ts` | Background worker + WebSocket init |
| `src/lib/executor.ts` | Playwright executor with CDP Screencast |
| `src/lib/ws-server.ts` | WebSocket server for live streaming |
| `src/app/live/[runId]/page.tsx` | Live browser view UI |
| `src/components/live/LiveView.tsx` | Live streaming component |
| `prisma/schema.prisma` | Database schema |
| `.env` | Environment configuration |

---

## 🎬 Live Browser Streaming

### How It Works

1. **Playwright** launches Chromium
2. **CDP Screencast** captures JPEG frames at ~10 fps
3. Frames sent to **WebSocket server** (port 3003)
4. **React UI** receives frames and displays them
5. **Animated cursor** shows what the AI agent is clicking

### WebSocket Messages

The system broadcasts these message types:

```typescript
// Browser frame (base64 JPEG)
{ type: "browser-frame", image: "data:image/jpeg;base64,..." }

// Step progress
{ type: "step-update", step: { index, action, description, status, durationMs } }

// Run status change
{ type: "run-status", status: "running" | "passed" | "failed" }

// Test completion
{ type: "run-complete", status: "passed" | "failed", summary: {...} }

// Cursor animation
{ type: "cursor_move", data: { x, y, elementText, elementType } }
{ type: "cursor_click" }
```

---

## 🧪 Testing Checklist

### Test 1: Quick URL Test ✅

- [x] Go to http://localhost:3000
- [x] Enter `https://www.moh.gov.sa`
- [x] Click "Start Test"
- [x] See live browser stream
- [x] See step progress panel
- [x] Auto-redirect to report
- [x] View AI summary
- [x] Check artifacts (screenshots, trace, logs)

### Test 2: Dashboard Monitoring ✅

- [x] Go to http://localhost:3000/dashboard
- [x] See all 5 sites with status badges
- [x] Click a site card
- [x] View run history
- [x] Trigger manual run
- [x] Watch live test

### Test 3: Worker Scheduler ✅

- [x] Worker is running
- [x] WebSocket server is initialized
- [x] Scheduled tests run every 10 minutes
- [x] Incidents are created for failures
- [x] Site status updates automatically

---

## 🚀 Next Steps

### Immediate Improvements

1. **Error Handling**: Add better error boundaries and fallback UI
2. **Loading States**: Add skeletons for better UX
3. **Responsive Design**: Optimize for mobile devices
4. **Performance**: Implement pagination for run history
5. **Real-time Updates**: Use SWR or React Query for auto-refresh

### Feature Enhancements

1. **Multi-browser**: Support Firefox and WebKit
2. **Screenshot Diffing**: Visual regression detection
3. **Notifications**: Slack/Teams/Email alerts
4. **Custom Journeys**: No-code test builder
5. **API Monitoring**: JSON endpoint testing
6. **Performance Budgets**: Lighthouse metrics integration

---

## 📞 Support

If you encounter issues:

1. Check the [Troubleshooting](#-development-commands) section
2. Review logs in the terminal windows
3. Restart services: `pkill -f "next\|worker" && ./start-dev.sh`
4. Check the comprehensive README: `README_COMPLETE.md`

---

## 🎉 Success Indicators

You should see:

✅ WebSocket server console showing: `✅ WebSocket server running on ws://localhost:3003`
✅ Next.js showing: `✓ Ready in XXXXms`
✅ Dashboard loading with 5 sites
✅ Live view streaming browser frames
✅ Test reports with AI summaries
✅ Worker scheduler running in background

---

**The application is fully functional and ready for testing!**

**Start here**: http://localhost:3000

