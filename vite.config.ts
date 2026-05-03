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
        '/dashscope-image': {
          target: 'https://dashscope-us.aliyuncs.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/dashscope-image/, '/api/v1'),
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
      'process.env.AI_PROVIDER': JSON.stringify(env.AI_PROVIDER || process.env.AI_PROVIDER),
      'process.env.AI_BASE_URL': JSON.stringify(env.AI_BASE_URL || process.env.AI_BASE_URL),
      'process.env.AI_DISPLAY_NAME': JSON.stringify(env.AI_DISPLAY_NAME || process.env.AI_DISPLAY_NAME),
      'process.env.AI_MODEL_FAST': JSON.stringify(env.AI_MODEL_FAST || process.env.AI_MODEL_FAST),
      'process.env.AI_MODEL_SMART': JSON.stringify(env.AI_MODEL_SMART || process.env.AI_MODEL_SMART),
      'process.env.AI_MODEL_STRUCTURED': JSON.stringify(env.AI_MODEL_STRUCTURED || process.env.AI_MODEL_STRUCTURED),
      'process.env.AI_MODEL_IMAGE': JSON.stringify(env.AI_MODEL_IMAGE || process.env.AI_MODEL_IMAGE),
      'process.env.AI_MODEL_AUDIO': JSON.stringify(env.AI_MODEL_AUDIO || process.env.AI_MODEL_AUDIO),
      'process.env.AI_IMAGE_BASE_URL': JSON.stringify(env.AI_IMAGE_BASE_URL || process.env.AI_IMAGE_BASE_URL),
      'process.env.AI_KEY': JSON.stringify(env.AI_KEY || process.env.AI_KEY),
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});