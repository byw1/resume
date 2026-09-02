-- A person's own Gmail and Google Calendar, read on their behalf.
--
-- One row per user, holding the refresh token Google issued when they pressed
-- Connect under Settings → Google. Separate from User.googleId, which is a
-- sign-in identity: proving who you are and letting the app read your inbox
-- are two different grants, and people give them to different accounts.
--
-- Nothing read through this row is ever written to the database. Every
-- screen and tool asks Google live and shows what came back, so disconnecting
-- deletes the only thing this instance holds.
CREATE TABLE "GoogleAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "googleId" TEXT NOT NULL DEFAULT '',
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "refreshToken" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL DEFAULT '',
  "accessTokenExpiresAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "lastErrorAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAccount_userId_key" ON "GoogleAccount"("userId");

ALTER TABLE "GoogleAccount" ADD CONSTRAINT "GoogleAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
