import prettier from 'eslint-plugin-prettier/recommended'
import tseslint from 'typescript-eslint'

/** @type {import('typescript-eslint').ConfigArray} */
export default tseslint.config(
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'prettier/prettier': 'warn',
    },
  },
  {
    ignores: ['**/dist/**'],
  },
)
