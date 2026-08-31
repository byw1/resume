-- When this instance last had a reason to believe an address belongs to the
-- account holding it.
--
-- Google sign-in matches people by email address, so "who set this address"
-- becomes a security question: a member can change their own email to anything
-- unused, and without this column a Google sign-in would hand that member's
-- workspace to whoever actually owns the address.
--
-- Existing rows are backfilled to createdAt. Before this migration there was
-- no Google sign-in, so squatting an address gained an attacker nothing that
-- was not already visible to an admin — every address on the instance today
-- was set in a world where it could not be cashed in.
ALTER TABLE "User" ADD COLUMN "emailProvenAt" TIMESTAMP(3);

UPDATE "User" SET "emailProvenAt" = "createdAt";
