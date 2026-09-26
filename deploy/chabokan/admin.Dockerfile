# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# پنل ادمین (Next.js) — admin.arkan.gold
# بیلد از ریشه‌ی repo:  docker build -f deploy/chabokan/admin.Dockerfile .
# ─────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN npm config set registry "$NPM_REGISTRY" \
  && npm install -g pnpm@11.20.0 \
  && pnpm config set registry "$NPM_REGISTRY"
WORKDIR /repo

# ── وابستگی‌ها ──
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY app/package.json app/
COPY admin/package.json admin/
RUN pnpm install --frozen-lockfile --filter "admin..." --filter "@arkan-gold/shared"

# ── بیلد ──
# آدرس عمومی API که در کد سمت مرورگر (تصاویر محصولات و ...) جاسازی می‌شود
ARG NEXT_PUBLIC_NEST_ORIGIN=https://api.arkan.gold
ENV NEXT_PUBLIC_NEST_ORIGIN=${NEXT_PUBLIC_NEST_ORIGIN}
COPY packages/shared packages/shared
COPY admin admin
RUN pnpm --filter admin build

# ── اجرا (خروجی standalone) ──
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /srv
COPY --from=build /repo/admin/.next/standalone ./
COPY --from=build /repo/admin/.next/static ./admin/.next/static
COPY --from=build /repo/admin/public ./admin/public
USER node
EXPOSE 3000
CMD ["node", "admin/server.js"]
