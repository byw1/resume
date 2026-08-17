-- A resume can have a public URL.
--
-- Purely additive: every existing resume stays PRIVATE with a null slug, which
-- is the same behaviour it had before this migration. Nothing becomes reachable
-- without somebody publishing it on purpose.
--
-- The unique index on slug is what makes allocation safe under concurrency —
-- two publishes racing on the same generated slug lose one insert rather than
-- silently pointing two resumes at one URL.

-- CreateEnum
CREATE TYPE "ResumeVisibility" AS ENUM ('PRIVATE', 'UNLISTED');

-- AlterTable
ALTER TABLE "Resume" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "visibility" "ResumeVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateIndex
CREATE UNIQUE INDEX "Resume_slug_key" ON "Resume"("slug");
