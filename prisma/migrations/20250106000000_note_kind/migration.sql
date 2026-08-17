-- A note can be a standing rule rather than a filed thought.
--
-- Purely additive: every existing note stays a plain NOTE, which is exactly the
-- behaviour it had before. Nothing starts appearing in the server instructions
-- until somebody marks it as a guardrail on purpose.

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('NOTE', 'GUARDRAIL');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "kind" "NoteKind" NOT NULL DEFAULT 'NOTE';

-- CreateIndex
CREATE INDEX "Note_userId_kind_idx" ON "Note"("userId", "kind");
