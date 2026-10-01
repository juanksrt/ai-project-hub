import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // El tsconfig del proyecto usa "jsx": "preserve" porque Next.js transpila
  // el JSX en su propio pipeline. Vitest no usa ese pipeline, asi que necesita
  // convertir el JSX a funciones de React en el tests.
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
