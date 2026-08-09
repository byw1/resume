-- Named MCP connections, one per AI client.
--
-- Replaces the single User.mcpToken. Written by hand rather than generated so
-- the existing token can be carried into a connection row before the column is
-- dropped: every URL already pasted into a client keeps working, and nobody has
-- to reconnect after this deploy.

-- CreateTable
CREATE TABLE "McpConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT NOT NULL DEFAULT 'other',
    "token" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedFrom" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_token_key" ON "McpConnection"("token");

-- CreateIndex
CREATE INDEX "McpConnection_userId_idx" ON "McpConnection"("userId");

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry every existing token across. The id is derived from the user id, which
-- is unique and gives the insert a natural primary key without a cuid()
-- generator. It is named "Claude" because that is the only client the app has
-- ever told anyone to paste it into.
INSERT INTO "McpConnection" ("id", "userId", "name", "client", "token", "createdAt")
SELECT 'mcpc_' || "id", "id", 'Claude', 'claude', "mcpToken", "createdAt"
FROM "User"
WHERE "mcpToken" IS NOT NULL AND "mcpToken" <> '';

-- DropIndex
DROP INDEX IF EXISTS "User_mcpToken_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "mcpToken";
