# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# API (NestJS) — api.arkan.gold
# بیلد از ریشه‌ی repo:  docker build -f deploy/chabokan/api.Dockerfile .
# ─────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV CI=true
# (Prisma 7 با درایور pg به OpenSSL سیستم نیاز ندارد؛ هشدار libssl هنگام migrate بی‌خطر است)
RUN npm config set registry "$NPM_REGISTRY" \
  && npm install -g pnpm@11.20.0 \
  && pnpm config set registry "$NPM_REGISTRY"
WORKDIR /repo

# ── وابستگی‌ها (لایه‌ی cache جدا از سورس) ──
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY app/package.json app/
COPY admin/package.json admin/
RUN pnpm install --frozen-lockfile --filter "api..."

# ── سورس و بیلد ──
COPY packages/shared packages/shared
COPY api api
RUN pnpm --filter @arkan-gold/shared build \
  && cd api \
  && pnpm exec prisma generate \
  && pnpm build \
  && mkdir -p uploads/products uploads/packaging uploads/legal-documents

# ── اجرا ──
FROM base AS runtime
ENV NODE_ENV=production \
    TZ=UTC \
    PORT=5000 \
    RUN_MIGRATIONS=true
COPY --from=build /repo /repo
WORKDIR /repo/api
# فایل‌های آپلودی (تصاویر محصول، بسته‌بندی، مدارک حقوقی) — دیسک دائمی چابکان را اینجا mount کنید
VOLUME ["/repo/api/uploads"]
EXPOSE 5000
# پیش از بالا آمدن سرویس، migrationهای Prisma اعمال می‌شوند (با RUN_MIGRATIONS=false غیرفعال می‌شود)
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = \"true\" ]; then pnpm exec prisma migrate deploy; fi && exec node dist/src/main"]
