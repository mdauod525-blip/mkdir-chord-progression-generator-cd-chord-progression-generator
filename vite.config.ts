import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any sub-path
  // (e.g. https://<user>.github.io/<repo>/) without extra configuration.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      input: {
        // StrumFlow is the main app; ChordLab (the progression generator) lives at /chordlab/.
        main: resolve(import.meta.dirname, 'index.html'),
        chordlab: resolve(import.meta.dirname, 'chordlab/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'chordlab/tests/**/*.test.js'],
  },
});
