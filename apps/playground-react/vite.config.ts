import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 必须带 `.ts` 扩展名：Vite 8 的 `configLoader: 'native'` 不接受无扩展名的相对
// import（现在只是警告，未来会成为默认）。两个 app 的 tsconfig 里开了
// `allowImportingTsExtensions` 以配合。
import { defineApp } from '../shared/vite.base.ts';

/**
 * React 版 playground（DESIGN-v1 §12.13.6）。
 *
 * 与 `playground-vue` 是**两个 app**，不是一个 app 的两种构建模式：编辑器用哪个
 * 框架，等同于「这个 app 依赖哪一个 designer 包」（Ark UI 的形态）。所以这里没有
 * `__DESIGNER_KIND__`、没有 `.env.vue`、没有 `--mode`，`main.tsx` 里也没有分支。
 */
export default defineApp({
  appDir: import.meta.dirname,
  port: 5173,
  plugins: [react(), tailwindcss()],
  // 两个入口：编辑器（index.html）与 render 态（render.html）。
  // 画布不是入口 —— 它是 Portal 进 iframe 的，与编辑器同一棵 React tree。
  entries: { main: 'index.html', render: 'render.html' },
});
