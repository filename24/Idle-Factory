import idleConfig, { discordV2Config } from 'eslint-config-idle'

export default [
  ...idleConfig,
  ...discordV2Config,
  {
    ignores: ['node_modules/**', 'build/**']
  }
]
