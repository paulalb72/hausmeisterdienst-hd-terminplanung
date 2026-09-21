import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Im Entwicklungsmodus laeuft das Backend getrennt auf 4000. Der Proxy
    // sorgt dafuer, dass die Session-Cookies trotzdem same-origin sind.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
