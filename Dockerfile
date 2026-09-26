FROM oven/bun:1.4.2-alpine AS bun

FROM node:24-alpine AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
CMD ["bun", "run", "start"]
