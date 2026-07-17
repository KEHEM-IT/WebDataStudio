import { entryConfig, copyExtensionPages } from './vite.shared';

export default entryConfig('sidepanel', 'src/sidepanel/sidepanel.ts', {
  emptyOutDir: false,
  plugins: [copyExtensionPages()]
});
