import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: opens from any static host (or as a preview page) without a server.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 4000 },
});
