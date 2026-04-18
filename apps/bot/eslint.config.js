import idleConfig from 'eslint-config-idle'

export default [
  ...idleConfig,
  {
    ignores: ['node_modules/**', 'build/**', 'src/commands/**']
  }
]
