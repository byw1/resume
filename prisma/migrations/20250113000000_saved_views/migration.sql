-- Named pipeline views.
--
-- The query string is the whole record: the toolbar already encodes view,
-- filter, sort and search into the URL, so a saved view is a name for a URL
-- and nothing else. Anything the toolbar learns to encode later is saved
-- without touching this table.
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedView_userId_name_key" ON "SavedView"("userId", "name");
CREATE INDEX "SavedView_userId_name_idx" ON "SavedView"("userId", "name");

ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
