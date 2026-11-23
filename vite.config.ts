import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'http://127.0.0.1:4777', ws: true, changeOrigin: true },
      '/hook': 'http://127.0.0.1:4777',
    },
  },
});
