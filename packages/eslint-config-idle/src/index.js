import prettier from 'eslint-plugin-prettier/recommended'
import tseslint from 'typescript-eslint'
import noDiscordLegacyMessage from './rules/no-discord-legacy-message.js'

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
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': 'warn',
    },
  },
  {
    ignores: ['**/dist/**'],
  },
)

/**
 * Discord bot 전용 Components v2 강제 설정.
 *
 * apps/bot/eslint.config.js 에서 다음과 같이 사용:
 *   import idle, { discordV2Config } from 'eslint-config-idle'
 *   export default [...idle, ...discordV2Config]
 *
 * @type {Array<import('eslint').Linter.Config>}
 */
export const discordV2Config = [
  {
    plugins: {
      'discord-v2': {
        rules: { 'no-discord-legacy-message': noDiscordLegacyMessage },
      },
    },
    rules: {
      'discord-v2/no-discord-legacy-message': 'error',
    },
  },
]
