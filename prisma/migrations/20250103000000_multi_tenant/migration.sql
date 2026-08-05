-- Multi-tenancy.
--
-- Every previously global record gains an owner. Because `userId` must end up
-- NOT NULL, and an existing single-user install already has rows, this migration
-- creates a placeholder owner, backfills every table to it, and only then adds
-- the constraint.
--
-- The placeholder has an empty passwordHash, which no login path will ever
-- match. The first-run setup flow adopts it: claiming the instance turns this
-- row into the real super admin, so data from the single-user era survives with
-- its ids intact.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mcpToken" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_mcpToken_key" ON "User"("mcpToken");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");
CREATE INDEX "Invite_email_idx" ON "Invite"("email");
CREATE INDEX "Invite_acceptedAt_idx" ON "Invite"("acceptedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The placeholder owner. Adopted by the first-run setup flow.
INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "isActive", "mcpToken", "updatedAt")
VALUES (
    'usr_unclaimed_owner',
    'setup-pending@resume-os.local',
    '',
    '',
    'SUPER_ADMIN',
    true,
    'rsm_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    CURRENT_TIMESTAMP
);

-- DropIndex
DROP INDEX "Application_nextFollowUpAt_idx";
DROP INDEX "Application_stage_idx";
DROP INDEX "Company_name_key";
DROP INDEX "Role_sortOrder_idx";
DROP INDEX "Task_done_dueAt_idx";

-- AlterTable: add ownership, nullable at first so existing rows survive.
ALTER TABLE "Activity"      ADD COLUMN "userId" TEXT;
ALTER TABLE "Application"   ADD COLUMN "userId" TEXT;
ALTER TABLE "Certification" ADD COLUMN "userId" TEXT;
ALTER TABLE "Company"       ADD COLUMN "userId" TEXT;
ALTER TABLE "Contact"       ADD COLUMN "userId" TEXT;
ALTER TABLE "Education"     ADD COLUMN "userId" TEXT;
ALTER TABLE "Highlight"     ADD COLUMN "userId" TEXT;
ALTER TABLE "Note"          ADD COLUMN "userId" TEXT;
ALTER TABLE "Profile"       ADD COLUMN "userId" TEXT;
ALTER TABLE "Project"       ADD COLUMN "userId" TEXT;
ALTER TABLE "Resume"        ADD COLUMN "userId" TEXT;
ALTER TABLE "Role"          ADD COLUMN "userId" TEXT;
ALTER TABLE "SkillGroup"    ADD COLUMN "userId" TEXT;
ALTER TABLE "Task"          ADD COLUMN "userId" TEXT;

ALTER TABLE "Profile" ALTER COLUMN "id" DROP DEFAULT;

-- Backfill every pre-existing row to the placeholder owner.
UPDATE "Activity"      SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Application"   SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Certification" SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Company"       SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Contact"       SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Education"     SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Highlight"     SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Note"          SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Profile"       SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Project"       SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Resume"        SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Role"          SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "SkillGroup"    SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;
UPDATE "Task"          SET "userId" = 'usr_unclaimed_owner' WHERE "userId" IS NULL;

-- A single-user install could only ever have had one Profile, but the new
-- unique constraint is on userId, so collapse any duplicates defensively.
DELETE FROM "Profile" a USING "Profile" b
  WHERE a."userId" = b."userId" AND a.ctid > b.ctid;

-- Now the column can be required.
ALTER TABLE "Activity"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Application"   ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Certification" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Company"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Contact"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Education"     ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Highlight"     ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Note"          ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Profile"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Project"       ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Resume"        ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Role"          ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "SkillGroup"    ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Task"          ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Activity_userId_occurredAt_idx" ON "Activity"("userId", "occurredAt");
CREATE INDEX "Application_userId_stage_idx" ON "Application"("userId", "stage");
CREATE INDEX "Application_userId_nextFollowUpAt_idx" ON "Application"("userId", "nextFollowUpAt");
CREATE INDEX "Certification_userId_idx" ON "Certification"("userId");
CREATE INDEX "Company_userId_idx" ON "Company"("userId");
CREATE UNIQUE INDEX "Company_userId_name_key" ON "Company"("userId", "name");
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");
CREATE INDEX "Education_userId_idx" ON "Education"("userId");
CREATE INDEX "Highlight_userId_idx" ON "Highlight"("userId");
CREATE INDEX "Note_userId_idx" ON "Note"("userId");
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Resume_userId_idx" ON "Resume"("userId");
CREATE INDEX "Role_userId_sortOrder_idx" ON "Role"("userId", "sortOrder");
CREATE INDEX "SkillGroup_userId_idx" ON "SkillGroup"("userId");
CREATE INDEX "Task_userId_done_dueAt_idx" ON "Task"("userId", "done", "dueAt");

-- AddForeignKey
ALTER TABLE "Profile"       ADD CONSTRAINT "Profile_userId_fkey"       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Role"          ADD CONSTRAINT "Role_userId_fkey"          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Highlight"     ADD CONSTRAINT "Highlight_userId_fkey"     FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Education"     ADD CONSTRAINT "Education_userId_fkey"     FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project"       ADD CONSTRAINT "Project_userId_fkey"       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillGroup"    ADD CONSTRAINT "SkillGroup_userId_fkey"    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note"          ADD CONSTRAINT "Note_userId_fkey"          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Resume"        ADD CONSTRAINT "Resume_userId_fkey"        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Company"       ADD CONSTRAINT "Company_userId_fkey"       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application"   ADD CONSTRAINT "Application_userId_fkey"   FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact"       ADD CONSTRAINT "Contact_userId_fkey"       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity"      ADD CONSTRAINT "Activity_userId_fkey"      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task"          ADD CONSTRAINT "Task_userId_fkey"          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
