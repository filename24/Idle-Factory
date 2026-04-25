# Plan: idle-factory-web — Onboarding + Fumadocs

**Objective:** `apps/web`에 게임 플레이어용 웹사이트 구축

1. 기본 온보딩: Discord OAuth 로그인 → 프로필 연동 → 튜토리얼 가이드 페이지
2. Fumadocs 기반 플레이어 문서: `/docs` 경로에 통합, `docs/design/` 11개를 플레이어 친화 MDX로 변환

**Target branch:** `feat/web-onboarding-docs` (base: `feat/phase-1-mvp-factory-loop`)
**Working directory:** `apps/web/`
**Created:** 2026-04-24
**Review:** Adversarial review 완료 (Opus) — CRITICAL 3건, HIGH 4건 반영됨

---

## Dependency Graph

```
Step 0 (pre-flight)
  └── Step 1 (deps + compat check)
        ├── Step 2 (design-system)   ── 병렬: Step 3
        ├── Step 3 (auth)            ── 병렬: Step 2
        │     └── Step 5 (dashboard) ── 병렬: Step 7
        ├── Step 2 완료 후 → Step 4 (landing)
        ├── Step 4 완료 후 → Step 6 (fumadocs)   ← 순서 변경 (layout 충돌 방지)
        └── Step 6 완료 후 → Step 7 (docs-content) ── 병렬: Step 5
```

**병렬 실행:** 0 → 1 → (2 ‖ 3) → 4 → 6 → (5 ‖ 7)

> ⚠️ Step 4와 Step 6은 둘 다 `layout.tsx`/`globals.css`에 닿음 → **직렬** 처리

---

## Step 0 — Pre-flight & Workspace Wiring

**Branch:** `feat/web-onboarding-docs` (여기서부터 모든 작업)
**Estimated effort:** XS (15분)

### Context Brief

새 브랜치를 만들고, `apps/web/package.json`에 내부 패키지 의존성을 추가한다.
현재 `apps/web`은 `@idle/database`, `@idle/game-core`를 아직 의존하지 않는다.
또한 Auth.js 환경변수를 Turbo의 `globalEnv`에 등록해야 빌드 캐시가 올바르게 무효화된다.

### Task List

- [ ] `feat/phase-1-mvp-factory-loop`에서 브랜치 생성:
  ```bash
  git checkout -b feat/web-onboarding-docs feat/phase-1-mvp-factory-loop
  ```
- [ ] `apps/web/package.json` dependencies에 추가:
  ```json
  "@idle/database": "workspace:^",
  "@idle/game-core": "workspace:^"
  ```
- [ ] `turbo.json` `globalEnv` 배열에 추가:
  ```json
  "BETTER_AUTH_SECRET", "BETTER_AUTH_URL",
  "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL"
  ```
- [ ] `pnpm install` (루트)
- [ ] `apps/web/src/globals.d.ts`에 BigInt 직렬화 타입 노트 추가 (Step 5 준비)

### Verification

```bash
pnpm build:packages   # database, game-core 빌드 확인
cd apps/web && pnpm typecheck
```

---

## Step 1 — Dependencies & Fumadocs Compatibility Check

**Depends on:** Step 0
**Estimated effort:** S (45분)

### Context Brief

신규 패키지를 설치하기 전에 **fumadocs-ui + Tailwind v4 + Next.js 16 호환성을 먼저 확인**한다.
fumadocs-ui는 과거 Tailwind v3 전제로 자체 CSS를 ship했으므로, v4와 충돌 가능성이 있다.
호환되면 정상 설치, 호환 안 되면 `fumadocs-core` headless + 커스텀 스타일링으로 폴백.

인증은 **better-auth**를 사용한다. next-auth 대신 선택한 이유: 프레임워크 독립적, Prisma 어댑터 내장,
Discord social provider 공식 지원, 세션 타입이 TypeScript-first.

**⚠️ Prisma 스키마 충돌 주의:**
better-auth는 자체 `user`, `session`, `account`, `verification` 테이블이 필요하다.
게임 DB에 이미 `User` 모델이 있으므로 **better-auth 테이블을 별도 prefix로 명명**해야 한다.
→ `AuthUser`, `AuthSession`, `AuthAccount`, `AuthVerification` 모델로 추가 + `@@map("auth_*")`.
→ `packages/database/prisma/schema.prisma`에 new 모델 추가 후 migration 필요 (기존 모델 변경 없음).

### Task List

- [ ] **호환성 확인 (설치 전):**
  ```bash
  npm view fumadocs-ui peerDependencies
  npm view fumadocs-ui versions --json | tail -5
  npm view better-auth version
  ```
- [ ] `apps/web/package.json` dependencies에 추가:
  - `better-auth` — 인증 (Discord OAuth + Prisma 어댑터 내장)
  - `@better-fetch/fetch` — better-auth 미들웨어용 Edge-compatible fetch
  - `fumadocs-core` — Fumadocs 코어
  - `fumadocs-ui` — Fumadocs UI (Tailwind v4 호환 버전)
  - `fumadocs-mdx` — MDX 소스 플러그인
  - `lucide-react` — 아이콘 (fumadocs-ui 의존)
  - `tailwind-merge` — Tailwind 클래스 병합
  - `clsx` — 조건부 클래스명
- [ ] **Tailwind v4 충돌 시 폴백:** `fumadocs-ui` 제거, `fumadocs-core`만 사용 + Step 6에서 커스텀 UI
- [ ] `pnpm install` (루트)
- [ ] `packages/database/prisma/schema.prisma`에 better-auth 전용 모델 추가:
  ```prisma
  model AuthUser {
    id            String        @id
    name          String
    email         String        @unique
    emailVerified Boolean
    image         String?
    createdAt     DateTime
    updatedAt     DateTime
    sessions      AuthSession[]
    accounts      AuthAccount[]
    @@map("auth_user")
  }
  model AuthSession {
    id        String   @id
    expiresAt DateTime
    token     String   @unique
    createdAt DateTime
    updatedAt DateTime
    ipAddress String?
    userAgent String?
    userId    String
    user      AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@map("auth_session")
  }
  model AuthAccount {
    id                    String    @id
    accountId             String    // Discord snowflake
    providerId            String
    userId                String
    user                  AuthUser  @relation(fields: [userId], references: [id], onDelete: Cascade)
    accessToken           String?
    refreshToken          String?
    idToken               String?
    accessTokenExpiresAt  DateTime?
    refreshTokenExpiresAt DateTime?
    scope                 String?
    password              String?
    createdAt             DateTime
    updatedAt             DateTime
    @@map("auth_account")
  }
  model AuthVerification {
    id         String    @id
    identifier String
    value      String
    expiresAt  DateTime
    createdAt  DateTime?
    updatedAt  DateTime?
    @@map("auth_verification")
  }
  ```
- [ ] `pnpm db:migrate:dev --name add-better-auth-tables` (루트에서)
- [ ] `apps/web/.env.local.example` 생성:

  ```
  # better-auth (generate: openssl rand -base64 32)
  BETTER_AUTH_SECRET=
  BETTER_AUTH_URL=http://localhost:3000

  # Discord Dev Portal → OAuth2 → Redirect URI:
  # http://localhost:3000/api/auth/callback/discord
  DISCORD_CLIENT_ID=
  DISCORD_CLIENT_SECRET=

  # Database
  DATABASE_URL=postgresql://idle:idle@localhost:5433/idle-factory-dev?schema=public
  ```

- [ ] `turbo.json` `globalEnv` 수정 (Step 0에서 추가한 AUTH*\* 키 → BETTER_AUTH*\* 키로 교체):
  - 추가: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
  - 제거: `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_TRUST_HOST`, `NEXTAUTH_URL`
- [ ] `.gitignore`에 `.source/` 추가 (fumadocs-mdx 생성 디렉터리)

### Verification

```bash
pnpm db:generate          # Prisma 클라이언트 재생성
cd apps/web && pnpm typecheck
pnpm build
```

### Exit Criteria

- better-auth + fumadocs 설치됨 (or 폴백 결정됨)
- better-auth 전용 테이블 4개 migration 완료
- `.env.local.example` 존재
- `pnpm typecheck` 통과

---

## Step 2 — Design System & Shell Layout

**Skill to invoke:** `frontend-design`
**Depends on:** Step 1
**Can run parallel with:** Step 3
**Estimated effort:** M (1.5시간)

### Context Brief

`apps/web/src/app/layout.tsx`는 create-next-app 기본 템플릿. 게임 테마 디자인 시스템을 구축한다.

**비주얼 방향: Industrial / Dark Luxury**

- 공장 게임 특성에 맞는 어두운 금속 질감
- 황금/주황 포인트 컬러 (용광로, 골드)
- Pretendard Variable (한국어 최적화 고딕)
- 마이크로 애니메이션: 부드럽고 무게감 있는 fade/slide

**레퍼런스 방향:** 다크 인더스트리얼 대시보드 — 과하지 않은 골드 포인트, 미세 그레인 텍스처, 실용적 레이아웃

### Task List

- [ ] `apps/web/src/app/globals.css` 게임 테마 토큰으로 교체:

  ```css
  @theme {
    --color-bg: oklch(9% 0.01 260);
    --color-surface: oklch(14% 0.01 260);
    --color-surface-2: oklch(18% 0.015 260);
    --color-border: oklch(24% 0.02 260);
    --color-accent: oklch(72% 0.18 55);
    --color-accent-dim: oklch(55% 0.13 55);
    --color-text: oklch(93% 0 0);
    --color-muted: oklch(52% 0.01 260);
    --color-success: oklch(65% 0.18 145);
    --color-warning: oklch(75% 0.18 80);

    --font-sans: 'Pretendard Variable', ui-sans-serif, system-ui;
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }
  body {
    background: var(--color-bg);
    color: var(--color-text);
  }
  ```

- [ ] `apps/web/src/app/layout.tsx` 리빌드 (Pretendard CDN):
  ```tsx
  // Pretendard: cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css
  ```
- [ ] `apps/web/src/components/ui/` 기본 컴포넌트:
  - `Button.tsx` — variant: `primary` (solid 황금) / `secondary` / `ghost`
  - `Card.tsx` — `--color-surface` 배경 + subtle border
  - `Badge.tsx` — 티어(T1/T2/T3), 등급, 공장타입 표시용
  - `Avatar.tsx` — Discord CDN 아바타 (`next/image` 래핑)
- [ ] `apps/web/src/components/layout/Header.tsx`:
  - 로고 + "Idle Factory"
  - 링크: 홈(`/`), 문서(`/docs`)
  - 로그인/로그아웃 버튼 (`"use client"` leaf)
- [ ] `apps/web/src/components/layout/Footer.tsx`
- [ ] **Korean JSDoc 필수:** 모든 export에 `/** 한국어 설명 */` 추가

### Verification

```bash
cd apps/web && pnpm dev
# http://localhost:3000 — 헤더/푸터 렌더링 확인
pnpm typecheck
```

### Exit Criteria

- UI 컴포넌트 5종 + 레이아웃 컴포넌트 2종 존재
- 게임 테마 CSS 토큰 정의됨
- `pnpm typecheck` 통과

---

## Step 3 — Discord OAuth Authentication (better-auth)

**Depends on:** Step 1
**Can run parallel with:** Step 2
**Estimated effort:** M (1.5시간)

### Context Brief

**better-auth**로 Discord OAuth를 구현한다.

**핵심 구조:**

- `src/lib/auth.ts` — 서버 인스턴스 (`betterAuth()`)
- `src/lib/auth-client.ts` — 클라이언트 인스턴스 (`createAuthClient()`, React hooks)
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler` (Node.js runtime)
- `middleware.ts` — `betterFetch`로 세션 체크 (Edge runtime 호환)

**Discord snowflake → 게임 User 연결 방법:**
better-auth의 `AuthAccount.accountId` = Discord snowflake.
세션에서 게임 데이터가 필요할 때: `session.user.id` (better-auth UUID) →
`AuthAccount.userId = session.user.id AND providerId = 'discord'` → `accountId` (snowflake) →
게임 `User.id`로 조회.

이 조회는 RSC/라우트 핸들러에서 `src/lib/game.ts` 헬퍼가 담당 (Step 5에서 구현).

**better-auth 필수 파일 목록:**

```
apps/web/src/
├─ lib/auth.ts           ← betterAuth() 서버 인스턴스
├─ lib/auth-client.ts    ← createAuthClient() 클라이언트
├─ lib/db.ts             ← ★ DatabaseClient 싱글턴 (CRITICAL fix)
├─ lib/env.ts            ← 환경변수 early validation
└─ app/
   ├─ api/auth/[...all]/route.ts  ← toNextJsHandler
   └─ login/page.tsx
apps/web/middleware.ts   ← betterFetch 세션 체크 (Edge)
```

### Task List

- [ ] `apps/web/src/lib/env.ts` 생성:
  ```typescript
  function requireEnv(key: string): string {
    const v = process.env[key]
    if (!v) throw new Error(`Missing env: ${key}`)
    return v
  }
  export const env = {
    BETTER_AUTH_SECRET: requireEnv('BETTER_AUTH_SECRET'),
    DISCORD_CLIENT_ID: requireEnv('DISCORD_CLIENT_ID'),
    DISCORD_CLIENT_SECRET: requireEnv('DISCORD_CLIENT_SECRET'),
  }
  ```
- [ ] **★ CRITICAL: `apps/web/src/lib/db.ts` 싱글턴 패턴:**
  ```typescript
  import { DatabaseClient } from '@idle/database'

  declare global {
    var _db: DatabaseClient | undefined
  }
  /** Next.js HMR/서버리스에서 연결 누수 방지용 글로벌 싱글턴 */
  export const db = (globalThis._db ??= new DatabaseClient({ useRedis: false }))
  ```
- [ ] `apps/web/src/lib/auth.ts` — better-auth 서버 인스턴스:

  ```typescript
  import { db } from '@/lib/db'
  import { betterAuth } from 'better-auth'
  import { prismaAdapter } from 'better-auth/adapters/prisma'

  /** better-auth 서버 인스턴스 — Discord OAuth + Prisma 어댑터 */
  export const auth = betterAuth({
    database: prismaAdapter(db, { provider: 'postgresql' }),
    socialProviders: {
      discord: {
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      },
    },
    advanced: {
      // better-auth 기본 모델명이 게임 User와 충돌하므로 커스텀 모델 사용
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    // Prisma 모델명 매핑 (AuthUser, AuthSession, AuthAccount, AuthVerification)
    user: { modelName: 'AuthUser' },
    session: { modelName: 'AuthSession' },
    account: { modelName: 'AuthAccount' },
    verification: { modelName: 'AuthVerification' },
  })
  ```

- [ ] `apps/web/src/lib/auth-client.ts` — 클라이언트 인스턴스:

  ```typescript
  import { createAuthClient } from 'better-auth/react'

  /** 클라이언트 사이드 better-auth 인스턴스 — useSession 등 React hooks 제공 */
  export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  })
  export const { useSession, signIn, signOut } = authClient
  ```

- [ ] `apps/web/src/app/api/auth/[...all]/route.ts`:
  ```typescript
  import { auth } from '@/lib/auth'
  import { toNextJsHandler } from 'better-auth/next-js'

  export const { GET, POST } = toNextJsHandler(auth)
  export const runtime = 'nodejs' // Prisma는 Edge 불가
  ```
- [ ] `apps/web/middleware.ts` — Edge에서 세션 체크:

  ```typescript
  import type { auth } from '@/lib/auth'
  import { betterFetch } from '@better-fetch/fetch'
  import { NextRequest, NextResponse } from 'next/server'

  type Session = typeof auth.$Infer.Session

  /** 보호된 라우트 세션 체크 — Edge 런타임에서 실행 */
  export async function middleware(request: NextRequest) {
    const { data: session } = await betterFetch<Session>('/api/auth/get-session', {
      baseURL: request.nextUrl.origin,
      headers: { cookie: request.headers.get('cookie') ?? '' },
    })
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  export const config = {
    matcher: ['/dashboard/:path*', '/profile/:path*', '/onboarding/:path*'],
  }
  ```

- [ ] `apps/web/src/app/login/page.tsx` — 로그인 페이지:

  ```tsx
  'use client'

  import { signIn } from '@/lib/auth-client'

  /** Discord OAuth 로그인 페이지 */
  export default function LoginPage() {
    return (
      <button onClick={() => signIn.social({ provider: 'discord', callbackURL: '/dashboard' })}>
        Discord로 로그인
      </button>
    )
  }
  ```

- [ ] `.env.local.example`에 `NEXT_PUBLIC_APP_URL=http://localhost:3000` 추가

### Verification

```bash
pnpm typecheck
# Discord Dev Portal 확인:
# OAuth2 → Redirects → http://localhost:3000/api/auth/callback/discord
```

### Exit Criteria

- `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/db.ts`, `src/lib/env.ts` 존재
- `src/app/api/auth/[...all]/route.ts` 존재, `runtime = 'nodejs'` 선언
- `middleware.ts` 존재
- `/login` 페이지 존재
- `pnpm typecheck` 통과

---

## Step 4 — Landing Page

**Skill to invoke:** `frontend-design`
**Depends on:** Step 2 (디자인 시스템 완료 후)
**Estimated effort:** M (1.5시간)

### Context Brief

`apps/web/src/app/page.tsx`를 게임 소개 랜딩 페이지로 교체한다.
Step 2의 디자인 시스템(색상 토큰, 컴포넌트)을 활용한다.
**Step 6(Fumadocs)과 직렬** — 둘 다 `layout.tsx`/`globals.css`에 닿기 때문.

### Task List

- [ ] `apps/web/src/app/page.tsx` 완전 교체 (Server Component):
  - Hero: 게임 타이틀, 한줄 설명, "Discord에서 시작하기" + "게임 가이드" CTA
  - 핵심 루프: 3단계 카드 (공장 건설 → 자재 생산 → 마켓 거래)
  - 공장 종류 쇼케이스: T1~T3 타입 그리드
  - 경제 시스템 소개: 글로벌 마켓, 주식, 서버 신뢰도
  - CTA: Discord 봇 초대 링크 + 문서 링크
- [ ] `apps/web/src/components/home/` 섹션 컴포넌트:
  - `HeroSection.tsx`
  - `CoreLoopSection.tsx`
  - `FactoryShowcase.tsx`
  - `EconomySection.tsx`
  - `CtaSection.tsx`
- [ ] Hero 배경: CSS `repeating-linear-gradient`로 미세 grid 패턴
- [ ] `prefers-reduced-motion` 미디어쿼리로 애니메이션 비활성화 지원
- [ ] **Korean JSDoc 필수**

### Verification

```bash
cd apps/web && pnpm dev
# http://localhost:3000 — 모바일(375px) + 데스크탑(1440px) 확인
pnpm build && pnpm typecheck
```

### Exit Criteria

- 기본 템플릿 완전 제거
- 5개 섹션 컴포넌트 존재
- `pnpm typecheck` + `pnpm build` 통과

---

## Step 5 — Player Dashboard & Onboarding Flow

**Skill to invoke:** `frontend-patterns`
**Depends on:** Steps 2 + 3
**Can run parallel with:** Step 7
**Estimated effort:** L (2시간)

### Context Brief

로그인 후 플레이어 대시보드와 온보딩 튜토리얼 가이드를 구현한다.

**BigInt 직렬화 주의 (CRITICAL fix):**
Prisma의 `User.money`, `Factory.flag` 등은 `BigInt`. RSC → Client Component 경계에서
`JSON.stringify`가 실패한다. 해결책: `Number(bigint)` 또는 `String(bigint)`로
직렬화 후 Client로 내려보낸다.

**온보딩 퀘스트 체인 (docs/design/00-onboarding.md):**

1. 첫 T1 공장 건설 (`/land build`)
2. 첫 수확 (`/harvest`)
3. 자재 마켓 판매
4. 공장 1등급→2등급 업그레이드 (`/factory upgrade`)
5. 두 번째 T1 공장 건설

### Task List

- [ ] `apps/web/src/lib/game.ts` — 서버사이드 게임 데이터 fetch:

  ```typescript
  import { auth } from '@/lib/auth'
  import { db } from '@/lib/db'
  import { headers } from 'next/headers'

  /** better-auth 세션 → Discord snowflake 조회 */
  export async function getDiscordId(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return null
    const account = await db.authAccount.findFirst({
      where: { userId: session.user.id, providerId: 'discord' },
      select: { accountId: true },
    })
    return account?.accountId ?? null
  }

  /** 플레이어 게임 통계 조회 (RSC 전용) */
  export async function getPlayerStats(discordId: string) {
    return db.user.findUnique({
      where: { id: discordId },
      include: { factories: { include: { slot: true } }, warehouse: true },
    })
  }
  ```

- [ ] BigInt 직렬화 헬퍼 `apps/web/src/lib/serialize.ts`:
  ```typescript
  /** Prisma BigInt → number 변환 (RSC→Client 경계용) */
  export function serializeBigInt<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
  }
  ```
- [ ] `apps/web/src/app/dashboard/layout.tsx` — 사이드바 레이아웃
- [ ] `apps/web/src/app/dashboard/page.tsx` — 대시보드 (Server Component):
  - `auth()` → userId → `getPlayerStats()` → `serializeBigInt()` → Client 전달
  - 공장 목록, 창고 요약, 레벨/XP 바
- [ ] `apps/web/src/app/onboarding/page.tsx` — 튜토리얼 가이드:
  - 5단계 퀘스트 체인 비주얼
  - 각 단계별 Discord 명령어 코드 블록
- [ ] `apps/web/src/app/profile/page.tsx` — 프로필 페이지
- [ ] `apps/web/src/components/game/`:
  - `XpBar.tsx` — 레벨/XP 프로그레스
  - `FactoryCard.tsx` — 공장 카드
  - `QuestChain.tsx` — 퀘스트 체인 UI
  - `StatCard.tsx` — 통계 수치 카드
- [ ] **Korean JSDoc 필수**

### Verification

```bash
pnpm typecheck
# 로그인 후 /dashboard, /onboarding, /profile 접근 테스트
```

### Exit Criteria

- `/dashboard`, `/onboarding`, `/profile` 라우트 존재
- `serializeBigInt` 헬퍼 사용됨
- 미인증 시 `/login` 리다이렉트 동작
- `pnpm typecheck` 통과

---

## Step 6 — Fumadocs Core Integration

**Depends on:** Step 4 (layout 충돌 방지를 위해 Step 4 완료 후)
**Can run parallel with:** Step 5
**Estimated effort:** M (1시간)

### Context Brief

`fumadocs-mdx` + (`fumadocs-ui` or `fumadocs-core` headless)로 `/docs` 라우트를 구성한다.

**Step 1에서 Tailwind v4 충돌 여부 결정됨:**

- 호환 시: `fumadocs-ui` DocsLayout 사용
- 불호환 시: `fumadocs-core` headless + Step 2 디자인 시스템으로 커스텀 레이아웃

**Auth.js v5 경고:** Prisma는 Edge 런타임 불가 → `/docs` 라우트는 정적 또는 `nodejs` 런타임.

### Task List

- [ ] `apps/web/source.config.ts` 생성:
  ```typescript
  import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

  export const docs = defineDocs({ dir: 'content/docs' })
  export default defineConfig({ mdxOptions: {} })
  ```
- [ ] `apps/web/src/lib/source.ts`:
  ```typescript
  import { docs } from '@/.source'
  import { loader } from 'fumadocs-core/source'

  export const source = loader({
    baseUrl: '/docs',
    source: docs.toFumadocsSource(),
  })
  ```
- [ ] **`apps/web/next.config.js` — `createMDX()` 래핑 (CRITICAL fix):**
  ```javascript
  const { createMDX } = require('fumadocs-mdx/next')
  const withMDX = createMDX()
  /** @type {import('next').NextConfig} */
  const nextConfig = {}
  module.exports = withMDX(nextConfig)
  ```
- [ ] `.gitignore`에 `.source/` 추가 (이미 Step 1에서 추가됨 — 확인)
- [ ] `apps/web/src/app/docs/layout.tsx` — 문서 레이아웃:
  ```
  사이드바 네비게이션 구조:
  시작하기
    ├─ 게임 소개
    ├─ 시작하는 방법
    └─ 튜토리얼 퀘스트
  시설 관리
    ├─ 공장 건설
    ├─ 토지 & 슬롯
    └─ 창고
  경제 시스템
    ├─ 자재와 거래
    ├─ 플레이어 마켓
    └─ 주식 시장
  심화
    ├─ 서버 & 길드
    └─ 레벨 & 성장
  ```
- [ ] `apps/web/src/app/docs/[[...slug]]/page.tsx` — 동적 라우트
- [ ] fumadocs 테마를 게임 색상 시스템에 맞게 CSS 변수 오버라이드
- [ ] `apps/web/content/docs/` 디렉터리 + `index.mdx` placeholder
- [ ] **Korean JSDoc 필수**

### Verification

```bash
cd apps/web && pnpm dev
# http://localhost:3000/docs → 빈 문서 페이지 렌더링 확인
pnpm build && pnpm typecheck
```

### Exit Criteria

- `/docs` 라우트 존재 + 렌더링됨
- `next.config.js`에 `createMDX()` 래핑됨
- 사이드바 구조 정의됨
- `pnpm typecheck` + `pnpm build` 통과

---

## Step 7 — Player Docs Content (MDX)

**Depends on:** Step 6
**Can run parallel with:** Step 5
**Estimated effort:** L (2시간)

### Context Brief

`docs/design/` 11개 파일을 게임 플레이어 친화적 MDX로 변환한다.
원본은 개발자/설계자용 내부 문서 → 플레이어 관점으로 완전히 재작성.

**변환 원칙:**

- 개발자 용어 제거 (Prisma, tick 대신 "생산 주기(10분)", 내부 수식 단순화)
- Mermaid 다이어그램: 플레이어가 이해하는 흐름으로 단순화
- 미확정 사항(`10-open-questions.md`) → **제외** (미완성 정보를 플레이어에게 노출 금지)

### Content Map

| 원본                  | 플레이어 문서 경로                | 섹션        |
| --------------------- | --------------------------------- | ----------- |
| `01-overview.md`      | `/docs/getting-started/intro`     | 시작하기    |
| `00-onboarding.md`    | `/docs/getting-started/tutorial`  | 시작하기    |
| `02-core-loop.md`     | `/docs/getting-started/core-loop` | 시작하기    |
| `03-factories.md`     | `/docs/facilities/factories`      | 시설 관리   |
| `11-land.md`          | `/docs/facilities/land`           | 시설 관리   |
| `05-warehouse.md`     | `/docs/facilities/warehouse`      | 시설 관리   |
| `04-economy.md`       | `/docs/economy/basics`            | 경제 시스템 |
| `06-market.md`        | `/docs/economy/market`            | 경제 시스템 |
| `08-stock.md`         | `/docs/economy/stock`             | 경제 시스템 |
| `07-global-system.md` | `/docs/advanced/guild`            | 심화        |
| `09-level-xp.md`      | `/docs/advanced/level`            | 심화        |

### Task List

- [ ] `apps/web/content/docs/` 디렉터리 구조 생성
- [ ] 각 섹션 디렉터리에 `meta.json` (순서 정의)
- [ ] 11개 MDX 파일 작성 (frontmatter 포함):
  ```mdx
  ---
  title: 게임 소개
  description: Idle Factory는 Discord에서 즐기는 공장 건설 경제 시뮬레이션입니다.
  ---
  ```
- [ ] 튜토리얼 페이지에 Discord 명령어 코드 블록 포함:
  ````mdx
  ```
  /land build farm 1 1
  ```
  ````
- [ ] `content/docs/index.mdx` — 문서 홈 (게임 소개 + 빠른 시작 링크)
- [ ] Mermaid 다이어그램 검토 — fumadocs remark-mermaid 지원 시 유지, 아니면 텍스트 흐름으로 대체

### Verification

```bash
cd apps/web && pnpm dev
# /docs/getting-started/intro, /docs/facilities/factories 등 각 페이지 확인
pnpm build   # 모든 MDX 빌드 통과
```

### Exit Criteria

- 11개 MDX 파일 (index.mdx 포함) 존재
- 10-open-questions 미포함
- 모든 페이지 사이드바에 표시됨
- `pnpm build` 통과

---

## Summary

| Step | 내용                         | 병렬               | 스킬                | 규모 |
| ---- | ---------------------------- | ------------------ | ------------------- | ---- |
| 0    | 브랜치 + 워크스페이스 의존성 | —                  | —                   | XS   |
| 1    | 패키지 설치 + 호환성 확인    | —                  | —                   | S    |
| 2    | 디자인 시스템 + 레이아웃     | Step 3             | `frontend-design`   | M    |
| 3    | Discord OAuth (better-auth)  | Step 2             | —                   | M    |
| 4    | 랜딩 페이지                  | — (Step 2 후 직렬) | `frontend-design`   | M    |
| 5    | 대시보드 + 온보딩 플로우     | Step 7             | `frontend-patterns` | L    |
| 6    | Fumadocs 통합                | — (Step 4 후 직렬) | —                   | M    |
| 7    | 플레이어 문서 MDX            | Step 5             | —                   | L    |

**실행 순서:** 0 → 1 → (2 ‖ 3) → 4 → 6 → (5 ‖ 7)
**총 예상 시간:** 10~12시간

---

## Invariants (매 스텝 후 검증)

1. `pnpm typecheck` 0 errors
2. `pnpm build` 통과
3. `apps/bot` 코드 무변경
4. `packages/` API 변경 없음 (database, game-core)
5. 시크릿 하드코딩 없음 (`.env.local`만)
6. 모든 export에 Korean JSDoc 있음
7. Prisma 접근 코드에 `export const runtime = 'nodejs'` 선언됨
8. BigInt를 Client Component에 raw로 전달하지 않음

---

## Review Findings Applied

| 심각도   | 항목                           | 반영 위치                                                |
| -------- | ------------------------------ | -------------------------------------------------------- |
| CRITICAL | DatabaseClient 싱글턴 누수     | Step 3 — `src/lib/db.ts` globalThis 패턴                 |
| CRITICAL | fumadocs + Tailwind v4 미검증  | Step 1 — 설치 전 호환성 체크 + 폴백 계획                 |
| CRITICAL | Auth.js v5 파일 구조 불완전    | Step 3 — better-auth로 교체, 전체 파일 목록 명시         |
| HIGH     | BigInt 직렬화 오류             | Step 5 — `serializeBigInt` 헬퍼                          |
| HIGH     | 워크스페이스 의존성 누락       | Step 0 — package.json + turbo.json                       |
| HIGH     | AUTH_TRUST_HOST 누락           | Step 1 — better-auth는 해당 없음, BETTER_AUTH_URL로 대체 |
| HIGH     | better-auth Prisma 스키마 충돌 | Step 1 — AuthUser/Session/Account/Verification 모델 추가 |
| MEDIUM   | next.config.js createMDX 누락  | Step 6                                                   |
| MEDIUM   | Step 4‖6 layout 충돌           | 직렬 순서로 변경                                         |
| MEDIUM   | Korean JSDoc 누락              | 각 Step 명시                                             |
