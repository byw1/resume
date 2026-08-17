# Why this exists, and why it isn't Nixpacks any more.
#
# Everything in this app worked on Nixpacks except one thing: rendering a PDF
# on the server needs a real browser, and Railway's default image has none.
# Railway's own guidance for anything Chromium-shaped is a Dockerfile, so this
# is the documented path rather than a clever workaround.
#
# It costs build time and image size. It costs the person deploying nothing —
# Railway detects this file and uses it, so "deploy from GitHub repo" is still
# the whole procedure, and DATABASE_URL is still the only variable. If you'd
# rather not carry a browser, delete this file and set the builder back to
# NIXPACKS in railway.json: the PDF button then falls back to the print page,
# which is exactly how it behaved before.

FROM node:20-bookworm-slim

# chromium          — what src/lib/pdf.ts drives; lands at /usr/bin/chromium
# fonts-croscore    — Tinos, the serif the Harvard template actually asks for
# fonts-liberation  — the metric-compatible fallback behind it
# openssl           — Prisma's engines need it
#
# Fonts matter more than they look: without a Times-metric serif in the image,
# a server-rendered PDF would silently fall back to whatever Chromium has and
# stop matching the on-screen document.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-croscore \
      fonts-liberation \
      openssl \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PDF_CHROMIUM_PATH=/usr/bin/chromium
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Dependencies first so a source-only change doesn't reinstall them. Every build
# dependency lives in `dependencies` (see package.json), so a production install
# is still a complete one.
#
# prisma/ has to come along here, not with the rest of the source: npm's
# postinstall hook runs `prisma generate`, which needs the schema to exist. The
# schema changes far less often than src/, so this costs nothing in cache hits.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# `npm run build` runs `prisma generate && next build`.
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# railway.json's startCommand overrides this; it is here so the image is
# runnable on its own.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT:-3000}"]
