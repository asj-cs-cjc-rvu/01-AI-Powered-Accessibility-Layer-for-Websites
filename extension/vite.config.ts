import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  define: { __STUDYLENS_BACKEND_URL__: JSON.stringify(backendUrl) },
  resolve: {
    alias: { '@studylens/shared': resolve(__dirname, '../shared/src/index.ts') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Extension pages cannot use modulepreload across worlds; disable the polyfill.
    modulePreload: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : '[name].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});