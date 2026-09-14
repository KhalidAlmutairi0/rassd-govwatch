PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Run" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" DATETIME,
  "evidenceDeletedAt" DATETIME,
  FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Run" ("id", "siteId", "journeyId", "status", "durationMs", "totalSteps", "passedSteps", "failedSteps", "summaryJson", "errorJson", "triggeredBy", "aiPageUnderstanding", "aiTestPlan", "aiSummary", "startedAt", "finishedAt", "queuedAt")
SELECT "id", "siteId", "journeyId", "status", "durationMs", "totalSteps", "passedSteps", "failedSteps", "summaryJson", "errorJson", "triggeredBy", "aiPageUnderstanding", "aiTestPlan", "aiSummary", "startedAt", "finishedAt", "startedAt" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

CREATE TABLE "WorkerState" ("id" TEXT NOT NULL PRIMARY KEY, "heartbeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "QueueLock" ("id" INTEGER NOT NULL PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "ArtifactCleanup" ("id" TEXT NOT NULL PRIMARY KEY, "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Site_isActive_schedule_idx" ON "Site"("isActive", "schedule");
CREATE INDEX "Journey_siteId_isDefault_idx" ON "Journey"("siteId", "isDefault");
CREATE INDEX "Run_status_queuedAt_idx" ON "Run"("status", "queuedAt");
CREATE INDEX "Run_status_deadlineAt_idx" ON "Run"("status", "deadlineAt");
CREATE INDEX "Run_siteId_startedAt_idx" ON "Run"("siteId", "startedAt");
CREATE INDEX "Run_journeyId_status_idx" ON "Run"("journeyId", "status");
CREATE INDEX "Run_evidenceDeletedAt_finishedAt_idx" ON "Run"("evidenceDeletedAt", "finishedAt");
CREATE INDEX "RunStep_runId_stepIndex_idx" ON "RunStep"("runId", "stepIndex");
CREATE INDEX "Artifact_runId_createdAt_idx" ON "Artifact"("runId", "createdAt");
CREATE INDEX "ElementTestResult_runId_createdAt_idx" ON "ElementTestResult"("runId", "createdAt");
CREATE INDEX "Incident_siteId_journeyId_status_idx" ON "Incident"("siteId", "journeyId", "status");
CREATE INDEX "Incident_status_lastSeenAt_idx" ON "Incident"("status", "lastSeenAt");
CREATE INDEX "ArtifactCleanup_dueAt_idx" ON "ArtifactCleanup"("dueAt");
