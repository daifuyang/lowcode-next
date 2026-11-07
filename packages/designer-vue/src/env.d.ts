/**
 * Vue SFC 的模块声明（DESIGN-v1 §12.13.8）。
 *
 * `tsc -b` 不认 `.vue`，根 `tsc -b` 只校验本包的 `.ts`（`index.ts`、`icons.ts`、
 * 纯逻辑模块）。SFC 的模板与脚本类型**当前没有静态校验**：`vue-tsc` 3.x 与仓库
 * 使用的 TypeScript 7 不兼容（`ERR_PACKAGE_PATH_NOT_EXPORTED`，实测），所以
 * 这一轮靠「Vite 构建 + SSR 冒烟（renderToString 无 Vue 警告）+ 浏览器实测」兜住，
 * 等 vue-tsc 跟上 TS7 再补（见 §12.13.7 M-L3-3 的「未做」）。
 *
 * 这里的宽类型只保证 `import Designer from './Designer.vue'` 能被解析，
 * 不假装 SFC 已经被 tsc 检查过。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

/** 全局样式（非 CSS Module），只用于副作用导入，例如 designer-ui 的 tokens.css */
declare module '*.css';
