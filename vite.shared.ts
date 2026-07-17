import { defineConfig, type UserConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * IMPORTANT ARCHITECTURE NOTE:
 * Chrome MV3 content scripts are loaded as CLASSIC (non-module) scripts, so
 * they cannot use `import`. To keep one consistent, simple mental model and
 * avoid cross-context import failures, every entry is built as a fully
 * self-contained IIFE bundle (shared @core/* code gets inlined into each
 * bundle independently instead of split into a shared chunk, which Rollup
 * does not support for the iife format).
 *
 * Because iife format forbids cross-entry shared chunks, each entry needs
 * its OWN Vite config file (vite.<name>.config.ts) and its own `vite build`
 * invocation. This module holds the settings shared by all of them.
 */

export const rootDir = resolve(__dirname);

export const alias = {
  '@': resolve(rootDir, 'src'),
  '@core': resolve(rootDir, 'src/core'),
  '@dtypes': resolve(rootDir, 'src/core/types')
};

export function copyExtensionPages() {
  return {
    name: 'wds-copy-extension-pages',
    writeBundle() {
      copyFileSync(resolve(rootDir, 'src/popup/popup.html'), resolve(rootDir, 'dist/popup.html'));
      copyFileSync(resolve(rootDir, 'src/sidepanel/sidepanel.html'), resolve(rootDir, 'dist/sidepanel.html'));
      mkdirSync(resolve(rootDir, 'dist/assets'), { recursive: true });
      copyFileSync(resolve(rootDir, 'src/popup/popup.css'), resolve(rootDir, 'dist/assets/popup.css'));
      copyFileSync(resolve(rootDir, 'src/sidepanel/sidepanel.css'), resolve(rootDir, 'dist/assets/sidepanel.css'));
    }
  };
}
export function entryConfig(
  name: string,
  entryPath: string,
  opts: { emptyOutDir: boolean; copyPublic?: boolean; plugins?: ReturnType<typeof copyExtensionPages>[] }
): UserConfig {
  return defineConfig({
    root: rootDir,
    publicDir: opts.copyPublic ? 'public' : false,
    resolve: { alias },
    plugins: opts.plugins ?? [],
    build: {
      outDir: 'dist',
      emptyOutDir: opts.emptyOutDir,
      sourcemap: true,
      target: 'es2022',
      rollupOptions: {
        input: { [name]: resolve(rootDir, entryPath) },
        output: { format: 'iife', entryFileNames: '[name].js', assetFileNames: 'assets/[name][extname]' }
      }
    }
  });
}
