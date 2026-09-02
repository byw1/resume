-- Sources become tags, and three of a company's fields become tags with them.
--
-- A source was already the right shape — a row the person owns, with a name, a
-- colour, and the ability to be renamed or deleted — and it was the only field
-- in the app that had it. Industry, size and location were String columns:
-- one value each, a typo you had to fix company by company, and no way to ask
-- "who else is fintech". They are the same thing wearing a worse form, so
-- there is now one table with a kind rather than six near-copies of one idea.
--
-- Nothing is lost. Every distinct value becomes a tag of its kind, folded
-- case-insensitively per person, and every company that had the value is
-- linked to it. Only then do the columns go.

CREATE TYPE "TagKind" AS ENUM ('APPLICATION', 'COMPANY', 'CONTACT', 'INDUSTRY', 'SIZE', 'LOCATION');

-- Source is Tag, renamed in place so its ids survive: an application's links
-- point at them, and a saved view's `src=` parameter holds them.
ALTER TABLE "Source" RENAME TO "Tag";
ALTER TABLE "Tag" RENAME CONSTRAINT "Source_pkey" TO "Tag_pkey";
ALTER TABLE "Tag" RENAME CONSTRAINT "Source_userId_fkey" TO "Tag_userId_fkey";
ALTER TABLE "Tag" ADD COLUMN "kind" "TagKind" NOT NULL DEFAULT 'APPLICATION';

-- Uniqueness is per kind now: "Remote" can be a location and a tag at once.
DROP INDEX "Source_userId_key_key";
DROP INDEX "Source_userId_name_idx";
CREATE UNIQUE INDEX "Tag_userId_kind_key_key" ON "Tag"("userId", "kind", "key");
CREATE INDEX "Tag_userId_kind_name_idx" ON "Tag"("userId", "kind", "name");

ALTER TABLE "ApplicationSource" RENAME TO "ApplicationTag";
ALTER TABLE "ApplicationTag" RENAME COLUMN "sourceId" TO "tagId";
ALTER TABLE "ApplicationTag" RENAME CONSTRAINT "ApplicationSource_pkey" TO "ApplicationTag_pkey";
ALTER TABLE "ApplicationTag" RENAME CONSTRAINT "ApplicationSource_applicationId_fkey"
  TO "ApplicationTag_applicationId_fkey";
ALTER TABLE "ApplicationTag" RENAME CONSTRAINT "ApplicationSource_sourceId_fkey"
  TO "ApplicationTag_tagId_fkey";
ALTER INDEX "ApplicationSource_sourceId_idx" RENAME TO "ApplicationTag_tagId_idx";

CREATE TABLE "CompanyTag" (
    "companyId" TEXT NOT NULL,
    "tagId"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyTag_pkey" PRIMARY KEY ("companyId", "tagId")
);
CREATE INDEX "CompanyTag_tagId_idx" ON "CompanyTag"("tagId");

CREATE TABLE "ContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId", "tagId")
);
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

ALTER TABLE "CompanyTag" ADD CONSTRAINT "CompanyTag_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyTag" ADD CONSTRAINT "CompanyTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One tag per person per distinct value, per kind. DISTINCT ON keeps the first
-- spelling encountered, and the swatch is spread over the palette the way the
-- source backfill did rather than making everything slate.
INSERT INTO "Tag" ("id", "userId", "kind", "name", "key", "color")
SELECT
    gen_random_uuid()::text,
    v."userId",
    v.kind,
    v.name,
    v.key,
    (ARRAY['slate','blue','teal','green','amber','red','violet','pink'])[
        (abs(hashtext(v.key)) % 8) + 1
    ]
FROM (
    SELECT DISTINCT ON (c."userId", lower(btrim(c."industry")))
        c."userId", 'INDUSTRY'::"TagKind" AS kind,
        btrim(c."industry") AS name, lower(btrim(c."industry")) AS key
    FROM "Company" c WHERE btrim(c."industry") <> ''
    ORDER BY c."userId", lower(btrim(c."industry")), c."createdAt"
) v
UNION ALL
SELECT
    gen_random_uuid()::text, v."userId", v.kind, v.name, v.key,
    (ARRAY['slate','blue','teal','green','amber','red','violet','pink'])[
        (abs(hashtext(v.key)) % 8) + 1
    ]
FROM (
    SELECT DISTINCT ON (c."userId", lower(btrim(c."size")))
        c."userId", 'SIZE'::"TagKind" AS kind,
        btrim(c."size") AS name, lower(btrim(c."size")) AS key
    FROM "Company" c WHERE btrim(c."size") <> ''
    ORDER BY c."userId", lower(btrim(c."size")), c."createdAt"
) v
UNION ALL
SELECT
    gen_random_uuid()::text, v."userId", v.kind, v.name, v.key,
    (ARRAY['slate','blue','teal','green','amber','red','violet','pink'])[
        (abs(hashtext(v.key)) % 8) + 1
    ]
FROM (
    SELECT DISTINCT ON (c."userId", lower(btrim(c."location")))
        c."userId", 'LOCATION'::"TagKind" AS kind,
        btrim(c."location") AS name, lower(btrim(c."location")) AS key
    FROM "Company" c WHERE btrim(c."location") <> ''
    ORDER BY c."userId", lower(btrim(c."location")), c."createdAt"
) v;

INSERT INTO "CompanyTag" ("companyId", "tagId")
SELECT c."id", t."id"
FROM "Company" c
JOIN "Tag" t
  ON t."userId" = c."userId" AND t."kind" = 'INDUSTRY' AND t."key" = lower(btrim(c."industry"))
WHERE btrim(c."industry") <> '';

INSERT INTO "CompanyTag" ("companyId", "tagId")
SELECT c."id", t."id"
FROM "Company" c
JOIN "Tag" t
  ON t."userId" = c."userId" AND t."kind" = 'SIZE' AND t."key" = lower(btrim(c."size"))
WHERE btrim(c."size") <> '';

INSERT INTO "CompanyTag" ("companyId", "tagId")
SELECT c."id", t."id"
FROM "Company" c
JOIN "Tag" t
  ON t."userId" = c."userId" AND t."kind" = 'LOCATION' AND t."key" = lower(btrim(c."location"))
WHERE btrim(c."location") <> '';

ALTER TABLE "Company" DROP COLUMN "industry";
ALTER TABLE "Company" DROP COLUMN "size";
ALTER TABLE "Company" DROP COLUMN "location";
