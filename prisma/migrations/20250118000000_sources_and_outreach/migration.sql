-- Where an application came from is a list, not a word.
--
-- Real applications arrive from more than one direction at once — the posting
-- was on a job board AND a friend referred you AND you messaged the hiring
-- manager. One free-text column forced a choice, so the column becomes an
-- array. Existing values ride along as one-element lists; nothing is lost.
ALTER TABLE "Application" ADD COLUMN "sources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Application" SET "sources" = ARRAY[btrim("source")] WHERE btrim("source") <> '';
ALTER TABLE "Application" DROP COLUMN "source";

-- A message you sent first — a LinkedIn DM, a cold email — is how a lot of
-- searches actually start, sometimes before there is a listing at all.
-- Recording it as NOTE hid that from the timeline and the record.
ALTER TYPE "ActivityType" ADD VALUE 'OUTREACH';
