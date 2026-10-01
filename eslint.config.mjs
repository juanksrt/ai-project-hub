import { defineConfig, globalIgnores } from 'eslint/config';
import nextPlugin from '@next/eslint-plugin-next';

/**
 * ESLint 9 usa "flat config" (eslint.config.mjs) en lugar del antiguo
 * .eslintrc.json. Next.js 16 elimino el comando `next lint`, por lo que el
 * linter se invoca directamente con el binario de ESLint.
 */
export default defineConfig([
  nextPlugin.configs['core-web-vitals'],
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);
