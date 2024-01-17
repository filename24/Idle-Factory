// @ts-check
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  cacheOnFrontEndNav: true,
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

// export default withSerwist(nextConfig)
export default nextConfig
