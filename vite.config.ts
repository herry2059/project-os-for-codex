import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The local Git-backed service is the default; override it with VITE_API_BASE in hosted environments.
export default defineConfig({
  // Set VITE_BASE when deploying under a sub-path.
  // The base also drives the frontend route basename and API prefix.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8790',
        changeOrigin: true,
      },
    },
  },
});
