-- Sources become rows the person owns.
--
-- They were a String[] on Application, which had two consequences the owner of
-- a workspace could do nothing about: every spelling anyone ever typed became a
-- permanent option, and the six starter suggestions were appended to the
-- picker's list forever in code, so the list could only ever grow. A row can be
-- renamed, recoloured and deleted.
--
-- The backfill folds case-variants together: "LinkedIn", "linkedin" and
-- " LinkedIn " across different applications become one source, keeping the
-- first spelling seen. Ids are generated here because cuid() is application
-- side; gen_random_uuid() is built in from Postgres 13.

CREATE TABLE "Source" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "color"     TEXT NOT NULL DEFAULT 'slate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationSource" (
    "applicationId" TEXT NOT NULL,
    "sourceId"      TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationSource_pkey" PRIMARY KEY ("applicationId","sourceId")
);

CREATE UNIQUE INDEX "Source_userId_key_key" ON "Source"("userId", "key");
CREATE INDEX "Source_userId_name_idx" ON "Source"("userId", "name");
CREATE INDEX "ApplicationSource_sourceId_idx" ON "ApplicationSource"("sourceId");

ALTER TABLE "Source" ADD CONSTRAINT "Source_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationSource" ADD CONSTRAINT "ApplicationSource_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationSource" ADD CONSTRAINT "ApplicationSource_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per person per distinct case-folded label. DISTINCT ON keeps the
-- first spelling encountered, which is as good a choice as any and stable.
INSERT INTO "Source" ("id", "userId", "name", "key", "color")
SELECT
    gen_random_uuid()::text,
    labels."userId",
    labels."name",
    labels."key",
    -- Spread the eight swatches deterministically rather than making every
    -- source slate: a picker where everything is grey teaches nothing.
    (ARRAY['slate','blue','teal','green','amber','red','violet','pink'])[
        (abs(hashtext(labels."key")) % 8) + 1
    ]
FROM (
    SELECT DISTINCT ON (a."userId", lower(btrim(s.label)))
        a."userId",
        btrim(s.label)          AS "name",
        lower(btrim(s.label))   AS "key"
    FROM "Application" a
    CROSS JOIN LATERAL unnest(a."sources") AS s(label)
    WHERE btrim(s.label) <> ''
    ORDER BY a."userId", lower(btrim(s.label)), a."createdAt"
) AS labels;

INSERT INTO "ApplicationSource" ("applicationId", "sourceId")
SELECT DISTINCT a."id", src."id"
FROM "Application" a
CROSS JOIN LATERAL unnest(a."sources") AS s(label)
JOIN "Source" src
  ON src."userId" = a."userId"
 AND src."key" = lower(btrim(s.label))
WHERE btrim(s.label) <> '';

ALTER TABLE "Application" DROP COLUMN "sources";
