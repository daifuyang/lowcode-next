import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@lowcode-next/protocol': r('./packages/protocol/src/index.ts'),
      '@lowcode-next/model': r('./packages/model/src/index.ts'),
      '@lowcode-next/renderer': r('./packages/renderer/src/index.ts'),
      '@lowcode-next/drag': r('./packages/drag/src/index.ts'),
      '@lowcode-next/designer': r('./packages/designer/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
});
