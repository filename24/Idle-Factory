# syntax=docker/dockerfile:1
#
# apps/bot — Discord 봇 프로덕션 이미지
#
# 빌드 컨텍스트는 반드시 **레포 루트**다:
#   docker build -f apps/bot/Dockerfile -t idle-factory-bot .
#
# 설계 근거:
#  - alpine(musl) 대신 slim(glibc): @napi-rs/canvas 가 네이티브 모듈이고
#    linux-x64-gnu 변종을 쓴다. musl 로 가면 런타임 로드가 깨진다.
#  - Node 22: CI(.github/workflows/main.yml)가 22 로 빌드·테스트하므로
#    프로덕션도 같은 메이저를 쓴다. package.json engines 는 >=20.19.
#  - tsup 은 bundle:true 여도 dependencies 를 external 로 남긴다. 따라서
#    런타임에 node_modules 가 필요하고, pnpm 의 심볼릭 링크 트리를 그대로
#    복사하면 깨지므로 `pnpm deploy` 로 평탄화한다.

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

# ── pruner: 봇에 필요한 워크스페이스만 추린다 ──────────────────────────
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install --global turbo@${TURBO_VERSION}
COPY . .
# out/json = package.json + 락파일만 (의존성 레이어 캐싱용)
# out/full = 추려낸 소스 전체
RUN turbo prune bot --docker

# ── installer: 의존성 설치 + 빌드 ──────────────────────────────────────
FROM base AS installer

# 1) 의존성 그래프만 먼저 넣는다. 소스만 바뀔 때 install 레이어를 재사용한다.
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

# 2) 소스 투입
COPY --from=pruner /app/out/full/ ./
# turbo prune 은 globalDependencies 에 `**/tsup.config.ts` 가 있어도 루트
# tsup.config.ts 를 옮기지 않는다(실측). packages/{database,game-core}/
# tsup.config.ts 가 ../../tsup.config 를 import 하므로 없으면 빌드가 깨진다.
COPY tsup.config.ts ./

# prisma generate 는 turbo build 의 dependsOn 이라 빌드 중 반드시 실행된다.
# prisma.config.ts 가 env('DATABASE_URL') 을 요구하므로 더미 값을 넣는다.
# Prisma 7 은 드라이버 어댑터를 쓰므로 generate 가 DB 에 접속하지 않는다.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm exec turbo run build --filter=bot

# ── deployer: 런타임에 필요한 것만 평탄화 ──────────────────────────────
FROM installer AS deployer
# --legacy: pnpm 10 은 inject-workspace-packages=true 가 아닌 워크스페이스의
#   deploy 를 기본 거부한다(ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE).
# --prod: devDependencies 제외.
RUN pnpm deploy --filter=bot --prod --legacy /prod/bot

# ── runner: 최종 런타임 이미지 ─────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# src/config.ts 의 getBuildNumber() 는 .git 이 없으면 `git rev-parse` 에
# 실패해 'unknown' 을 쓴다. 배포 워크플로가 커밋 SHA 를 주입한다.
ARG BUILD_NUMBER=unknown
ENV BUILD_NUMBER=$BUILD_NUMBER

# node:*-slim 에는 uid/gid 1000 의 `node` 사용자가 이미 있다. root 로 돌리지 않는다.
#
# 레이어를 일부러 쪼갠다. node_modules 는 400MB 가 넘고 락파일이 바뀔 때만
# 내용이 달라지므로, 한 줄로 통째 복사하면 소스 한 줄만 고쳐도 매 배포에서
# 400MB 를 새로 전송하게 된다. 무거운 것부터 먼저 복사해 캐시를 살린다.
COPY --from=deployer --chown=node:node /prod/bot/node_modules ./node_modules
COPY --from=deployer --chown=node:node /prod/bot/assets ./assets
COPY --from=deployer --chown=node:node /prod/bot/package.json ./package.json
COPY --from=deployer --chown=node:node /prod/bot/build ./build

# StockChartRenderer 는 폰트를 process.cwd()/assets/fonts 에서 읽는다.
# WORKDIR 이 /app 이고 위 COPY 가 assets/ 를 함께 옮기므로 경로가 맞는다.
# 여기서 깨지면 주식 차트의 한글이 통째로 사라지므로 빌드 시점에 못 박는다.
RUN node -e "if(!require('fs').existsSync('assets/fonts/Pretendard-Regular.otf'))throw new Error('폰트 누락: assets/fonts 가 이미지에 없다')"

USER node

# 봇은 HTTP 서버를 열지 않아 HEALTHCHECK 를 걸 수 없다.
# compose 의 restart 정책과 배포 후 로그 스모크로 대체한다.
CMD ["node", "build/index.js"]
