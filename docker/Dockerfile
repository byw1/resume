# The self-hosting image.
#
# This is what docker-compose.yml builds and what CI publishes to
# ghcr.io/shifulaboratories/hired. It exists so that self-hosting is one command with no
# configuration, and so the server can render a PDF: that needs a real
# browser, and a stock Node image has none.
#
# It lives in docker/, not the repo root, and that placement is load-bearing:
# Railway auto-detects a root Dockerfile and uses it over the configured
# builder, and this image does not come up on Railway's Docker runtime (the
# healthcheck never sees it listen — twice observed, unexplained). Down here
# Railway can't find it, deploys from GitHub keep building the way they always
# have, and Docker stays what it is for: compose self-hosting and the GHCR
# image.
#
# The browser costs build time and image size and buys one-click PDF export.
# Everything else about the app is the same in and out of Docker: DATABASE_URL
# is the only required variable, migrations run on start, the owner account is
# provisioned on first boot and printed to the logs.

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
