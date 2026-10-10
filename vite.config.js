import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path
  // (e.g. https://<user>.github.io/<repo>/) without extra configuration.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
