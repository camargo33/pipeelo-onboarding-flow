import { defineConfig } from 'vitest/config';

// Config isolada do root para evitar herdar setupFiles/aliases do SPA Vite.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
