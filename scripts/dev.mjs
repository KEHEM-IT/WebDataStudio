// Runs each entry's Vite build in --watch mode concurrently for local dev.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

const entries = ['background', 'content', 'popup', 'sidepanel'];

for (const entry of entries) {
  const child = spawn('npx', ['vite', 'build', '--watch', '--mode', 'development', '--config', `vite.${entry}.config.ts`], {
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', (code) => {
    console.log(`[dev] ${entry} watcher exited with code ${code}`);
  });
}
console.log('[dev] watching background, content, popup, sidepanel — reload the extension after each rebuild');
