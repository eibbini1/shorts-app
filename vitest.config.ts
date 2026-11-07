import { defineConfig } from 'vitest/config';

// scripts/*.test.mjs use node:test; run them with `node --test scripts`.
export default defineConfig({ test: { exclude: ['scripts/**', 'node_modules/**', 'dist/**'] } });
