// Runs each entry's Vite build sequentially. dist/ is cleaned once up front
// since none of the individual entries use emptyOutDir (that would wipe out
// bundles already produced by earlier entries).
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

const entries = ['background', 'content', 'popup', 'sidepanel'];

for (const entry of entries) {
  console.log(`\n[build] ${entry}`);
  const result = spawnSync('npx', ['vite', 'build', '--config', `vite.${entry}.config.ts`], {
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) {
    console.error(`[build] ${entry} failed`);
    process.exit(result.status ?? 1);
  }
}
console.log('\n[build] all entries built successfully');
