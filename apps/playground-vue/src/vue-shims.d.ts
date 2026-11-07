/**
 * Vue SFC 在 playground 侧的类型声明。
 *
 * **不是冗余**：本 app 的 `tsconfig.paths` 把 `@lowcode-next/designer-vue` 与
 * `@lowcode-next/materials-vue` 直接映射到各自包的 `src/*`（为了开发时改 `src`
 * 即时生效），而这些 `index.ts` 又 re-export 了 `.vue` 组件。`include` 里没有那些
 * 包，所以包内 `env.d.ts` 的 `declare module '*.vue'` 在这里不可见 —— 缺了这条，
 * `tsc -p apps/playground-vue` 会为一堆 `.vue` 报 TS2307。
 *
 * 声明成 `Component` 而不是 `unknown`：本 app 现在会**直接渲染**这些 SFC
 * （`materials-vue` 的组件交给 `renderer-vue` 的 `h()`），赋给
 * `Record<string, Component>` 时 `unknown` 通不过。
 */
declare module '*.vue' {
  import type { Component } from 'vue';

  const component: Component;
  export default component;
}
