import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bot.ts'],
  format: ['esm'],
  outDir: 'build',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  paths: {
    '@types': ['./src/types/index'],
    '@structures/*': ['./src/structures/*'],
    '@managers/*': ['./src/managers/*'],
    '@utils/*': ['./src/utils/*'],
    '@locales': ['./src/locales/index']
  }
})
