import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * IMPORTANT ARCHITECTURE NOTE:
 * Chrome MV3 content scripts are loaded as CLASSIC (non-module) scripts, so
 * they cannot use `import`. The background service worker CAN be a module
 * (manifest "type": "module"), but to keep one consistent, simple mental
 * model and avoid cross-context import failures, every entry below is built
 * as a fully self-contained IIFE bundle (shared @core/* code gets inlined
 * into each bundle independently instead of split into a shared chunk,
 * which Rollup does not support for the iife format). This trades a little
 * duplicate bytes across background.js/content.js for total reliability.
 *
 * Because each entry needs its OWN Rollup build (iife format forbids
 * cross-entry shared chunks), this config exports an ARRAY of build
 * configs. `vite build` runs each sequentially in one invocation.
 */

function copyExtensionPages() {
  return {
    name: 'wds-copy-extension-pages',
    writeBundle() {
      copyFileSync(resolve(__dirname, 'src/popup/popup.html'), resolve(__dirname, 'dist/popup.html'));
      copyFileSync(resolve(__dirname, 'src/sidepanel/sidepanel.html'), resolve(__dirname, 'dist/sidepanel.html'));
    }
  };
}

const alias = {
  '@': resolve(__dirname, 'src'),
  '@core': resolve(__dirname, 'src/core'),
  '@types': resolve(__dirname, 'src/core/types')
};

function entryConfig(name: string, entryPath: string, opts: { emptyOutDir: boolean; plugins?: ReturnType<typeof copyExtensionPages>[] }) {
  return defineConfig({
    publicDir: opts.emptyOutDir ? 'public' : false,
    resolve: { alias },
    plugins: opts.plugins ?? [],
    build: {
      outDir: 'dist',
      emptyOutDir: opts.emptyOutDir,
      sourcemap: true,
      target: 'es2022',
      rollupOptions: {
        input: { [name]: resolve(__dirname, entryPath) },
        output: { format: 'iife', entryFileNames: '[name].js', assetFileNames: 'assets/[name][extname]' }
      }
    }
  });
}

export default [
  entryConfig('background', 'src/background/service-worker.ts', { emptyOutDir: true }),
  entryConfig('content', 'src/content/content-script.ts', { emptyOutDir: false }),
  entryConfig('popup', 'src/popup/popup.ts', { emptyOutDir: false }),
  entryConfig('sidepanel', 'src/sidepanel/sidepanel.ts', { emptyOutDir: false, plugins: [copyExtensionPages()] })
];
