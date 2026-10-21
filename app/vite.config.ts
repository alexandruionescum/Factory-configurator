import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: opens from any static host (or as a preview page) without a server.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  // ASCII-only output: libraries contain literal U+FFFD characters that some hosts reject
  esbuild: { charset: 'ascii' },
  build: { chunkSizeWarningLimit: 4000 },
});
