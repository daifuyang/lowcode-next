import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@lowcode-next/protocol': r('../../packages/protocol/src/index.ts'),
      '@lowcode-next/model': r('../../packages/model/src/index.ts'),
      '@lowcode-next/renderer': r('../../packages/renderer/src/index.ts'),
      '@lowcode-next/drag': r('../../packages/drag/src/index.ts'),
      '@lowcode-next/designer': r('../../packages/designer/src/index.ts'),
    },
    // ★ 防止同时存在两份 React（hooks 会直接失效）
    dedupe: ['react', 'react-dom'],
  },
  // 多页入口：index.html = 编辑器宿主，canvas.html = iframe 画布渲染入口
  build: {
    rollupOptions: {
      input: {
        main: r('./index.html'),
        canvas: r('./canvas.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
