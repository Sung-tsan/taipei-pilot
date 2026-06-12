// @ts-check
import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCert } from './server/cert.js';
import { lanIp } from './server/lan-ip.js';
import { PORT } from './shared/constants.js';

const root = dirname(fileURLToPath(import.meta.url));
const ip = lanIp();
const { key, cert } = ensureCert(resolve(root, '.cert'), ip);

/** dev 模式下補 /config.json（prod 由 node server 提供）；ws 仍連 node server 的 8443 */
const configJsonPlugin = {
  name: 'config-json',
  /** @param {import('vite').ViteDevServer} server */
  configureServer(server) {
    server.middlewares.use('/config.json', (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ lanIp: ip, port: PORT }));
    });
  },
};

export default defineConfig({
  server: {
    https: { key, cert },
    host: true,
  },
  plugins: [configJsonPlugin],
  build: {
    rollupOptions: {
      input: {
        display: resolve(root, 'index.html'),
        remote: resolve(root, 'remote.html'),
        viewer: resolve(root, 'dev-viewer.html'),
      },
    },
  },
});
