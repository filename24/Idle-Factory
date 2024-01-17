module.exports = {
  plugins: ['unused-imports', 'require-extensions'],
  extends: ['plugin:require-extensions/recommended'],
  rules: {
    'no-unused-vars': 'off',
    'prettier/prettier': 'off',
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
  },
}
