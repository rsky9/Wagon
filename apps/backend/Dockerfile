# Backend build — works with Fly.io, Render, Railway, ECS, etc.
FROM node:22-bookworm-slim AS builder
RUN corepack enable
ENV CI=true
WORKDIR /app
# Copy the whole workspace so pnpm workspaces resolve @wagon/* packages.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wagon/backend exec prisma generate
RUN pnpm --filter @wagon/backend build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Copy workspace + node_modules + built backend.
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
# Regenerate the Prisma client inside the final image (matches its OpenSSL).
RUN cd apps/backend && ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma
EXPOSE 4000
CMD ["node", "apps/backend/dist/src/main.js"]
