-- Companies and contacts become records you visit, not rows that exist only to
-- hang off an application. A records list sorts by recency like every other
-- list in the app, which needs a column to sort on.
ALTER TABLE "Company" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Contact" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Both lists are read newest-first and scoped to one person.
CREATE INDEX "Company_userId_updatedAt_idx" ON "Company"("userId", "updatedAt");
CREATE INDEX "Contact_userId_updatedAt_idx" ON "Contact"("userId", "updatedAt");
