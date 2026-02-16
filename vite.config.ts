import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.AI_PROVIDER': JSON.stringify(env.AI_PROVIDER),
        'process.env.LOCAL_AI_URL': JSON.stringify(env.LOCAL_AI_URL),
        'process.env.LOCAL_AI_MODEL': JSON.stringify(env.LOCAL_AI_MODEL),
        'process.env.LOCAL_AI_VISION_MODEL': JSON.stringify(env.LOCAL_AI_VISION_MODEL),
        'process.env.LOCAL_AI_KEY': JSON.stringify(env.LOCAL_AI_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});