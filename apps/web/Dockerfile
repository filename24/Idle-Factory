# syntax=docker/dockerfile:1
#
# apps/web — Next.js 프로덕션 이미지
#
# 빌드 컨텍스트는 반드시 **레포 루트**다:
#   docker build -f apps/web/Dockerfile -t idle-factory-web .
#
# bot 이미지와 runner 구성이 다르다. `output: 'standalone'` 이 필요한
# node_modules 까지 추려 `.next/standalone` 에 담아주므로 web 에는
# `pnpm deploy` 가 필요 없다. (실측: @prisma/client·pg·ioredis 가 추적되고
# @idle/* 워크스페이스 패키지는 서버 번들에 인라인된다.)

ARG NODE_VERSION=22
ARG TURBO_VERSION=2.9.6

# ── base: 공통 pnpm 런타임 ─────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Node 내장 corepack 은 pnpm 10 의 서명 키를 모를 수 있어 "Cannot find
# matching keyid" 로 죽는다. 최신 corepack 으로 교체한다.
RUN npm install --global corepack@latest \
  && corepack enable
# 루트 package.json 의 postinstall 은 `is-ci || husky` 다. 빌드 컨텍스트에
# .git 이 없으므로(.dockerignore) husky 가 실패한다 → 건너뛴다.
ENV HUSKY=0
WORKDIR /app

# ── pruner: web 에 필요한 워크스페이스만 추린다 ────────────────────────
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install --global turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune web --docker

# ── installer: 의존성 설치 + next build ────────────────────────────────
FROM base AS installer

# 1) 의존성 그래프만 먼저 넣는다. 소스만 바뀔 때 install 레이어를 재사용한다.
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

# 2) 소스 투입
COPY --from=pruner /app/out/full/ ./
# turbo prune 은 루트 tsup.config.ts 를 옮기지 않는다(실측). @idle/database·
# @idle/game-core 빌드가 ../../tsup.config 를 import 하므로 없으면 깨진다.
COPY tsup.config.ts ./

# src/lib/db.ts 가 모듈 로드 시점에 DatabaseClient 를 만들고, 그 안에서
# PrismaPg 가 connectionString 을 요구한다. lib/env.ts 는 빌드 페이즈
# 예외를 두지만 DATABASE_URL 은 그 예외에 포함되지 않는다 → 더미 값 필수.
# 빌드 중 $connect() 는 실패하지만 catch 되어 로그만 남는다.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* 은 빌드 시점에 클라이언트 번들로 치환된다 — 런타임 주입이
# 불가하므로 빌드 인자로만 받는다. 비워두면 auth-client 의 baseURL 이
# 상대 경로(/api/auth)로 떨어져 same-origin 배포에서 정상 동작한다.
# web 과 다른 오리진에서 인증을 붙일 때만 값을 넘긴다(이미지가 도메인에 종속됨).
ARG NEXT_PUBLIC_APP_URL=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN pnpm exec turbo run build --filter=web

# ── runner: 최종 런타임 이미지 ─────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runner
ENV NODE_ENV=production
# standalone server.js 는 이 두 값으로 바인딩한다. 0.0.0.0 이 아니면
# 컨테이너 외부(리버스 프록시)에서 접근할 수 없다.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# /api/health 가 응답에 실어 보내는 이미지 식별자.
ARG BUILD_NUMBER=unknown
ENV BUILD_NUMBER=$BUILD_NUMBER

# outputFileTracingRoot 를 워크스페이스 루트로 잡았으므로 standalone 산출물이
# 모노레포 구조를 유지한다 → 엔트리는 apps/web/server.js 다.
COPY --from=installer --chown=node:node /app/apps/web/.next/standalone ./
# static 과 public 은 트레이싱 대상이 아니라 수동으로 옮겨야 한다.
# 빠뜨리면 페이지는 뜨지만 CSS·JS·이미지가 전부 404 가 된다.
COPY --from=installer --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

# /api/health 는 DB 를 건드리지 않는 liveness 프로브다(src/lib/health.ts).
# start-period 는 Next 서버 부팅 시간을 감싼다.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
