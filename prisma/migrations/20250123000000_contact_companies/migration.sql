-- A person can represent more than one company.
--
-- Contact.companyId was a single nullable FK, which forced a choice the data
-- does not have: someone is a founder at one company, an advisor at another
-- and a friend who just moved to a third, and picking one meant losing the
-- rest. The join carries the same information for everyone who had one
-- employer, so the backfill is lossless.
--
-- Cascade on both sides matches what the old SET NULL achieved: deleting a
-- company removes the link, never the person.

CREATE TABLE "ContactCompany" (
    "contactId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactCompany_pkey" PRIMARY KEY ("contactId","companyId")
);

CREATE INDEX "ContactCompany_companyId_idx" ON "ContactCompany"("companyId");

-- Before the foreign keys, so a row orphaned by an older bug cannot fail the
-- whole deploy: the join only takes pairs both of whose ends still exist.
INSERT INTO "ContactCompany" ("contactId", "companyId", "createdAt")
SELECT c."id", c."companyId", c."createdAt"
FROM "Contact" c
JOIN "Company" co ON co."id" = c."companyId"
WHERE c."companyId" IS NOT NULL;

ALTER TABLE "ContactCompany" ADD CONSTRAINT "ContactCompany_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactCompany" ADD CONSTRAINT "ContactCompany_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contact" DROP CONSTRAINT "Contact_companyId_fkey";
ALTER TABLE "Contact" DROP COLUMN "companyId";
