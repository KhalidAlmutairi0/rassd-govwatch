# GovWatch — Complete Implementation Prompt
## AI-Powered Black-Box Monitoring Platform for Saudi Government Websites

---

## ROLE & CONTEXT

You are **Claude Code** acting as:
- Senior Full-Stack Engineer
- Solution Architect
- Product-minded Engineer

Your task: Build a **fully working MVP** — a platform that continuously monitors Saudi government websites using real browser automation, with a **live browser view** that shows the AI agent browsing in real-time, and generates AI-powered reports.

**Inspired by:** [qa.tech](https://qa.tech/) — match their clean, modern UI style.

---

## TABLE OF CONTENTS

1. [Product Vision](#1-product-vision)
2. [Hard Constraints & Safety Rules](#2-hard-constraints--safety-rules)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Database Schema](#5-database-schema)
6. [Feature 1: Live Government QA Dashboard](#6-feature-1-live-government-qa-dashboard)
7. [Feature 2: URL → AI Agent → Instant Test](#7-feature-2-url--ai-agent--instant-test)
8. [Feature 3: Live Browser View (Real-time Stream)](#8-feature-3-live-browser-view-real-time-stream)
9. [AI Agent Architecture](#9-ai-agent-architecture)
10. [Auto Test Generation Engine](#10-auto-test-generation-engine)
11. [Playwright Executor (Deterministic & Safe)](#11-playwright-executor-deterministic--safe)
12. [Incident Detection & Grouping](#12-incident-detection--grouping)
13. [AI Summary Generation](#13-ai-summary-generation)
14. [Scheduler & Worker](#14-scheduler--worker)
15. [Artifact Storage](#15-artifact-storage)
16. [UI Pages & Design System](#16-ui-pages--design-system)
17. [API Routes](#17-api-routes)
18. [Project Structure](#18-project-structure)
19. [Seed Data](#19-seed-data)
20. [Implementation Order (Step-by-Step)](#20-implementation-order-step-by-step)
21. [Commands](#21-commands)
22. [Environment Variables](#22-environment-variables)
23. [Error Handling & Edge Cases](#23-error-handling--edge-cases)
24. [Performance Requirements](#24-performance-requirements)

---

## 1. PRODUCT VISION

### What is GovWatch?

A platform that acts like a **tireless QA engineer** who continuously visits Saudi government websites every 10 minutes, checks if everything works, and reports problems with AI-powered explanations — all visible in real-time through a live browser stream.

### Two Main Sections:

**Section A — Live Monitoring Dashboard**
- 5 pre-seeded Saudi government websites
- Automated QA runs every 10 minutes
- Each run simulates a real user with a real browser
- Dashboard shows live status, metrics, and incidents
- Users can watch the agent browse in real-time

**Section B — URL → Instant Test**
- User enters any URL
- System generates a temporary AI agent
- Agent explores the site safely and generates smoke tests
- Runs tests immediately with a live browser view
- Produces an actionable report with AI summary
- Option to enable continuous monitoring

### Key Differentiator: LIVE BROWSER VIEW
When any test runs, users see the actual browser navigating the website in real-time — like watching someone use a computer. Next to it, a step-by-step log updates live showing what the agent is doing.

---

## 2. HARD CONSTRAINTS & SAFETY RULES

These are NON-NEGOTIABLE. The system must enforce them at every layer.

### Black-Box Only
```
✅ We have NO access to source code, repositories, APIs, or server logs
✅ All testing via REAL browser automation (Playwright + Chromium)
✅ We ONLY collect browser-side evidence
```

### Evidence We CAN Collect
```
✅ Screenshots (per step + full page)
✅ Playwright traces (.zip)
✅ Optional video recording
✅ Browser console logs (errors, warnings, info)
✅ Network request/response summary (URLs, status codes, timings, sizes)
✅ Page performance metrics (load time, DOM ready, etc.)
```

### Things We MUST NEVER Do
```
❌ Bypass CAPTCHA, MFA, Nafath, OTP, or WAF
❌ Submit destructive forms or create real records
❌ Navigate outside the target domain (same-domain enforcement)
❌ Execute arbitrary JavaScript via page.evaluate()
❌ Download files from target websites
❌ Accept alert/confirm/prompt dialogs blindly
❌ Brute-force or abuse rate limits
❌ Store credentials or sensitive data
❌ Click "delete", "remove", "submit payment" or similar destructive buttons
```

### Domain Safety Enforcement
```typescript
// EVERY navigation must pass this check
function isSameDomain(currentUrl: string, targetUrl: string): boolean {
  const current = new URL(currentUrl);
  const target = new URL(targetUrl);
  return target.hostname === current.hostname || 
         target.hostname.endsWith('.' + current.hostname);
}
```

---

## 3. SYSTEM ARCHITECTURE

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│                                                                  │
│  Landing Page  │  Dashboard  │  Site Detail  │  Run Report      │
│                │             │               │  + Live View      │
└───────┬────────┴──────┬──────┴───────┬───────┴──────┬───────────┘
        │               │              │              │
        │  REST API      │  REST API    │  WebSocket    │
        │               │              │  (live frames) │
        ▼               ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Next.js API + WS Server)           │
│                                                                  │
│  API Routes  │  WebSocket Server (:3001)  │  AI Service          │
│  (CRUD)      │  (CDP Screencast relay)    │  (Claude/OpenAI)     │
└───────┬──────┴────────────┬───────────────┴──────┬──────────────┘
        │                   │                      │
        ▼                   ▼                      │
┌──────────────┐  ┌──────────────────┐             │
│   Prisma     │  │  Playwright      │◄────────────┘
│   SQLite     │  │  Executor        │
│   (dev.db)   │  │  (Chromium)      │
└──────────────┘  │  + CDP Screencast│
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Target Websites │
                  │  (absher.sa,     │
                  │   moh.gov.sa,    │
                  │   etc.)          │
                  └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     WORKER (Separate Process)                    │
│                                                                  │
│  node-cron scheduler → triggers runs every N minutes             │
│  Runs Playwright executor for each active site                   │
│  Processes results → incidents → AI summaries                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     ARTIFACT STORAGE (Local FS)                  │
│                                                                  │
│  /artifacts/{siteId}/{runId}/                                    │
│    ├── step-0.png                                                │
│    ├── step-1.png                                                │
│    ├── trace.zip                                                 │
│    ├── video.webm (optional)                                     │
│    ├── console.json                                              │
│    └── network.json                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow for a Single Run

```
1. Scheduler triggers run for Site X, Journey Y
2. Playwright Executor launches headless Chromium
3. CDP Screencast starts → frames sent to WebSocket server
4. WebSocket server relays frames to any connected dashboard clients
5. Executor runs each step sequentially:
   a. Execute action (navigate, click, type, assert)
   b. Take screenshot
   c. Record console logs + network activity
   d. Send step status update via WebSocket
   e. Store results in DB
6. After all steps complete:
   a. Save trace file
   b. Save all artifacts to /artifacts/
   c. Call AI service for executive summary
   d. Process incident logic (create/update/resolve)
   e. Update run status in DB
   f. Send "run complete" via WebSocket
7. Dashboard updates automatically
```

---

## 4. TECH STACK

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 14 (App Router) | Full-stack, SSR, API routes |
| **Language** | TypeScript (strict) | Type safety |
| **Styling** | TailwindCSS 3.4+ | Utility-first, rapid UI |
| **Components** | shadcn/ui | Polished, accessible components |
| **Database** | SQLite + Prisma ORM | Zero-config local MVP |
| **Browser** | Playwright (Chromium) | Best automation library |
| **Live Stream** | CDP Screencast + WebSocket | Real-time browser frames |
| **WebSocket** | `ws` library | Lightweight WS server |
| **Scheduler** | `node-cron` | Simple, reliable cron |
| **AI (Primary)** | Claude API (Sonnet 4) | Best analysis quality |
| **AI (Fallback)** | OpenAI GPT-4o-mini | Cheaper alternative |
| **AI (No-key)** | Template-based | Works without any API key |
| **HTML Parser** | Cheerio | Extract page metadata |
| **Validation** | Zod | Schema validation for test steps |
| **Icons** | Lucide React | Clean icon set |

### NPM Dependencies

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "@prisma/client": "^5.14.0",
    "playwright": "^1.44.0",
    "ws": "^8.17.0",
    "node-cron": "^3.0.0",
    "cheerio": "^1.0.0",
    "zod": "^3.23.0",
    "@anthropic-ai/sdk": "^0.24.0",
    "openai": "^4.50.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "lucide-react": "^0.380.0",
    "date-fns": "^3.6.0"
  },
  "devDependencies": {
    "prisma": "^5.14.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/ws": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 5. DATABASE SCHEMA

```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ============================================
// SITE — A government website being monitored
// ============================================
model Site {
  id          String    @id @default(cuid())
  name        String                          // "Absher"
  nameAr      String?                         // "أبشر"
  baseUrl     String                          // "https://www.absher.sa"
  description String?                         // Brief description
  schedule    Int       @default(10)          // Run interval in minutes (0 = manual only)
  isPreset    Boolean   @default(false)       // Seed data site
  isActive    Boolean   @default(true)        // Monitoring enabled
  status      String    @default("unknown")   // unknown | healthy | degraded | down
  lastRunAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  journeys    Journey[]
  runs        Run[]
  incidents   Incident[]
}

// ============================================
// JOURNEY — A test scenario for a site
// ============================================
model Journey {
  id          String   @id @default(cuid())
  siteId      String
  name        String                          // "Homepage Smoke Test"
  type        String   @default("smoke")      // smoke | navigation | search | form | custom
  stepsJson   String                          // JSON array of TestStep objects
  isDefault   Boolean  @default(false)        // Auto-generated default journey
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  runs        Run[]
  incidents   Incident[]
}

// ============================================
// RUN — A single execution of a journey
// ============================================
model Run {
  id          String    @id @default(cuid())
  siteId      String
  journeyId   String
  status      String    @default("queued")    // queued | running | passed | failed | error | timeout
  durationMs  Int?
  totalSteps  Int       @default(0)
  passedSteps Int       @default(0)
  failedSteps Int       @default(0)
  summaryJson String?                         // AI-generated summary
  errorJson   String?                         // Top-level error if run crashed
  triggeredBy String    @default("scheduler") // scheduler | manual | api
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?

  site        Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  journey     Journey   @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  steps       RunStep[]
  artifacts   Artifact[]
}

// ============================================
// RUN STEP — Individual step within a run
// ============================================
model RunStep {
  id             String  @id @default(cuid())
  runId          String
  stepIndex      Int                          // 0-based order
  action         String                       // navigate | click | type | assert_title | assert_element | screenshot | detect_search | detect_forms | discover_links
  description    String                       // Human-readable: "Open homepage"
  selector       String?                      // CSS selector if applicable
  value          String?                      // Input value if applicable
  url            String?                      // Target URL if applicable
  status         String  @default("pending")  // pending | running | passed | failed | skipped
  durationMs     Int?
  screenshotPath String?
  error          String?                      // Error message if failed
  metadata       String?                      // JSON: extra data (found links, form fields, etc.)

  run            Run     @relation(fields: [runId], references: [id], onDelete: Cascade)
}

// ============================================
// ARTIFACT — Files generated during a run
// ============================================
model Artifact {
  id        String @id @default(cuid())
  runId     String
  type      String                            // screenshot | trace | video | console | network | har
  path      String                            // Relative path: artifacts/{siteId}/{runId}/trace.zip
  sizeBytes Int?
  createdAt DateTime @default(now())

  run       Run    @relation(fields: [runId], references: [id], onDelete: Cascade)
}

// ============================================
// INCIDENT — Grouped failures for a journey
// ============================================
model Incident {
  id          String    @id @default(cuid())
  siteId      String
  journeyId   String?
  title       String                          // "Homepage Smoke Test failing"
  description String?                         // AI-generated incident description
  status      String    @default("open")      // open | investigating | resolved
  severity    String    @default("medium")    // low | medium | high | critical
  occurrences Int       @default(1)           // Number of consecutive failures
  firstSeenAt DateTime  @default(now())
  lastSeenAt  DateTime  @default(now())
  resolvedAt  DateTime?

  site        Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  journey     Journey?  @relation(fields: [journeyId], references: [id])
}
```

---

## 6. FEATURE 1: LIVE GOVERNMENT QA DASHBOARD

### Overview
A dashboard showing the health of 5 pre-seeded Saudi government websites with real-time status updates.

### Dashboard Cards — Each Site Shows:
| Metric | Description |
|--------|------------|
| **Status Badge** | 🟢 Healthy / 🟡 Degraded / 🔴 Down / ⚪ Unknown |
| **Last Run** | "2 minutes ago" — relative time |
| **Success Rate (24h)** | Percentage of passing runs in last 24 hours |
| **Success Rate (7d)** | Percentage of passing runs in last 7 days |
| **Avg Duration** | Average run duration in last 24h |
| **Open Incidents** | Count of unresolved incidents |
| **Last Error** | Brief description of most recent failure (if any) |

### Status Logic
```typescript
function calculateSiteStatus(site: Site): "healthy" | "degraded" | "down" | "unknown" {
  const recentRuns = getLast10Runs(site.id);
  
  if (recentRuns.length === 0) return "unknown";
  
  const lastRun = recentRuns[0];
  const successRate = recentRuns.filter(r => r.status === "passed").length / recentRuns.length;
  
  if (lastRun.status === "passed" && successRate >= 0.9) return "healthy";
  if (successRate >= 0.5) return "degraded";
  return "down";
}
```

### Dashboard Tabs
1. **Overview** — Site cards grid with status + metrics
2. **All Runs** — Chronological table of all runs across all sites
3. **Incidents** — Active incidents with severity badges

### Live Updates
- Dashboard polls every 30 seconds for status updates
- When a run is in progress, user can click "Watch Live" to see the browser stream

---

## 7. FEATURE 2: URL → AI AGENT → INSTANT TEST

### Flow

```
User enters URL ──► Validate URL ──► Create temporary Site record
                                          │
                    ┌─────────────────────┘
                    ▼
            Launch Playwright
            Open URL in browser
            Start CDP Screencast ──► WebSocket ──► Live View in UI
                    │
                    ▼
            Page Analyzer (Cheerio)
            Extract: title, links, search, forms, language
                    │
                    ▼
            AI Planner (Claude/GPT/Heuristic)
            Generate test steps as JSON
                    │
                    ▼
            Step Validator (Zod)
            Verify all steps are safe
                    │
                    ▼
            Execute steps one-by-one
            Screenshot each step
            Broadcast progress via WebSocket
                    │
                    ▼
            AI Summarizer
            Generate executive summary (EN + AR)
                    │
                    ▼
            Show full report to user
            Option: Enable continuous monitoring
```

### UI for URL Input
- Large input field centered on landing page
- Placeholder: "Enter any government website URL..."
- Button: "Start Test" (black, rounded)
- After clicking:
  - Redirect to a live run page
  - Show browser stream + step progress
  - When complete, transition to full report

---

## 8. FEATURE 3: LIVE BROWSER VIEW (Real-time Stream)

### THIS IS A CORE FEATURE — NOT OPTIONAL

When any test run executes, the user MUST be able to watch the browser navigate in real-time, like watching a screen share.

### Technical Implementation: CDP Screencast

Chrome DevTools Protocol provides a built-in screencast feature that captures JPEG frames directly from the browser rendering pipeline — no VNC, no external tools needed.

### Backend: WebSocket Server + CDP Screencast

```typescript
// src/lib/ws-server.ts
import { WebSocketServer, WebSocket } from "ws";

interface LiveSession {
  runId: string;
  clients: Set<WebSocket>;
}

const sessions = new Map<string, LiveSession>();
let wss: WebSocketServer | null = null;

export function initWebSocketServer(port: number = 3001) {
  wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    // URL format: ws://localhost:3001/live/{runId}
    const url = new URL(req.url!, `http://localhost:${port}`);
    const pathParts = url.pathname.split("/");
    const runId = pathParts[pathParts.length - 1];

    if (!runId) {
      ws.close(1008, "Missing runId");
      return;
    }

    // Register client to session
    let session = sessions.get(runId);
    if (!session) {
      session = { runId, clients: new Set() };
      sessions.set(runId, session);
    }
    session.clients.add(ws);

    ws.on("close", () => {
      session?.clients.delete(ws);
      if (session?.clients.size === 0) {
        sessions.delete(runId);
      }
    });
  });

  console.log(`WebSocket server running on ws://localhost:${port}`);
  return wss;
}

// Broadcast a message to all clients watching a specific run
export function broadcast(runId: string, message: object) {
  const session = sessions.get(runId);
  if (!session) return;

  const data = JSON.stringify(message);
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Broadcast types:
// { type: "browser-frame", image: "data:image/jpeg;base64,..." }
// { type: "step-update", step: { index, action, description, status, durationMs } }
// { type: "step-log", log: { level, message, timestamp } }
// { type: "run-status", status: "running" | "passed" | "failed" }
// { type: "run-complete", summary: { ... } }
```

### Playwright Executor with CDP Screencast

```typescript
// Inside the executor, when starting a run:
async startScreencast(runId: string) {
  const cdp = await this.page.context().newCDPSession(this.page);

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 50,           // Good balance of quality vs bandwidth
    maxWidth: 1280,
    maxHeight: 720,
    everyNthFrame: 3,      // ~10fps — smooth enough for monitoring
  });

  cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
    // Relay frame to all watching clients
    broadcast(runId, {
      type: "browser-frame",
      image: `data:image/jpeg;base64,${data}`,
      timestamp: metadata.timestamp,
    });

    // Acknowledge frame so Chrome sends the next one
    await cdp.send("Page.screencastFrameAck", { sessionId });
  });

  return cdp;
}

async stopScreencast(cdp: CDPSession) {
  await cdp.send("Page.stopScreencast");
}
```

### Frontend: LiveView Component

```tsx
// src/components/live/LiveView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StepStatus {
  index: number;
  action: string;
  description: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  durationMs?: number;
  error?: string;
}

interface LiveViewProps {
  runId: string;
  onComplete?: (summary: any) => void;
}

export function LiveView({ runId, onComplete }: LiveViewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [runStatus, setRunStatus] = useState<string>("connecting");
  const [elapsed, setElapsed] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001"}/live/${runId}`
    );
    wsRef.current = ws;

    // Start elapsed timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    ws.onopen = () => setRunStatus("running");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "browser-frame":
          setFrame(data.image);
          break;

        case "step-update":
          setSteps((prev) => {
            const updated = [...prev];
            // Ensure array is large enough
            while (updated.length <= data.step.index) {
              updated.push({
                index: updated.length,
                action: "",
                description: "",
                status: "pending",
              });
            }
            updated[data.step.index] = data.step;
            return updated;
          });
          break;

        case "run-status":
          setRunStatus(data.status);
          break;

        case "run-complete":
          setRunStatus(data.status || "completed");
          if (timerRef.current) clearInterval(timerRef.current);
          onComplete?.(data.summary);
          break;
      }
    };

    ws.onerror = () => setRunStatus("error");
    ws.onclose = () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };

    return () => {
      ws.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [runId]);

  const completedSteps = steps.filter(
    (s) => s.status === "passed" || s.status === "failed" || s.status === "skipped"
  ).length;
  const totalSteps = steps.length || 1;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const statusIcon = (status: string) => {
    switch (status) {
      case "passed": return "✅";
      case "failed": return "❌";
      case "running": return "⏳";
      case "skipped": return "⏭️";
      default: return "🔲";
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Layout: Browser + Steps Side Panel */}
      <div className="flex gap-4 h-[520px]">

        {/* LEFT: Browser Live View */}
        <div className="flex-1 relative rounded-xl overflow-hidden border bg-gray-950">
          {/* Live Badge */}
          {runStatus === "running" && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>
          )}

          {/* Elapsed Time */}
          <div className="absolute top-3 right-3 z-10 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-mono">
            ⏱️ {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </div>

          {/* Browser Frame */}
          {frame ? (
            <img
              src={frame}
              alt="Live browser view"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
              <p className="text-sm">Connecting to browser...</p>
            </div>
          )}
        </div>

        {/* RIGHT: Steps Panel */}
        <div className="w-80 border rounded-xl flex flex-col bg-white">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Test Steps</h3>
            <p className="text-xs text-gray-500 mt-1">
              {completedSteps}/{totalSteps} completed
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {steps.map((step, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 rounded-lg text-sm transition-all",
                  step.status === "running" && "bg-blue-50 border border-blue-200 shadow-sm",
                  step.status === "passed" && "bg-green-50/50",
                  step.status === "failed" && "bg-red-50/50",
                  step.status === "pending" && "opacity-50"
                )}
              >
                <span className="text-base mt-0.5 shrink-0">
                  {statusIcon(step.status)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {step.description || step.action}
                  </p>
                  {step.durationMs && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(step.durationMs / 1000).toFixed(1)}s
                    </p>
                  )}
                  {step.error && (
                    <p className="text-xs text-red-600 mt-1 line-clamp-2">
                      {step.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM: Progress Bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-500 mb-1.5">
          <span>
            Step {completedSteps}/{totalSteps}
            {runStatus === "running" && " — Running..."}
            {runStatus === "passed" && " — ✅ All tests passed"}
            {runStatus === "failed" && " — ❌ Some tests failed"}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-700 ease-out rounded-full",
              runStatus === "passed"
                ? "bg-green-500"
                : runStatus === "failed"
                ? "bg-gradient-to-r from-green-500 to-red-500"
                : "bg-gradient-to-r from-blue-500 to-violet-500"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
```

### Live View Layout in Dashboard

```
┌────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard        Run #abc123       🔴 LIVE          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────┐  ┌──────────────────┐ │
│  │                                     │  │ Test Steps       │ │
│  │                                     │  │                  │ │
│  │     🖥️ LIVE BROWSER VIEW            │  │ ✅ 1. Open page  │ │
│  │                                     │  │    2.1s          │ │
│  │  (Real-time JPEG frames from        │  │                  │ │
│  │   CDP Screencast via WebSocket)     │  │ ⏳ 2. Click nav  │ │
│  │                                     │  │    ...           │ │
│  │                                     │  │                  │ │
│  │  ┌──────────┐          ⏱️ 0:14      │  │ 🔲 3. Search     │ │
│  │  │ 🔴 LIVE  │                       │  │                  │ │
│  │  └──────────┘                       │  │ 🔲 4. Forms      │ │
│  │                                     │  │                  │ │
│  └─────────────────────────────────────┘  └──────────────────┘ │
│                                                                 │
│  Step 2/5  ████████████░░░░░░░  40%        Running...          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. AI AGENT ARCHITECTURE

### Critical Design Principle

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  AI = BRAIN ONLY (Planner + Analyst)                 │
│  Playwright Executor = HANDS ONLY (Controlled)       │
│  Zod Validator = SAFETY GATE (Between them)          │
│                                                      │
│  AI ──► generates steps JSON                         │
│              │                                       │
│              ▼                                       │
│         Zod Validator ──► rejects unsafe steps       │
│              │                                       │
│              ▼                                       │
│      Playwright Executor ──► runs steps safely       │
│                                                      │
│  AI NEVER directly controls the browser.             │
│  AI NEVER executes arbitrary actions.                │
│  AI NEVER bypasses the safety gate.                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### What AI DOES:
| Responsibility | Description |
|----------------|------------|
| **Plan Tests** | Analyze page metadata → propose test steps |
| **Classify Errors** | Categorize failures (network, UI, timeout, etc.) |
| **Summarize Runs** | Generate executive-friendly explanations (EN + AR) |
| **Assess Severity** | Rate incident severity based on what failed |
| **Suggest Fixes** | Recommend what the site owner should investigate |

### What AI DOES NOT DO:
| Forbidden | Why |
|-----------|-----|
| Directly control browser | Unpredictable, unsafe |
| Execute arbitrary code | Security risk |
| Navigate freely | Could leave target domain |
| Decide to submit forms | Could create real records |
| Bypass CAPTCHA | Against rules |

### AI Provider Configuration

```typescript
// src/lib/ai.ts
type AIProvider = "claude" | "openai" | "template";

function getAIProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "template";
}

// Claude implementation
async function callClaude(prompt: string): Promise<string> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

// OpenAI implementation
async function callOpenAI(prompt: string): Promise<string> {
  const openai = new OpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
  });
  return response.choices[0].message.content || "";
}

// Template fallback (no API key needed)
function templateSummary(run: Run, steps: RunStep[]): string {
  const passed = steps.filter((s) => s.status === "passed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const errors = steps.filter((s) => s.error).map((s) => s.error);
  
  if (failed === 0) {
    return `All ${passed} test steps passed successfully in ${(run.durationMs! / 1000).toFixed(1)}s. The website is functioning normally.`;
  }
  return `${passed} of ${passed + failed} steps passed. ${failed} step(s) failed. Issues detected: ${errors.join("; ")}. Duration: ${(run.durationMs! / 1000).toFixed(1)}s.`;
}
```

---

## 10. AUTO TEST GENERATION ENGINE

### Two Modes

**Mode A: Heuristic (Default, No AI Needed)**
```
Playwright opens URL → Cheerio parses HTML → Apply rules → Generate steps JSON
```

**Mode B: AI-Enhanced (With API Key)**
```
Playwright opens URL → Cheerio parses HTML → Send metadata to AI → AI generates richer steps → Validate with Zod → Steps JSON
```

### Page Analyzer

```typescript
// src/lib/page-analyzer.ts
import * as cheerio from "cheerio";

interface PageMetadata {
  title: string;
  language: string;           // "ar" | "en" | "unknown"
  description: string;
  internalLinks: Array<{ text: string; href: string }>;
  searchInputs: Array<{ selector: string; placeholder: string }>;
  forms: Array<{
    action: string;
    method: string;
    fields: Array<{ name: string; type: string; required: boolean }>;
  }>;
  hasLogin: boolean;
  hasCaptcha: boolean;
  mainHeading: string;
  navigationLinks: Array<{ text: string; href: string }>;
}

export async function analyzePage(html: string, baseUrl: string): Promise<PageMetadata> {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  // Extract internal links (same domain only)
  const internalLinks: PageMetadata["internalLinks"] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.hostname === base.hostname || url.hostname.endsWith("." + base.hostname)) {
        internalLinks.push({ text: text.substring(0, 100), href: url.toString() });
      }
    } catch {}
  });

  // Extract navigation links (from nav elements)
  const navigationLinks: PageMetadata["navigationLinks"] = [];
  $("nav a[href], header a[href], [role=navigation] a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.hostname === base.hostname) {
        navigationLinks.push({ text: text.substring(0, 100), href: url.toString() });
      }
    } catch {}
  });

  // Detect search inputs
  const searchInputs: PageMetadata["searchInputs"] = [];
  $('input[type="search"], input[placeholder*="search" i], input[placeholder*="بحث"], input[name*="search" i], input[aria-label*="search" i], input[aria-label*="بحث"]').each((_, el) => {
    const placeholder = $(el).attr("placeholder") || "";
    const name = $(el).attr("name") || "";
    const type = $(el).attr("type") || "text";
    const selector = buildSelector($, el);
    searchInputs.push({ selector, placeholder: placeholder || name || type });
  });

  // Detect forms
  const forms: PageMetadata["forms"] = [];
  $("form").each((_, el) => {
    const action = $(el).attr("action") || "";
    const method = $(el).attr("method") || "GET";
    const fields: PageMetadata["forms"][0]["fields"] = [];
    $(el).find("input, select, textarea").each((_, field) => {
      fields.push({
        name: $(field).attr("name") || "",
        type: $(field).attr("type") || "text",
        required: $(field).attr("required") !== undefined,
      });
    });
    forms.push({ action, method, fields });
  });

  // Detect login/auth pages
  const hasLogin = $('input[type="password"], [class*="login"], [id*="login"], [class*="signin"]').length > 0;

  // Detect CAPTCHA
  const hasCaptcha = $('[class*="captcha"], [id*="captcha"], [class*="recaptcha"], iframe[src*="captcha"]').length > 0;

  return {
    title: $("title").text().trim(),
    language: $("html").attr("lang") || ($("html").attr("dir") === "rtl" ? "ar" : "unknown"),
    description: $('meta[name="description"]').attr("content") || "",
    internalLinks: deduplicateLinks(internalLinks).slice(0, 20),
    searchInputs,
    forms,
    hasLogin,
    hasCaptcha,
    mainHeading: $("h1").first().text().trim(),
    navigationLinks: deduplicateLinks(navigationLinks).slice(0, 10),
  };
}
```

### Test Step Generator (Heuristic Mode)

```typescript
// src/lib/test-generator.ts
import { z } from "zod";

// Zod schema for a test step
const TestStepSchema = z.object({
  action: z.enum([
    "navigate", "click", "type", "assert_title", "assert_element",
    "assert_url", "screenshot", "discover_links", "detect_search",
    "detect_forms", "wait"
  ]),
  description: z.string(),
  url: z.string().url().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  timeout: z.number().max(30000).optional(),
  assertions: z.array(z.string()).optional(),
});

const JourneyStepsSchema = z.array(TestStepSchema).min(1).max(20);

export type TestStep = z.infer<typeof TestStepSchema>;

export function generateSmokeTest(baseUrl: string, metadata: PageMetadata): TestStep[] {
  const steps: TestStep[] = [];

  // ── Step 1: Open homepage ──
  steps.push({
    action: "navigate",
    description: "Open homepage",
    url: baseUrl,
    assertions: ["page_loaded", "title_exists"],
  });

  steps.push({
    action: "screenshot",
    description: "Capture homepage",
  });

  // ── Step 2: Assert main heading ──
  if (metadata.mainHeading) {
    steps.push({
      action: "assert_element",
      description: `Verify main heading: "${metadata.mainHeading.substring(0, 50)}"`,
      selector: "h1",
      assertions: ["element_visible"],
    });
  }

  // ── Step 3: Navigation test (up to 5 links) ──
  const navLinks = metadata.navigationLinks.length > 0
    ? metadata.navigationLinks
    : metadata.internalLinks;

  const linksToTest = navLinks
    .filter((link) => {
      const url = link.href.toLowerCase();
      // Skip auth, login, logout, destructive pages
      return !url.includes("login") && !url.includes("logout") &&
             !url.includes("signin") && !url.includes("signout") &&
             !url.includes("register") && !url.includes("delete") &&
             !url.includes("admin") && !url.includes("nafath") &&
             !url.includes("oauth") && !url.includes("auth");
    })
    .slice(0, 5);

  for (const link of linksToTest) {
    steps.push({
      action: "navigate",
      description: `Navigate to "${link.text}"`,
      url: link.href,
      assertions: ["page_loaded", "status_200"],
    });
    steps.push({
      action: "screenshot",
      description: `Capture "${link.text}" page`,
    });
  }

  // ── Step 4: Search test ──
  if (metadata.searchInputs.length > 0 && !metadata.hasCaptcha) {
    const searchInput = metadata.searchInputs[0];
    steps.push({
      action: "navigate",
      description: "Return to homepage for search test",
      url: baseUrl,
    });
    steps.push({
      action: "type",
      description: "Type search query",
      selector: searchInput.selector,
      value: metadata.language === "ar" ? "خدمات" : "services",
    });
    steps.push({
      action: "screenshot",
      description: "Capture search results",
    });
  }

  // ── Step 5: Form detection (NO SUBMIT) ──
  if (metadata.forms.length > 0) {
    steps.push({
      action: "detect_forms",
      description: `Detected ${metadata.forms.length} form(s) — presence check only (no submission)`,
      assertions: ["form_exists"],
    });
  }

  // Validate all steps
  const validated = JourneyStepsSchema.parse(steps);
  return validated;
}
```

### Test Step Generator (AI-Enhanced Mode)

```typescript
// src/lib/test-generator-ai.ts

export async function generateSmokeTestWithAI(
  baseUrl: string,
  metadata: PageMetadata
): Promise<TestStep[]> {
  const prompt = `You are a QA engineer generating safe smoke test steps for a Saudi government website.

SITE: ${baseUrl}
TITLE: ${metadata.title}
LANGUAGE: ${metadata.language}
MAIN HEADING: ${metadata.mainHeading}
NAVIGATION LINKS (first 10): ${JSON.stringify(metadata.navigationLinks.slice(0, 10))}
SEARCH INPUTS: ${JSON.stringify(metadata.searchInputs)}
FORMS: ${JSON.stringify(metadata.forms.slice(0, 3))}
HAS LOGIN: ${metadata.hasLogin}
HAS CAPTCHA: ${metadata.hasCaptcha}

RULES:
- Generate 5-12 test steps as a JSON array
- ONLY same-domain URLs
- NEVER submit forms
- NEVER interact with login/auth/CAPTCHA
- NEVER click destructive buttons (delete, remove, etc.)
- Use Arabic search terms for Arabic sites
- Each step needs: action, description, and optionally url/selector/value/assertions

ALLOWED ACTIONS: navigate, click, type, assert_title, assert_element, assert_url, screenshot, wait

Return ONLY a JSON array of steps. No markdown, no explanation.`;

  const response = await callAI(prompt);

  try {
    const steps = JSON.parse(response);
    return JourneyStepsSchema.parse(steps);
  } catch (error) {
    // Fallback to heuristic if AI output is invalid
    console.warn("AI generated invalid steps, falling back to heuristic");
    return generateSmokeTest(baseUrl, metadata);
  }
}
```

---

## 11. PLAYWRIGHT EXECUTOR (Deterministic & Safe)

```typescript
// src/lib/executor.ts
import { chromium, Browser, BrowserContext, Page, CDPSession } from "playwright";
import { broadcast } from "./ws-server";
import { prisma } from "./prisma";
import type { TestStep } from "./test-generator";

interface ExecutorConfig {
  runId: string;
  siteId: string;
  baseUrl: string;
  steps: TestStep[];
  enableScreencast?: boolean;
  enableVideo?: boolean;
  enableTrace?: boolean;
}

interface StepResult {
  stepIndex: number;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  screenshotPath?: string;
  error?: string;
  metadata?: any;
}

export class PlaywrightExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private consoleLogs: Array<{ level: string; message: string; timestamp: number }> = [];
  private networkLogs: Array<{
    url: string;
    method: string;
    status: number;
    timing: number;
    size: number;
  }> = [];

  async execute(config: ExecutorConfig): Promise<{
    steps: StepResult[];
    overallStatus: "passed" | "failed" | "error";
    durationMs: number;
  }> {
    const startTime = Date.now();
    const artifactDir = `artifacts/${config.siteId}/${config.runId}`;
    const results: StepResult[] = [];

    try {
      // Ensure artifact directory exists
      await fs.mkdir(artifactDir, { recursive: true });

      // Launch browser
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: "ar-SA",
        timezoneId: "Asia/Riyadh",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        ...(config.enableVideo ? { recordVideo: { dir: artifactDir, size: { width: 1280, height: 720 } } } : {}),
      });

      // Start trace
      if (config.enableTrace !== false) {
        await this.context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: false,
        });
      }

      this.page = await this.context.newPage();

      // ── Collect console logs ──
      this.page.on("console", (msg) => {
        this.consoleLogs.push({
          level: msg.type(),
          message: msg.text(),
          timestamp: Date.now(),
        });
      });

      // ── Collect network logs ──
      this.page.on("response", async (response) => {
        const timing = response.request().timing();
        this.networkLogs.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          timing: timing.responseEnd || 0,
          size: (await response.body().catch(() => Buffer.alloc(0))).length,
        });
      });

      // ── Start CDP Screencast if enabled ──
      if (config.enableScreencast !== false) {
        await this.startScreencast(config.runId);
      }

      // ── Update run status to "running" ──
      await prisma.run.update({
        where: { id: config.runId },
        data: { status: "running" },
      });
      broadcast(config.runId, { type: "run-status", status: "running" });

      // ── Execute each step ──
      for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];

        // Broadcast step start
        broadcast(config.runId, {
          type: "step-update",
          step: {
            index: i,
            action: step.action,
            description: step.description,
            status: "running",
          },
        });

        const result = await this.executeStep(step, i, config);
        results.push(result);

        // Save step to DB
        await prisma.runStep.create({
          data: {
            runId: config.runId,
            stepIndex: i,
            action: step.action,
            description: step.description,
            selector: step.selector,
            value: step.value,
            url: step.url,
            status: result.status,
            durationMs: result.durationMs,
            screenshotPath: result.screenshotPath,
            error: result.error,
            metadata: result.metadata ? JSON.stringify(result.metadata) : null,
          },
        });

        // Broadcast step result
        broadcast(config.runId, {
          type: "step-update",
          step: {
            index: i,
            action: step.action,
            description: step.description,
            status: result.status,
            durationMs: result.durationMs,
            error: result.error,
          },
        });
      }

      // ── Save artifacts ──
      // Trace
      if (config.enableTrace !== false) {
        const tracePath = `${artifactDir}/trace.zip`;
        await this.context.tracing.stop({ path: tracePath });
        await prisma.artifact.create({
          data: { runId: config.runId, type: "trace", path: tracePath },
        });
      }

      // Console logs
      const consolePath = `${artifactDir}/console.json`;
      await fs.writeFile(consolePath, JSON.stringify(this.consoleLogs, null, 2));
      await prisma.artifact.create({
        data: { runId: config.runId, type: "console", path: consolePath },
      });

      // Network logs
      const networkPath = `${artifactDir}/network.json`;
      await fs.writeFile(networkPath, JSON.stringify(this.networkLogs, null, 2));
      await prisma.artifact.create({
        data: { runId: config.runId, type: "network", path: networkPath },
      });

      // Calculate overall status
      const overallStatus = results.some((r) => r.status === "failed") ? "failed" : "passed";
      const durationMs = Date.now() - startTime;

      return { steps: results, overallStatus, durationMs };

    } catch (error: any) {
      return {
        steps: results,
        overallStatus: "error",
        durationMs: Date.now() - startTime,
      };
    } finally {
      // Cleanup
      if (this.cdp) await this.stopScreencast();
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }

  private async executeStep(
    step: TestStep,
    index: number,
    config: ExecutorConfig
  ): Promise<StepResult> {
    const startTime = Date.now();
    const artifactDir = `artifacts/${config.siteId}/${config.runId}`;

    try {
      switch (step.action) {
        case "navigate": {
          // SAFETY: Verify same-domain
          if (step.url && !this.isSameDomain(config.baseUrl, step.url)) {
            throw new Error(`Navigation blocked: ${step.url} is outside target domain`);
          }
          await this.page!.goto(step.url || config.baseUrl, {
            timeout: 30000,
            waitUntil: "domcontentloaded",
          });
          break;
        }

        case "click": {
          if (!step.selector) throw new Error("Click step requires a selector");
          await this.page!.waitForSelector(step.selector, { timeout: 10000 });
          // SAFETY: Verify the link is same-domain before clicking
          const href = await this.page!.$eval(step.selector, (el) =>
            el instanceof HTMLAnchorElement ? el.href : null
          ).catch(() => null);
          if (href && !this.isSameDomain(config.baseUrl, href)) {
            throw new Error(`Click blocked: target ${href} is outside domain`);
          }
          await this.page!.click(step.selector, { timeout: 10000 });
          await this.page!.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
          break;
        }

        case "type": {
          if (!step.selector || !step.value) throw new Error("Type step requires selector and value");
          await this.page!.waitForSelector(step.selector, { timeout: 10000 });
          await this.page!.fill(step.selector, step.value);
          break;
        }

        case "assert_title": {
          const title = await this.page!.title();
          if (!title || title.trim().length === 0) {
            throw new Error("Page title is empty");
          }
          break;
        }

        case "assert_element": {
          if (!step.selector) throw new Error("Assert element requires a selector");
          await this.page!.waitForSelector(step.selector, {
            timeout: 10000,
            state: "visible",
          });
          break;
        }

        case "assert_url": {
          const currentUrl = this.page!.url();
          if (step.value && !currentUrl.includes(step.value)) {
            throw new Error(`URL mismatch: expected "${step.value}" in "${currentUrl}"`);
          }
          break;
        }

        case "screenshot": {
          // Screenshot is taken below for all steps anyway
          break;
        }

        case "detect_search": {
          const selectors = [
            'input[type="search"]',
            'input[placeholder*="search" i]',
            'input[placeholder*="بحث"]',
            'input[name*="search" i]',
            'input[aria-label*="search" i]',
            'input[aria-label*="بحث"]',
          ];
          let found = false;
          for (const sel of selectors) {
            const el = await this.page!.$(sel);
            if (el) {
              found = true;
              break;
            }
          }
          if (!found) throw new Error("No search input detected");
          break;
        }

        case "detect_forms": {
          const formCount = await this.page!.$$eval("form", (forms) => forms.length);
          if (formCount === 0) throw new Error("No forms detected");
          // DO NOT SUBMIT — just verify presence
          break;
        }

        case "wait": {
          await this.page!.waitForTimeout(Math.min(step.timeout || 2000, 5000));
          break;
        }

        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      // Take screenshot for every step (except screenshot action which is redundant)
      let screenshotPath: string | undefined;
      if (step.action !== "screenshot") {
        screenshotPath = `${artifactDir}/step-${index}.png`;
      } else {
        screenshotPath = `${artifactDir}/step-${index}.png`;
      }
      await this.page!.screenshot({
        path: screenshotPath,
        fullPage: false,
      });
      await prisma.artifact.create({
        data: {
          runId: config.runId,
          type: "screenshot",
          path: screenshotPath,
        },
      });

      return {
        stepIndex: index,
        status: "passed",
        durationMs: Date.now() - startTime,
        screenshotPath,
      };

    } catch (error: any) {
      // Still try to take an error screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = `${artifactDir}/step-${index}-error.png`;
        await this.page!.screenshot({ path: screenshotPath, fullPage: false });
      } catch {}

      return {
        stepIndex: index,
        status: "failed",
        durationMs: Date.now() - startTime,
        screenshotPath,
        error: error.message,
      };
    }
  }

  // ── SAFETY: Domain enforcement ──
  private isSameDomain(baseUrl: string, targetUrl: string): boolean {
    try {
      const base = new URL(baseUrl);
      const target = new URL(targetUrl);
      return (
        target.hostname === base.hostname ||
        target.hostname.endsWith("." + base.hostname)
      );
    } catch {
      return false;
    }
  }

  // ── CDP Screencast ──
  private async startScreencast(runId: string) {
    this.cdp = await this.page!.context().newCDPSession(this.page!);

    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 50,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 3,
    });

    this.cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      broadcast(runId, {
        type: "browser-frame",
        image: `data:image/jpeg;base64,${data}`,
      });
      await this.cdp!.send("Page.screencastFrameAck", { sessionId });
    });
  }

  private async stopScreencast() {
    if (this.cdp) {
      await this.cdp.send("Page.stopScreencast").catch(() => {});
    }
  }
}
```

---

## 12. INCIDENT DETECTION & GROUPING

```typescript
// src/lib/incidents.ts

export async function processRunResult(
  runId: string,
  siteId: string,
  journeyId: string,
  overallStatus: "passed" | "failed" | "error",
  steps: StepResult[]
) {
  if (overallStatus === "failed" || overallStatus === "error") {
    // Check for existing open incident
    const existing = await prisma.incident.findFirst({
      where: {
        siteId,
        journeyId,
        status: { in: ["open", "investigating"] },
      },
    });

    const errorMessages = steps
      .filter((s) => s.error)
      .map((s) => s.error!)
      .join("; ");

    if (existing) {
      // Increment existing incident
      await prisma.incident.update({
        where: { id: existing.id },
        data: {
          occurrences: existing.occurrences + 1,
          lastSeenAt: new Date(),
          severity: calculateSeverity(existing.occurrences + 1, steps),
          description: errorMessages,
        },
      });
    } else {
      // Create new incident
      const journey = await prisma.journey.findUnique({ where: { id: journeyId } });
      await prisma.incident.create({
        data: {
          siteId,
          journeyId,
          title: `${journey?.name || "Test"} failing on ${new Date().toLocaleDateString()}`,
          description: errorMessages,
          severity: calculateSeverity(1, steps),
          status: "open",
        },
      });
    }

    // Update site status
    await prisma.site.update({
      where: { id: siteId },
      data: { status: overallStatus === "error" ? "down" : "degraded" },
    });

  } else if (overallStatus === "passed") {
    // Resolve any open incidents for this journey
    await prisma.incident.updateMany({
      where: {
        siteId,
        journeyId,
        status: { in: ["open", "investigating"] },
      },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
      },
    });

    // Update site status (check if all journeys are healthy)
    const openIncidents = await prisma.incident.count({
      where: { siteId, status: { in: ["open", "investigating"] } },
    });
    await prisma.site.update({
      where: { id: siteId },
      data: { status: openIncidents > 0 ? "degraded" : "healthy" },
    });
  }
}

function calculateSeverity(
  occurrences: number,
  steps: StepResult[]
): "low" | "medium" | "high" | "critical" {
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const totalCount = steps.length;
  const failRate = failedCount / totalCount;

  // Homepage not loading is always critical
  if (steps[0]?.status === "failed") return "critical";

  if (occurrences >= 6 || failRate > 0.8) return "critical";
  if (occurrences >= 3 || failRate > 0.5) return "high";
  if (occurrences >= 2 || failRate > 0.3) return "medium";
  return "low";
}
```

---

## 13. AI SUMMARY GENERATION

```typescript
// src/lib/ai-summary.ts

export async function generateRunSummary(
  site: { name: string; nameAr?: string; baseUrl: string },
  run: { status: string; durationMs: number },
  steps: Array<{ action: string; description: string; status: string; error?: string; durationMs?: number }>
): Promise<string> {
  const provider = getAIProvider();

  if (provider === "template") {
    return templateSummary(run, steps);
  }

  const prompt = `You are a QA analyst for Saudi government websites.
Summarize this test run for a non-technical executive.

SITE: ${site.name} (${site.nameAr || ""}) — ${site.baseUrl}
STATUS: ${run.status}
DURATION: ${(run.durationMs / 1000).toFixed(1)}s
STEPS:
${steps.map((s, i) => `${i + 1}. [${s.status.toUpperCase()}] ${s.description}${s.error ? ` — Error: ${s.error}` : ""} (${s.durationMs ? (s.durationMs / 1000).toFixed(1) + "s" : "N/A"})`).join("\n")}

INSTRUCTIONS:
1. Write 2-3 sentences summarizing what happened
2. If failures occurred, explain the likely impact on users
3. Suggest what the site owner should investigate
4. Write in both English AND Arabic
5. Be concise and actionable

FORMAT:
**English:** [summary]
**العربية:** [summary]`;

  if (provider === "claude") return callClaude(prompt);
  if (provider === "openai") return callOpenAI(prompt);
  return templateSummary(run, steps);
}
```

---

## 14. SCHEDULER & WORKER

```typescript
// src/worker/scheduler.ts
// This runs as a SEPARATE process: `npm run worker`

import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { PlaywrightExecutor } from "../lib/executor";
import { processRunResult } from "../lib/incidents";
import { generateRunSummary } from "../lib/ai-summary";
import { initWebSocketServer } from "../lib/ws-server";

// Initialize WebSocket server for live view
initWebSocketServer(3001);

console.log("🚀 GovWatch Worker started");
console.log("📡 WebSocket server on ws://localhost:3001");

// Run every minute, check which sites need execution
cron.schedule("* * * * *", async () => {
  try {
    const sites = await prisma.site.findMany({
      where: { isActive: true, schedule: { gt: 0 } },
      include: { journeys: { where: { isDefault: true } } },
    });

    for (const site of sites) {
      // Check if it's time to run (based on schedule interval)
      const minutesSinceLastRun = site.lastRunAt
        ? (Date.now() - site.lastRunAt.getTime()) / 60000
        : Infinity;

      if (minutesSinceLastRun < site.schedule) continue;

      // Process each journey for this site
      for (const journey of site.journeys) {
        await runJourney(site, journey);
      }
    }
  } catch (error) {
    console.error("Scheduler error:", error);
  }
});

async function runJourney(site: any, journey: any) {
  console.log(`▶️  Running "${journey.name}" for ${site.name}`);

  // Create run record
  const run = await prisma.run.create({
    data: {
      siteId: site.id,
      journeyId: journey.id,
      status: "queued",
      triggeredBy: "scheduler",
      totalSteps: JSON.parse(journey.stepsJson).length,
    },
  });

  try {
    const executor = new PlaywrightExecutor();
    const result = await executor.execute({
      runId: run.id,
      siteId: site.id,
      baseUrl: site.baseUrl,
      steps: JSON.parse(journey.stepsJson),
      enableScreencast: true,
      enableTrace: true,
    });

    // Generate AI summary
    const steps = await prisma.runStep.findMany({
      where: { runId: run.id },
      orderBy: { stepIndex: "asc" },
    });

    const summary = await generateRunSummary(site, {
      status: result.overallStatus,
      durationMs: result.durationMs,
    }, steps);

    // Update run record
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: result.overallStatus,
        durationMs: result.durationMs,
        passedSteps: result.steps.filter((s) => s.status === "passed").length,
        failedSteps: result.steps.filter((s) => s.status === "failed").length,
        summaryJson: JSON.stringify({ text: summary }),
        finishedAt: new Date(),
      },
    });

    // Update site last run time
    await prisma.site.update({
      where: { id: site.id },
      data: { lastRunAt: new Date() },
    });

    // Process incidents
    await processRunResult(run.id, site.id, journey.id, result.overallStatus, result.steps);

    // Broadcast completion
    const { broadcast } = await import("../lib/ws-server");
    broadcast(run.id, {
      type: "run-complete",
      status: result.overallStatus,
      summary,
    });

    console.log(`✅ ${site.name}: ${result.overallStatus} (${result.durationMs}ms)`);

  } catch (error: any) {
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorJson: JSON.stringify({ message: error.message }),
        finishedAt: new Date(),
      },
    });
    console.error(`❌ ${site.name}: ${error.message}`);
  }
}
```

---

## 15. ARTIFACT STORAGE

### Directory Structure
```
artifacts/
├── {siteId}/
│   ├── {runId}/
│   │   ├── step-0.png          # Screenshot after step 0
│   │   ├── step-1.png          # Screenshot after step 1
│   │   ├── step-2-error.png    # Error screenshot
│   │   ├── trace.zip           # Playwright trace
│   │   ├── video.webm          # Optional video
│   │   ├── console.json        # Browser console logs
│   │   └── network.json        # Network request log
```

### Serving Artifacts via Next.js API

```typescript
// src/app/api/artifacts/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = path.join(process.cwd(), "artifacts", ...params.path);
  
  // Security: prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(process.cwd(), "artifacts"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webm": "video/webm",
      ".zip": "application/zip",
      ".json": "application/json",
    };
    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType[ext] || "application/octet-stream" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
```

---

## 16. UI PAGES & DESIGN SYSTEM

### Design Language (qa.tech-inspired)
- **Background:** White (#FFFFFF)
- **Text:** Black/Dark gray (#0A0A0A, #4B5563)
- **Primary accent:** Gradient (violet → blue or blue → cyan)
- **Cards:** White with subtle border (#E5E7EB), rounded-xl, light shadow
- **Status colors:** Green (#22C55E), Yellow (#EAB308), Red (#EF4444)
- **CTAs:** Black rounded-full buttons
- **Typography:** Clean sans-serif, large bold headlines
- **Spacing:** Generous whitespace

### Page 1: Landing Page (`/`)

```
┌─────────────────────────────────────────────────────────────────┐
│  🛡️ GovWatch     Dashboard   How it Works   Docs    [Sign In]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                                                                  │
│           AI-Powered Government                                  │
│           Website Monitoring                                     │
│                    ▲                                              │
│              (gradient word)                                      │
│                                                                  │
│    Continuous black-box QA for Saudi government                   │
│    digital services — powered by real browser automation          │
│                                                                  │
│    ┌──────────────────────────────────┐  ┌────────────────┐     │
│    │  Enter website URL...            │  │  ● Start Test  │     │
│    └──────────────────────────────────┘  └────────────────┘     │
│                                                                  │
│    Try: absher.sa  •  moh.gov.sa  •  qiwa.sa                    │
│                                                                  │
│    ┌────────────────────────────────────────────────────────┐   │
│    │                                                         │   │
│    │     📸 Product Preview (Dashboard Screenshot/Mock)      │   │
│    │                                                         │   │
│    └────────────────────────────────────────────────────────┘   │
│                                                                  │
│    ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│    │  🔍         │  │  🤖         │  │  📊         │              │
│    │  Real       │  │  AI-Powered │  │  Live       │              │
│    │  Browser    │  │  Analysis   │  │  Dashboard  │              │
│    │  Testing    │  │             │  │             │              │
│    │  Automated  │  │  Smart      │  │  24/7       │              │
│    │  Playwright │  │  summaries  │  │  monitoring │              │
│    │  execution  │  │  and error  │  │  with       │              │
│    │             │  │  classify   │  │  incidents  │              │
│    └────────────┘  └────────────┘  └────────────┘              │
│                                                                  │
│    ─────────────────────────────────────────────────            │
│    GovWatch © 2024  •  Terms  •  Privacy                        │
└─────────────────────────────────────────────────────────────────┘
```

### Page 2: Live Dashboard (`/dashboard`)

```
┌─────────────────────────────────────────────────────────────────┐
│  🛡️ GovWatch    [Dashboard]   Sites   Incidents    + New Site   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Monitoring Dashboard                                            │
│  5 sites monitored  •  Last updated 30s ago  •  2 incidents     │
│                                                                  │
│  [Overview]  [All Runs]  [Incidents]     ← Tabs                 │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │  🟢 Absher       │  │  🔴 Qiwa         │  │  🟡 MOH         │  │
│  │  أبشر           │  │  قوى            │  │  وزارة الصحة    │  │
│  │                  │  │                  │  │                 │  │
│  │  ✅ Healthy      │  │  ❌ Down          │  │  ⚠️ Degraded    │  │
│  │  Last: 2m ago   │  │  Last: 5m ago    │  │  Last: 1m ago   │  │
│  │  24h: 98.5%     │  │  24h: 72.1%      │  │  24h: 89.0%     │  │
│  │  Avg: 3.2s      │  │  Avg: 8.1s       │  │  Avg: 4.5s      │  │
│  │  Incidents: 0   │  │  Incidents: 3    │  │  Incidents: 1   │  │
│  │                  │  │                  │  │                 │  │
│  │  [View] [Watch]  │  │  [View] [Watch]  │  │  [View] [Watch] │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  🟢 my.gov.sa    │  │  🟢 SDA          │                      │
│  │  المنصة الوطنية │  │  الأكاديمية     │                      │
│  │  ✅ Healthy      │  │  ✅ Healthy      │                      │
│  │  Last: 3m ago   │  │  Last: 1m ago    │                      │
│  │  24h: 99.2%     │  │  24h: 97.8%      │                      │
│  └─────────────────┘  └─────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Page 3: Site Detail (`/dashboard/[siteId]`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    Absher (أبشر)    🟢 Healthy    [Run Now] [Watch Live]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 98.5%    │  │ 3.2s     │  │ 142      │  │ 0        │       │
│  │ Uptime   │  │ Avg Time │  │ Total    │  │ Open     │       │
│  │ (24h)    │  │          │  │ Runs     │  │ Incidents│       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  Journeys                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔄 Homepage Smoke Test       ✅ Passing    Last: 2m ago │   │
│  │  🔄 Navigation Test           ✅ Passing    Last: 2m ago │   │
│  │  🔄 Search Functionality      ❌ Failing    Last: 2m ago │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Recent Runs                                                     │
│  ┌────────┬──────────┬──────────┬──────────┬─────────┐         │
│  │ Time    │ Journey  │ Status   │ Duration │ Details │         │
│  ├────────┼──────────┼──────────┼──────────┼─────────┤         │
│  │ 2m ago  │ Smoke    │ ✅ Pass  │ 3.1s     │ [View]  │         │
│  │ 12m ago │ Smoke    │ ✅ Pass  │ 3.4s     │ [View]  │         │
│  │ 22m ago │ Smoke    │ ❌ Fail  │ 8.2s     │ [View]  │         │
│  └────────┴──────────┴──────────┴──────────┴─────────┘         │
│                                                                  │
│  Open Incidents                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔴 HIGH  Search functionality failing  (3 occurrences) │   │
│  │  First seen: 2h ago  •  Last seen: 2m ago                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Page 4: Run Report (`/dashboard/[siteId]/runs/[runId]`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    Run #abc123    ✅ PASSED    12.3s    [Rerun]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🤖 AI Summary                                           │  │
│  │                                                           │  │
│  │  **English:** All critical paths passed successfully.     │  │
│  │  Homepage loaded in 2.1s. Navigation verified for 5       │  │
│  │  internal links. Search functionality returned results    │  │
│  │  for "خدمات". No console errors detected.                │  │
│  │                                                           │  │
│  │  **العربية:** جميع المسارات الحرجة نجحت. تم تحميل        │  │
│  │  الصفحة الرئيسية في 2.1 ثانية. تم التحقق من التنقل      │  │
│  │  لـ 5 روابط داخلية. لم يتم اكتشاف أخطاء.               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step-by-Step Timeline                                           │
│  ─────────────────────────────────────────                      │
│  ✅ 1. Open homepage ...................... 2.1s  [📷 View]     │
│  ✅ 2. Capture homepage .................. 0.2s  [📷 View]     │
│  ✅ 3. Navigate to "الخدمات" ............. 1.3s  [📷 View]     │
│  ✅ 4. Navigate to "من نحن" .............. 0.8s  [📷 View]     │
│  ❌ 5. Type search query ................. 5.0s  [📷 View]     │
│       └─ Error: Search input not found (timeout 10s)            │
│  ⏭️ 6. Detect forms ...................... 0.2s                 │
│                                                                  │
│  📷 Screenshot Viewer                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Step 1 screenshot]                                      │  │
│  │                                                           │  │
│  │  ◀  Step 1 of 6  ▶                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📎 Artifacts                                                    │
│  ┌────────────┬──────────────┬────────────┬──────────────┐     │
│  │ 📦 Trace   │ 🎥 Video     │ 📋 Console │ 🌐 Network   │     │
│  │ [Download] │ [Download]   │ [View]     │ [View]       │     │
│  └────────────┴──────────────┴────────────┴──────────────┘     │
│                                                                  │
│  Console Logs (3 warnings, 0 errors)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ⚠️ [warning] Mixed content: page loaded over HTTPS...    │  │
│  │ ⚠️ [warning] Deprecated API usage...                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Network Summary                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Total Requests: 47  •  Failed: 2  •  Avg: 180ms         │  │
│  │ Total Size: 2.4 MB  •  Slowest: /api/config (1.2s)      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Page 5: Live Run Page (`/live/[runId]`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back        Testing: absher.sa         🔴 LIVE               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────┐  ┌────────────────────┐ │
│  │  ┌────────┐           ⏱️ 0:14     │  │  Test Steps        │ │
│  │  │🔴 LIVE │                       │  │                    │ │
│  │  └────────┘                       │  │  ✅ 1. Open page   │ │
│  │                                   │  │     2.1s           │ │
│  │                                   │  │                    │ │
│  │   🖥️ REAL-TIME BROWSER VIEW       │  │  ⏳ 2. Click nav   │ │
│  │                                   │  │     running...     │ │
│  │   (CDP Screencast frames          │  │                    │ │
│  │    streamed via WebSocket)        │  │  🔲 3. Search      │ │
│  │                                   │  │     pending        │ │
│  │                                   │  │                    │ │
│  │                                   │  │  🔲 4. Forms       │ │
│  │                                   │  │     pending        │ │
│  └───────────────────────────────────┘  └────────────────────┘ │
│                                                                  │
│  Step 2/5  ████████░░░░░░░░░  40%       Running...   ⏱️ 14s    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

         After completion, transitions to → Run Report page
```

### Page 6: Add New Site (`/sites/new`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    Add New Site                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Website URL *                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  https://example.gov.sa                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Site Name                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  (Auto-detected from page title)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [🤖 Generate Test Steps]                                        │
│                                                                  │
│  Generated Steps Preview:                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. navigate  — Open homepage                             │  │
│  │  2. screenshot — Capture homepage                         │  │
│  │  3. navigate  — Navigate to "الخدمات"                     │  │
│  │  4. navigate  — Navigate to "تواصل معنا"                  │  │
│  │  5. type      — Search for "خدمات"                        │  │
│  │  6. detect_forms — Check for forms                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Schedule                                                        │
│  ○ Run once    ○ Every 10 min    ○ Every 30 min    ○ Every 60 min│
│                                                                  │
│  ☑ Enable continuous monitoring                                  │
│                                                                  │
│  [Save & Run Now]                [Save Only]                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 17. API ROUTES

```
GET    /api/sites                    — List all sites with status
POST   /api/sites                    — Create new site
GET    /api/sites/[id]               — Get site details + metrics
DELETE /api/sites/[id]               — Delete site

GET    /api/sites/[id]/runs          — List runs for a site
POST   /api/sites/[id]/runs          — Trigger a manual run
GET    /api/sites/[id]/runs/[runId]  — Get run details + steps
GET    /api/sites/[id]/metrics       — Get 24h/7d metrics

GET    /api/sites/[id]/incidents     — List incidents for a site
PATCH  /api/incidents/[id]           — Update incident status

POST   /api/test                     — Quick test: submit URL, get runId
GET    /api/test/[runId]/status      — Poll run status

POST   /api/generate-steps           — Generate test steps for a URL

GET    /api/artifacts/[...path]      — Serve artifact files
```

---

## 18. PROJECT STRUCTURE

```
govwatch/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                          # Root layout
│   │   ├── page.tsx                            # Landing page
│   │   ├── globals.css                         # Tailwind + custom styles
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx                        # Live monitoring dashboard
│   │   │   └── [siteId]/
│   │   │       ├── page.tsx                    # Site detail page
│   │   │       └── runs/
│   │   │           └── [runId]/
│   │   │               └── page.tsx            # Run report page
│   │   │
│   │   ├── live/
│   │   │   └── [runId]/
│   │   │       └── page.tsx                    # Live browser view page
│   │   │
│   │   ├── sites/
│   │   │   └── new/
│   │   │       └── page.tsx                    # Add new site page
│   │   │
│   │   └── api/
│   │       ├── sites/
│   │       │   ├── route.ts                    # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts                # GET, DELETE
│   │       │       ├── runs/
│   │       │       │   ├── route.ts            # GET (list), POST (trigger)
│   │       │       │   └── [runId]/
│   │       │       │       └── route.ts        # GET run details
│   │       │       └── metrics/
│   │       │           └── route.ts            # GET metrics
│   │       │
│   │       ├── test/
│   │       │   ├── route.ts                    # POST: quick test URL
│   │       │   └── [runId]/
│   │       │       └── status/
│   │       │           └── route.ts            # GET: poll status
│   │       │
│   │       ├── generate-steps/
│   │       │   └── route.ts                    # POST: generate test steps
│   │       │
│   │       ├── incidents/
│   │       │   ├── route.ts                    # GET all incidents
│   │       │   └── [id]/
│   │       │       └── route.ts                # PATCH update
│   │       │
│   │       └── artifacts/
│   │           └── [...path]/
│   │               └── route.ts                # Serve artifact files
│   │
│   ├── components/
│   │   ├── ui/                                 # shadcn/ui components
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ... (other shadcn components)
│   │   │
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── landing/
│   │   │   ├── Hero.tsx
│   │   │   ├── URLInput.tsx
│   │   │   ├── Features.tsx
│   │   │   └── ProductPreview.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── SiteCard.tsx
│   │   │   ├── SiteGrid.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── MetricsRow.tsx
│   │   │   ├── RunsTable.tsx
│   │   │   └── IncidentList.tsx
│   │   │
│   │   ├── live/
│   │   │   ├── LiveView.tsx                    # Main live browser component
│   │   │   ├── BrowserFrame.tsx                # Browser frame display
│   │   │   ├── StepsPanel.tsx                  # Side panel with steps
│   │   │   └── ProgressBar.tsx                 # Bottom progress bar
│   │   │
│   │   └── report/
│   │       ├── AISummary.tsx
│   │       ├── StepTimeline.tsx
│   │       ├── ScreenshotViewer.tsx
│   │       ├── ConsoleLogsViewer.tsx
│   │       ├── NetworkSummary.tsx
│   │       └── ArtifactLinks.tsx
│   │
│   ├── lib/
│   │   ├── prisma.ts                           # Prisma client singleton
│   │   ├── executor.ts                         # Playwright executor
│   │   ├── ws-server.ts                        # WebSocket server + broadcast
│   │   ├── page-analyzer.ts                    # Cheerio-based page analysis
│   │   ├── test-generator.ts                   # Heuristic test generation
│   │   ├── test-generator-ai.ts                # AI-enhanced test generation
│   │   ├── ai.ts                               # AI provider (Claude/OpenAI/template)
│   │   ├── ai-summary.ts                       # Run summary generation
│   │   ├── incidents.ts                        # Incident grouping logic
│   │   ├── validators.ts                       # Zod schemas for test steps
│   │   └── utils.ts                            # Shared utilities
│   │
│   └── worker/
│       └── scheduler.ts                        # node-cron worker (separate process)
│
├── artifacts/                                  # Generated screenshots, traces, etc.
│   └── .gitkeep
│
├── public/
│   ├── logo.svg
│   └── og-image.png
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.js
└── README.md
```

---

## 19. SEED DATA

```typescript
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRESET_SITES = [
  {
    name: "Absher",
    nameAr: "أبشر",
    baseUrl: "https://www.absher.sa",
    description: "Saudi electronic government services portal",
    schedule: 10,
  },
  {
    name: "Unified National Platform",
    nameAr: "المنصة الوطنية الموحدة",
    baseUrl: "https://www.my.gov.sa",
    description: "Saudi Arabia's unified national services platform",
    schedule: 10,
  },
  {
    name: "Ministry of Health",
    nameAr: "وزارة الصحة",
    baseUrl: "https://www.moh.gov.sa",
    description: "Saudi Ministry of Health official portal",
    schedule: 10,
  },
  {
    name: "Qiwa",
    nameAr: "قوى",
    baseUrl: "https://qiwa.sa",
    description: "Saudi labor market platform",
    schedule: 10,
  },
  {
    name: "Saudi Digital Academy",
    nameAr: "الأكاديمية الرقمية السعودية",
    baseUrl: "https://sda.edu.sa",
    description: "National digital skills training platform",
    schedule: 10,
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  for (const siteData of PRESET_SITES) {
    // Create site
    const site = await prisma.site.create({
      data: {
        ...siteData,
        isPreset: true,
        isActive: true,
        status: "unknown",
      },
    });

    // Create default smoke test journey
    const defaultSteps = [
      { action: "navigate", description: "Open homepage", url: siteData.baseUrl, assertions: ["page_loaded", "title_exists"] },
      { action: "screenshot", description: "Capture homepage" },
      { action: "assert_element", description: "Verify page has main heading", selector: "h1, h2, [role='heading']" },
      { action: "screenshot", description: "Capture after heading check" },
    ];

    await prisma.journey.create({
      data: {
        siteId: site.id,
        name: `${siteData.name} Smoke Test`,
        type: "smoke",
        stepsJson: JSON.stringify(defaultSteps),
        isDefault: true,
      },
    });

    console.log(`  ✅ Seeded: ${siteData.name}`);
  }

  console.log("\n🎉 Seeding complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 20. IMPLEMENTATION ORDER (Step-by-Step)

### Phase 1: Foundation (Steps 1-4)

```
Step 1: Scaffold Next.js project
  - npx create-next-app@latest govwatch --typescript --tailwind --app --src-dir
  - Install all dependencies
  - Setup shadcn/ui

Step 2: Database setup
  - Create prisma/schema.prisma (full schema from Section 5)
  - npx prisma generate
  - npx prisma db push
  - Create prisma/seed.ts
  - npm run seed

Step 3: Core libraries
  - src/lib/prisma.ts (Prisma client singleton)
  - src/lib/utils.ts (shared utilities)
  - src/lib/validators.ts (Zod schemas)

Step 4: Playwright executor
  - src/lib/executor.ts (full executor with safety guards)
  - Test manually: can it open a URL and take a screenshot?
```

### Phase 2: Brain (Steps 5-7)

```
Step 5: Page analyzer
  - src/lib/page-analyzer.ts (Cheerio-based)
  - Test: can it extract metadata from a real government site?

Step 6: Test generator
  - src/lib/test-generator.ts (heuristic mode)
  - src/lib/test-generator-ai.ts (AI-enhanced mode)
  - Test: generate steps for absher.sa

Step 7: AI service
  - src/lib/ai.ts (provider detection + fallback)
  - src/lib/ai-summary.ts (run summary generation)
```

### Phase 3: Real-time (Steps 8-9)

```
Step 8: WebSocket server
  - src/lib/ws-server.ts
  - Integrate CDP Screencast into executor
  - Test: can a WebSocket client receive browser frames?

Step 9: Incident logic
  - src/lib/incidents.ts
  - Test: consecutive failures create/update incidents
```

### Phase 4: API Layer (Step 10)

```
Step 10: All API routes
  - /api/sites (CRUD)
  - /api/sites/[id]/runs (list + trigger)
  - /api/sites/[id]/runs/[runId] (details)
  - /api/sites/[id]/metrics
  - /api/test (quick test)
  - /api/generate-steps
  - /api/incidents
  - /api/artifacts/[...path]
```

### Phase 5: UI (Steps 11-16)

```
Step 11: Layout + Navbar + Footer
  - src/app/layout.tsx
  - src/components/layout/Navbar.tsx
  - src/components/layout/Footer.tsx

Step 12: Landing page
  - src/app/page.tsx
  - src/components/landing/ (Hero, URLInput, Features, ProductPreview)

Step 13: Dashboard page
  - src/app/dashboard/page.tsx
  - src/components/dashboard/ (SiteCard, SiteGrid, StatusBadge, etc.)

Step 14: Site detail page
  - src/app/dashboard/[siteId]/page.tsx
  - Journeys, runs table, incidents

Step 15: Live view page
  - src/app/live/[runId]/page.tsx
  - src/components/live/ (LiveView, BrowserFrame, StepsPanel, ProgressBar)

Step 16: Run report page
  - src/app/dashboard/[siteId]/runs/[runId]/page.tsx
  - src/components/report/ (AISummary, StepTimeline, ScreenshotViewer, etc.)
```

### Phase 6: Worker + Polish (Steps 17-19)

```
Step 17: Worker/Scheduler
  - src/worker/scheduler.ts
  - npm run worker command

Step 18: Add New Site page
  - src/app/sites/new/page.tsx
  - Generate steps preview
  - Schedule selector

Step 19: Polish
  - Loading states (skeletons)
  - Error boundaries
  - Empty states
  - Responsive design
  - README.md
```

---

## 21. COMMANDS

```json
// package.json scripts
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "npx tsx src/worker/scheduler.ts",
    "seed": "npx tsx prisma/seed.ts",
    "db:push": "npx prisma db push",
    "db:studio": "npx prisma studio",
    "postinstall": "npx prisma generate && npx playwright install chromium"
  }
}
```

### Setup Commands

```bash
# 1. Install dependencies
npm install

# 2. Setup database
npx prisma generate
npx prisma db push

# 3. Install Playwright browser
npx playwright install chromium

# 4. Seed preset sites
npm run seed

# 5. Start dev server (terminal 1)
npm run dev

# 6. Start worker (terminal 2)
npm run worker
```

---

## 22. ENVIRONMENT VARIABLES

```env
# .env.example

# Database
DATABASE_URL="file:./dev.db"

# AI Provider (optional — system works without these)
ANTHROPIC_API_KEY="sk-ant-..."        # For Claude AI summaries
OPENAI_API_KEY="sk-..."               # Alternative: OpenAI

# WebSocket
NEXT_PUBLIC_WS_URL="ws://localhost:3001"

# Worker
WORKER_PORT=3001
```

---

## 23. ERROR HANDLING & EDGE CASES

### Playwright Timeouts
- Page navigation: 30s timeout
- Element interaction: 10s timeout
- If timeout → mark step as "failed", continue remaining steps
- If browser crashes → mark entire run as "error"

### Website Blocks Us
- If CAPTCHA detected → skip test, mark as "skipped", note CAPTCHA in metadata
- If WAF blocks → mark as "error", suggest in AI summary
- If redirect to login → stop journey, mark as "failed", note auth required

### Worker Resilience
- Each run has try/catch → one site failure doesn't affect others
- Concurrent run limit: 3 simultaneous browsers max
- If run exceeds 120s total → force kill and mark as "timeout"

### WebSocket Disconnection
- Client auto-reconnects every 3 seconds
- If no frames for 10s → show "Reconnecting..." overlay
- Missed frames are acceptable (not critical data)

### No AI Key
- System fully functional without AI keys
- Uses template-based summaries instead
- Test generation uses heuristic mode
- No degradation in core monitoring functionality

---

## 24. PERFORMANCE REQUIREMENTS

| Metric | Target |
|--------|--------|
| Single run duration | < 60s per site |
| CDP Screencast FPS | ~10 fps |
| Frame size | ~30-50 KB per JPEG frame |
| WebSocket latency | < 100ms |
| Dashboard load time | < 2s |
| Screenshot storage | ~200 KB per screenshot |
| Concurrent browsers | Max 3 |
| DB queries per page | < 10 |
| Artifact retention | 7 days (auto-cleanup optional) |

---

## FINAL NOTES

1. **Start with a working skeleton** — get a basic flow working end-to-end before polishing
2. **The Live View is the WOW feature** — make sure CDP Screencast works early
3. **AI is optional** — the system must work fully without API keys
4. **Safety first** — every URL navigation must pass domain check
5. **Keep it simple** — SQLite + local files, no Docker/Redis/cloud needed for MVP

---

**START IMPLEMENTING NOW.**
**Output working code files in the order specified in the implementation plan.**
**Minimal explanations — maximum working code.**