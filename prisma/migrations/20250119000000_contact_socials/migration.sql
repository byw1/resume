-- A person is reachable in more than one place.
--
-- A contact carried exactly one link, LinkedIn, which is the right guess for a
-- recruiter and the wrong one for everybody else: the founder who only answers
-- on X, the designer whose portfolio is the whole point, the friend you talk to
-- on Instagram. Named columns for the platforms people ask for by name, and a
-- list for the tail — Bluesky, Mastodon, a Substack — which has no end and
-- does not need one.
ALTER TABLE "Contact" ADD COLUMN "twitter"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "instagram"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "github"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "website"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "otherLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
