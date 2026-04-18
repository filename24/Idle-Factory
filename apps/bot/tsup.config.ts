import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/bot.ts',
    'src/commands/**/*.ts',
    'src/listeners/**/*.ts',
    'src/interaction-handlers/**/*.ts'
  ],
  format: ['esm'],
  outDir: 'build',
  bundle: true,
  splitting: true,
  clean: true,
  sourcemap: false,
  dts: false
})
