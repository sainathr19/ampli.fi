FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["bun", "run", "start"]
