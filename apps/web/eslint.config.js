import nextTypescript from 'eslint-config-next/typescript'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import idleConfig from 'eslint-config-idle'

const config = [
  ...nextTypescript,
  ...nextCoreWebVitals,
  ...idleConfig,
  {
    ignores: ['node_modules/**', '.next/**', '**/*.cjs', '.source/**', 'next.config.js'],
  },
]

export default config
