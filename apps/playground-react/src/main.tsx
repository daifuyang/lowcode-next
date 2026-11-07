import '@pg/styles.css';

import { boot } from './boot';

/**
 * React 版 playground 的编辑器入口。
 *
 * 这里**没有任何分支**：用哪套编辑器是由「这是哪个 app」决定的 —— 本 app 的
 * `package.json` 只依赖 `@lowcode-next/designer-react`，Vue 版是隔壁的
 * `apps/playground-vue`（DESIGN-v1 §12.13.6）。
 *
 * 画布与预览都不在这里分流：它们是独立 HTML 入口（`canvas.html` / `preview.html`），
 * 由 HTML 决定加载什么。
 */
boot();
