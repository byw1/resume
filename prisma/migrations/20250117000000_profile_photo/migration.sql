-- One picture, and the resumes that choose to show it.
--
-- The photo is a data URI on the profile rather than a file in an object store.
-- That keeps self-hosting at one environment variable, and it means a published
-- resume at /r/<slug> paints the headshot from the same HTML the text arrives
-- in: no second request, nothing to authenticate, nothing to expire. The
-- browser downscales to a square before upload and the server caps what it will
-- store, so the row stays tens of kilobytes rather than megabytes.
--
-- Resume.showPhoto is a design switch beside template and accent, not document
-- content: the resume says whether to show a face, the profile says whose. So
-- replacing the picture updates every document at once, and no saved
-- Resume.data changes meaning.
ALTER TABLE "Profile" ADD COLUMN "photo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Resume" ADD COLUMN "showPhoto" BOOLEAN NOT NULL DEFAULT false;
