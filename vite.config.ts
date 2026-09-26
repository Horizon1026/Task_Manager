import { resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildViewer } from './scripts-build-viewer';

const sourceDir = resolve(import.meta.dirname, 'src') + sep;
const generatedViewer = resolve(import.meta.dirname, 'src/interactiveViewer.generated.ts');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'offline-viewer-refresh',
      configureServer(server) {
        server.watcher.add(sourceDir);
        let pending = Promise.resolve();
        server.watcher.on('change', file => {
          if (!file.startsWith(sourceDir) || file === generatedViewer || !/\.(ts|css)$/.test(file)) return;
          pending = pending.then(buildViewer).catch(error => server.config.logger.error(String(error)));
        });
      },
    },
  ],
});
