-- One table so the instance can say whether it is working.
--
-- AdminAudit already records what an admin did to an account. Nothing recorded
-- what the instance itself did: whether the Stripe webhook arrived, whether the
-- invite email actually left, whether a tool call or a page render threw. On a
-- hosted instance those failures are silent, and the first sign of one is a
-- customer email days later.
--
-- Rows are pruned after thirty days by sweepSystemEvents(), so this stays a
-- window on the recent past rather than a table that only grows.
CREATE TYPE "SystemEventLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "level" "SystemEventLevel" NOT NULL DEFAULT 'ERROR',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "userEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");
CREATE INDEX "SystemEvent_source_createdAt_idx" ON "SystemEvent"("source", "createdAt");
CREATE INDEX "SystemEvent_level_createdAt_idx" ON "SystemEvent"("level", "createdAt");
