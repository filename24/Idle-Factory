const { createMDX } = require('fumadocs-mdx/next')
const path = require('path')

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 프로덕션 Docker 이미지용 최소 서버 번들.
  // `.next/standalone` 이 필요한 node_modules 까지 추려 담으므로
  // 런타임 이미지에서 pnpm install 을 다시 하지 않아도 된다.
  //
  // Vercel 에 배포할 때는 끈다. standalone 은 Docker 자가호스팅 전용이고
  // Vercel 은 기본 `.next` 출력을 쓴다. VERCEL 은 Vercel 빌드 환경이 자동으로
  // 주입하므로 별도 설정이 필요 없다 — 같은 커밋이 양쪽 모두에서 빌드된다.
  output: process.env.VERCEL ? undefined : 'standalone',
  // pnpm 워크스페이스 루트를 파일 트레이싱 기준으로 잡는다. 이 값이 없으면
  // apps/web 밖의 @idle/database·@idle/game-core 와 pnpm 의 .pnpm 심볼릭 링크
  // 실체가 추적되지 않아 런타임에 모듈을 찾지 못한다.
  // 산출물 구조도 이 값을 기준으로 정해진다 → .next/standalone/apps/web/server.js
  outputFileTracingRoot: path.join(__dirname, '../../'),
  webpack(config) {
    config.resolve.alias['@/.source'] = path.resolve(__dirname, '.source/server.ts')
    return config
  },
}

module.exports = withMDX(nextConfig)
