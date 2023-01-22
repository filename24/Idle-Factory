import { defineConfig, Options } from 'tsup'

export function createTsupConfig({
  entry = ['src/index.ts'],
  platform = 'node',
  format = ['esm', 'cjs'],
  target = 'es2022',
  skipNodeModulesBundle = true,
  clean = true,
  shims = true,
  minify = false,
  splitting = false,
  keepNames = true,
  dts = true,
  sourcemap = true,
}: Options = {}) {
  return defineConfig({
    entry,
    platform,
    format,
    target,
    skipNodeModulesBundle,
    clean,
    shims,
    minify,
    splitting,
    keepNames,
    dts,
    sourcemap,
  })
}
