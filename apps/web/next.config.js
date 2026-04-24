const { createMDX } = require('fumadocs-mdx/next')

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withMDX(nextConfig)
