import { FlatCompat } from '@eslint/eslintrc'
import idleConfig from 'eslint-config-idle'

const compat = new FlatCompat()

export default [
  ...compat.extends('next/core-web-vitals'),
  ...idleConfig,
  {
    ignores: ['node_modules/**', '.next/**'],
  },
]
