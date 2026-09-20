import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Dev: Vite on 4009 proxies API/uploads/events to the backend on 4008.
// Prod: `vite build` → dist/, served by the backend on the single port 4008.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 4009,
    proxy: {
      '/api': { target: 'http://localhost:4008', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'axios'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
