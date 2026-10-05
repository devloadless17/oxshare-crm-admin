# OxShare admin console — production image (Next.js `output: 'standalone'`).
#
# The two NEXT_PUBLIC_* values are BAKED IN at build time. Next inlines them into
# the browser bundle AND into src/proxy.ts, which builds every response's CSP, so
# the API's domain is part of the image. A new domain is a REBUILD, never a
# restart: a restart changes nothing and looks exactly like the value being
# ignored. The build refuses to run without them rather than ship a console that
# calls localhost.
#
#   docker build \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_REALTIME_ORIGIN=https://api.example.com \
#     -t oxshare-admin:$(git rev-parse --short HEAD) .
#
# In production both are the API's origin: realtime reaches uWebSockets through
# the API host (its Caddy routes /socket.io/* to :3003), never a port of its own.
#
# bookworm-slim, not alpine: Next's image optimiser loads sharp's glibc build.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./

# npm 11, PINNED, for the reason the backend's Dockerfile gives at length: the
# npm bundled with node:22 (10.9) re-resolves a lockfile that carries `overrides`
# against the registry's latest, so `npm ci` starts refusing it on an upstream
# patch release with no commit involved. This package.json overrides js-yaml.
#
# "prepare": "husky" needs a .git the build context does not carry. npm ci
# reconciles dependencies, not scripts, so deleting it keeps the lockfile in step.
RUN npm install -g npm@11 \
 && npm pkg delete scripts.prepare \
 && npm ci --no-audit --no-fund

COPY . .

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_ORIGIN
# API_BASE_URL feeds the server-side /api rewrite in next.config.ts, which is read
# at build time and serialised into server.js. The browser never uses it.
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_REALTIME_ORIGIN=${NEXT_PUBLIC_REALTIME_ORIGIN} \
    API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
# After npm ci on purpose: checking the args earlier would make a domain change
# re-download every dependency.
RUN test -n "$NEXT_PUBLIC_API_BASE_URL" && test -n "$NEXT_PUBLIC_REALTIME_ORIGIN" \
 || { echo "build args NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_REALTIME_ORIGIN are required" >&2; exit 1; }
RUN npm run build


FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3002
WORKDIR /app

# server.js serves public/ and .next/static only when they sit beside it, and the
# standalone build leaves them out on purpose (it expects a CDN). There is no CDN,
# so they are copied in. Owned by `node` because the server writes its image cache
# under .next/cache at run time.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3002

# Liveness only: a static asset the server answers without rendering a page or
# calling the API, so an API outage never marks this container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/favicon.ico',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
