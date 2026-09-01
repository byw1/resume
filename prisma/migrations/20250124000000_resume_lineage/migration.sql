-- A tailored resume remembers what it was tailored from.
--
-- Purely additive: every resume that exists gets a null base, which is what it
-- had before — an unlinked resume behaves exactly as it does today and the
-- diff simply has nothing to compare against. Nothing to backfill.
--
-- SET NULL, not CASCADE. Deleting a base must leave its tailored copies
-- standing; one of those copies is what somebody actually sent. This matches
-- Application.resumeId, which nulls rather than taking the application with it.
--
-- No CHECK forbidding baseResumeId = id: Prisma's schema language cannot
-- express one, so it would read as drift on every future migrate. The only two
-- writers are duplicateResume (always the source's id) and setResumeBase
-- (which refuses itself and walks the chain for cycles), so the guard is the
-- data layer's.

ALTER TABLE "Resume" ADD COLUMN "baseResumeId" TEXT;

CREATE INDEX "Resume_baseResumeId_idx" ON "Resume"("baseResumeId");

ALTER TABLE "Resume" ADD CONSTRAINT "Resume_baseResumeId_fkey"
  FOREIGN KEY ("baseResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
