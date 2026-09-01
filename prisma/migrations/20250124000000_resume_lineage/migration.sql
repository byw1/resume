-- A tailored resume remembers what it was tailored from.
--
-- duplicate_resume is the mechanical half of tailoring; this column is what
-- makes the result reviewable — the grid can group variants under their base
-- and compare_resumes can say exactly which bullets a variant added, dropped
-- or reworded. The reference is flattened to the root when a variant is
-- itself copied, so lineage stays one level deep, which is all the grid or
-- the diff ever shows.
--
-- SET NULL rather than CASCADE: deleting a base resume makes its variants
-- standalone documents. They are someone's tailored work, not children.
ALTER TABLE "Resume" ADD COLUMN "baseResumeId" TEXT;

ALTER TABLE "Resume" ADD CONSTRAINT "Resume_baseResumeId_fkey"
  FOREIGN KEY ("baseResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Resume_baseResumeId_idx" ON "Resume"("baseResumeId");
