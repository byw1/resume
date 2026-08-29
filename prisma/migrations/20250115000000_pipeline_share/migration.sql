-- A read-only link to a pipeline, so somebody can help review a job search.
--
-- Same privacy model as an unlisted resume: an unguessable slug and nothing
-- else. Revoking deletes the row, which destroys the address rather than
-- pausing it — re-sharing mints a different one.
CREATE TABLE "PipelineShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "includeClosed" BOOLEAN NOT NULL DEFAULT false,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PipelineShare_userId_key" ON "PipelineShare"("userId");
CREATE UNIQUE INDEX "PipelineShare_slug_key" ON "PipelineShare"("slug");

ALTER TABLE "PipelineShare" ADD CONSTRAINT "PipelineShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
