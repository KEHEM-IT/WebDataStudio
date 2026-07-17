import { entryConfig } from './vite.shared';

// dist/ is cleaned once up front by scripts/build.mjs and scripts/dev.mjs,
// so no entry here uses Vite's own emptyOutDir (that would wipe out the
// other bundles on every watch-mode rebuild).
export default entryConfig('background', 'src/background/service-worker.ts', { emptyOutDir: false, copyPublic: true });
