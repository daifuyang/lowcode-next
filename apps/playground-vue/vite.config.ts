import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

// 必须带 `.ts` 扩展名：Vite 8 的 `configLoader: 'native'` 不接受无扩展名的相对
// import（现在只是警告，未来会成为默认）。两个 app 的 tsconfig 里开了
// `allowImportingTsExtensions` 以配合。
import { defineApp } from '../shared/vite.base.ts';

/**
 * Vue 版 playground（DESIGN-v1 §12.13.6）。
 *
 * 一份独立的 app，不是「同一个 app 换个构建参数」：本 app 依赖
 * `@lowcode-next/designer-vue`，隔壁 `playground-react` 依赖 `designer-react`。
 * 所以编辑器 chunk 里不可能出现另一套视图层 —— 它不在依赖图里，不是靠 DCE 抹掉的。
 *
 * 注意 `react` / `react-dom` 仍在本 app 的依赖里：画布（`canvas.html`）与预览
 * （`preview.html`）走 `renderer-react`，那是**渲染层**，与编辑器 UI 框架无关。
 * 这就是组合矩阵里「Vue 编辑器 + React 画布」那一格。
 */
export default defineApp({
  appDir: import.meta.dirname,
  port: 5174,
  plugins: [vue(), tailwindcss()],
});
