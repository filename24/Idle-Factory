/* eslint-disable */

/**
 * @typedef {import('eslint').ESLint.ConfigData}
 */
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [
      './tsconfig.eslint.json',
      './apps/*/tsconfig.eslint.json',
      './packages/*/tsconfig.eslint.json',
    ],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'prettier/prettier': 'warn',
  },
  ignorePatterns: ['**/dist/*'],
}
