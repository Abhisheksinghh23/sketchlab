import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable: GitHub Pages project path, local preview, or any static host.
// manualChunks keeps each emitted asset small enough for constrained deploy channels.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          matter: ['matter-js'],
        },
      },
    },
  },
});
