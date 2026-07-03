FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm config set dangerouslyAllowAllBuilds true \
  && pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 bot \
  && adduser --system --uid 1001 telegram -G bot

COPY --from=deps --chown=telegram:bot /app/node_modules ./node_modules
COPY --chown=telegram:bot telegram-bot/index.mjs ./telegram-bot/index.mjs

USER telegram
CMD ["node", "telegram-bot/index.mjs"]
