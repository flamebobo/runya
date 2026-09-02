FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain-types/package.json packages/domain-types/
COPY packages/shared-utils/package.json packages/shared-utils/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY . .
RUN pnpm --filter @runew/shared-utils build \
  && pnpm --filter @runew/domain-types build \
  && pnpm --filter @runew/validation build \
  && pnpm --filter @runew/contracts build \
  && pnpm db:generate \
  && pnpm db:migrate \
  && pnpm --filter @runew/server build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/server/dist/server.js"]
