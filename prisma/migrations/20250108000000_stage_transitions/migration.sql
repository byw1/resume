-- Stage history has to be recoverable to diagnose a search.
--
-- Until now a move wrote "Applied → Screening" into the activity body, which is
-- lossy in two ways: a caller-supplied note replaces it entirely, and the
-- activity type collapses Screening, Interviewing, Final round and Withdrawn
-- into one STAGE_CHANGE. Recording the transition itself costs two nullable
-- columns and makes the funnel trustworthy rather than inferred.
ALTER TABLE "Activity" ADD COLUMN "fromStage" "Stage";
ALTER TABLE "Activity" ADD COLUMN "toStage" "Stage";

-- Backfill the rows whose body still carries the generated arrow. Anything that
-- was written with a note stays null, which is correct: we genuinely do not
-- know, and guessing would be worse than a gap.
UPDATE "Activity"
SET "fromStage" = CASE split_part(body, ' → ', 1)
      WHEN 'Wishlist'     THEN 'WISHLIST'::"Stage"
      WHEN 'Applied'      THEN 'APPLIED'::"Stage"
      WHEN 'Screening'    THEN 'SCREEN'::"Stage"
      WHEN 'Interviewing' THEN 'INTERVIEW'::"Stage"
      WHEN 'Final round'  THEN 'FINAL'::"Stage"
      WHEN 'Offer'        THEN 'OFFER'::"Stage"
      WHEN 'Accepted'     THEN 'ACCEPTED'::"Stage"
      WHEN 'Rejected'     THEN 'REJECTED'::"Stage"
      WHEN 'Withdrawn'    THEN 'WITHDRAWN'::"Stage"
    END,
    "toStage" = CASE split_part(body, ' → ', 2)
      WHEN 'Wishlist'     THEN 'WISHLIST'::"Stage"
      WHEN 'Applied'      THEN 'APPLIED'::"Stage"
      WHEN 'Screening'    THEN 'SCREEN'::"Stage"
      WHEN 'Interviewing' THEN 'INTERVIEW'::"Stage"
      WHEN 'Final round'  THEN 'FINAL'::"Stage"
      WHEN 'Offer'        THEN 'OFFER'::"Stage"
      WHEN 'Accepted'     THEN 'ACCEPTED'::"Stage"
      WHEN 'Rejected'     THEN 'REJECTED'::"Stage"
      WHEN 'Withdrawn'    THEN 'WITHDRAWN'::"Stage"
    END
WHERE body LIKE '% → %';

-- Reading a funnel means scanning one person's transitions in time order.
CREATE INDEX "Activity_userId_toStage_idx" ON "Activity"("userId", "toStage");
