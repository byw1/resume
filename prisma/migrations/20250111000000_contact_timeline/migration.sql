-- People get a history. Until now every activity had to hang off an
-- application, so a contact had no timeline and "who has gone quiet on me"
-- was unanswerable. An activity now belongs to exactly one thing — an
-- application or a contact — and a contact carries the date you mean to get
-- back in touch.
ALTER TABLE "Activity" ALTER COLUMN "applicationId" DROP NOT NULL;
ALTER TABLE "Activity" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Activity_contactId_occurredAt_idx" ON "Activity"("contactId", "occurredAt");

ALTER TABLE "Contact" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
