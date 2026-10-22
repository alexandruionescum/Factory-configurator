import { defineConfig } from 'vitest/config';

// Unit tests run in jsdom: the Excel and Pack and Go readers use the browser DOMParser.
export default defineConfig({
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
