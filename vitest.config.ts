import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
