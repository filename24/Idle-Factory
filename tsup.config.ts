import { defineConfig, Options } from 'tsup';

export function createTsupConfig(
  config: Options = {
    entry: ['src/index.ts'],
    platform: 'node',
    format: ['esm', 'cjs'],
    target: 'es2022',
    skipNodeModulesBundle: true,
    clean: true,
    shims: true,
    minify: false,
    splitting: false,
    keepNames: true,
    dts: true,
    sourcemap: true,
  },
) {
  return defineConfig({
    ...config,
  });
}
