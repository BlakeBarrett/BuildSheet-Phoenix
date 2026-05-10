import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/app/',
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:8081',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    build: {
      // Target es2020 so the bundler transpiles ES2022+ features
      // (e.g. Object.hasOwn in react-markdown's unified ecosystem)
      // that older browsers don't support.
      target: 'es2020',
    },
    define: {
      // AI keys and model config are now server-side only.
      // Only Firebase config (needed for client-side auth) is passed to the browser.
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});