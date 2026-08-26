# The image for self-hosting. Not needed if you deploy to Vercel.
#
# Three stages: dependencies, build, run. Only the standalone output and the Prisma
# engines reach the last one, so the image does not carry the whole source tree.

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
# argon2 is a native addon and needs a toolchain to build. It is needed only in this
# stage and never reaches the runtime image.
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
# From pnpm 10 on, dependency install scripts are blocked by default, and the interactive approval
# cannot be used inside an image build. What runs here is only what the lockfile pins, and
# argon2, the Prisma engines and sharp all fail at runtime without their scripts.
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Inlined at build time, so it has to be passed here. It is not a secret.
ARG NEXT_PUBLIC_TIMEZONE=Asia/Seoul
ENV NEXT_PUBLIC_TIMEZONE=$NEXT_PUBLIC_TIMEZONE
RUN pnpm exec prisma generate && pnpm exec next build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# No reason to run as root.
RUN addgroup -S offon && adduser -S offon -G offon

COPY --from=builder /app/public ./public
# The standalone output already contains the dependencies actually used, the Prisma client and engines.
# pnpm links rather than copies, so picking pieces out of node_modules by hand breaks those links.
COPY --from=builder --chown=offon:offon /app/.next/standalone ./
COPY --from=builder --chown=offon:offon /app/.next/static ./.next/static
# The schema comes along so migrations can be run from inside the container.
COPY --from=builder /app/prisma ./prisma

USER offon
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
