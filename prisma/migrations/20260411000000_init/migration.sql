-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'developer',
    "name" TEXT,
    "nameAr" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "slackWebhook" TEXT,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifySlack" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationTimer" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "level1SentAt" TIMESTAMP(3),
    "level2SentAt" TIMESTAMP(3),
    "level3SentAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "hourOfDay" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "ministryName" TEXT,
    "baseUrl" TEXT NOT NULL,
    "description" TEXT,
    "schedule" INTEGER NOT NULL DEFAULT 10,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'smoke',
    "stepsJson" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "durationMs" INTEGER,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "passedSteps" INTEGER NOT NULL DEFAULT 0,
    "failedSteps" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" TEXT,
    "errorJson" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'scheduler',
    "aiPageUnderstanding" TEXT,
    "aiTestPlan" TEXT,
    "aiSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "selector" TEXT,
    "value" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "durationMs" INTEGER,
    "screenshotPath" TEXT,
    "error" TEXT,
    "metadata" TEXT,

    CONSTRAINT "RunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementTestResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "elementType" TEXT NOT NULL,
    "elementText" TEXT,
    "elementTextAr" TEXT,
    "elementSelector" TEXT NOT NULL,
    "parentSection" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responseTimeMs" INTEGER,
    "urlBefore" TEXT,
    "urlAfter" TEXT,
    "urlChanged" BOOLEAN NOT NULL DEFAULT false,
    "screenshotBefore" TEXT,
    "screenshotAfter" TEXT,
    "consoleErrors" TEXT,
    "networkErrors" TEXT,
    "domChanges" TEXT,
    "error" TEXT,
    "cursorX" INTEGER,
    "cursorY" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElementTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "journeyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteScore" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallScore" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "uxScore" INTEGER NOT NULL DEFAULT 50,
    "qaScore" INTEGER NOT NULL DEFAULT 50,
    "accessScore" INTEGER NOT NULL DEFAULT 50,
    "perfScore" INTEGER NOT NULL DEFAULT 50,
    "execSummary" TEXT,

    CONSTRAINT "SiteScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Directive" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Directive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationTimer_incidentId_key" ON "EscalationTimer"("incidentId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationTimer" ADD CONSTRAINT "EscalationTimer_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementTestResult" ADD CONSTRAINT "ElementTestResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteScore" ADD CONSTRAINT "SiteScore_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Directive" ADD CONSTRAINT "Directive_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Directive" ADD CONSTRAINT "Directive_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 7.7.0                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
