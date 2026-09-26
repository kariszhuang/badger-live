# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.2-alpine AS bun

FROM node:24-alpine AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
RUN --mount=type=cache,id=badger-bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=badger-next,target=/app/.next/cache \
    bun run build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
