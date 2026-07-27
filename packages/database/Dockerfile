# syntax=docker/dockerfile:1
#
# packages/database — 마이그레이션 전용 일회성 이미지 (migrator)
#
# 빌드 컨텍스트는 반드시 **레포 루트**다:
#   docker build -f packages/database/Dockerfile -t idle-factory-migrator .
#
# 왜 앱 이미지에서 마이그레이션을 돌리지 않는가:
#  - compose 가 `depends_on: { migrator: { condition: service_completed_successfully } }`
#    로 마이그레이션 성공을 앱 시작의 게이트로 삼을 수 있다. 실패하면 봇·web 이
#    아예 뜨지 않으므로 스키마와 코드가 어긋난 상태로 서비스되지 않는다.
#  - bot 과 web 이 동시에 `migrate deploy` 를 시도하는 경쟁이 없다.
#
# Prisma 마이그레이션은 롤백할 수 없다. 컬럼 삭제 같은 파괴적 변경은
# expand/contract 로 배포를 2회로 쪼갤 것 — docs/ops/deployment.md 참고.

ARG NODE_VERSION=22
ARG TURBO_VERSION=2.9.6

# ── base ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global corepack@latest \
  && corepack enable
ENV HUSKY=0
WORKDIR /app

# ── pruner ─────────────────────────────────────────────────────────────
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install --global turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune @idle/database --docker

# ── installer ──────────────────────────────────────────────────────────
FROM base AS installer
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
COPY tsup.config.ts ./

# ── deployer: 마이그레이션 실행에 필요한 것만 평탄화 ───────────────────
FROM installer AS deployer
# --prod 를 주지 않는다(의도적). `prisma` CLI 와 `dotenv` 는 @idle/database 의
# devDependencies 이고, 마이그레이션 실행에는 둘 다 필요하다.
# (--prod 로 만든 트리에는 prisma 바이너리가 node_modules/.bin 에 없다 — 실측.)
RUN pnpm deploy --filter=@idle/database --legacy /prod/migrator
# package.json 의 `files: ["dist"]` 때문에 deploy 는 dist 만 옮긴다. 스키마와
# 마이그레이션 히스토리가 빠지므로 명시적으로 복사한다(실측으로 확인한 함정).
COPY --from=pruner /app/out/full/packages/database/prisma /prod/migrator/prisma
# datasource 블록에 url 이 없다. prisma.config.ts 가 env('DATABASE_URL') 로
# 주입하므로 이 파일이 없으면 migrate deploy 가 접속 대상을 찾지 못한다.
COPY --from=pruner /app/out/full/packages/database/prisma.config.ts /prod/migrator/

# ── runner ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runner
# Prisma 의 schema engine 은 libssl 에 링크된다. slim 이미지에는 없다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# node_modules 를 먼저(무거움·잘 안 바뀜), 스키마를 나중에(가벼움·매번 바뀜)
# 복사해 재배포 시 전송량을 줄인다.
COPY --from=deployer --chown=node:node /prod/migrator/node_modules ./node_modules
COPY --from=deployer --chown=node:node /prod/migrator/package.json ./package.json
COPY --from=deployer --chown=node:node /prod/migrator/prisma.config.ts ./prisma.config.ts
COPY --from=deployer --chown=node:node /prod/migrator/prisma ./prisma
USER node

# 마이그레이션이 하나도 적용되지 않은 상태로 조용히 성공하는 사고를 막는다.
RUN node -e "const d=require('fs').readdirSync('prisma/migrations').filter(f=>f!=='migration_lock.toml');if(d.length===0)throw new Error('마이그레이션 디렉터리가 비었다');console.log('마이그레이션 '+d.length+'개 포함')"

# `migrate deploy` 는 멱등하다 — 이미 적용된 마이그레이션은 건너뛴다.
# 적용할 것이 없으면 즉시 0 으로 종료하므로 매 배포마다 무조건 실행해도 된다.
#
# `pnpm exec` 를 쓰면 안 된다. pnpm 은 실행 전 의존성 상태를 점검하며
# `pnpm install` 을 시도하고, 그 과정에서 corepack 이 최신 pnpm 을 새로
# 내려받아 비-root 로 /app 에 쓰려다 EACCES 로 죽는다(실측). 바이너리를
# 직접 호출하면 그 경로를 아예 타지 않는다.
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
