const { createMDX } = require('fumadocs-mdx/next')
const path = require('path')

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    config.resolve.alias['@/.source'] = path.resolve(__dirname, '.source/server.ts')
    return config
  },
}

module.exports = withMDX(nextConfig)
