-- Google sign-in.
--
-- Nullable and unique rather than the `String @default("")` used elsewhere in
-- this schema: this column is an identity, and Postgres allows many NULLs
-- under a unique index but only one empty string. The database is the only
-- place that can actually stop two accounts claiming the same Google account.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
