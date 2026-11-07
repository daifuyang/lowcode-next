/**
 * Vue SFC 在 playground 侧的类型声明。
 *
 * **不是冗余**：本 app 的 `tsconfig.paths` 把 `@lowcode-next/designer-vue`
 * 直接映射到 `packages/designer-vue/src/index.ts`（为了开发时改 `src` 即时生效），
 * 而 `index.ts` 又 re-export 了 `.vue` 组件。`include` 里没有那个包，
 * 所以 `designer-vue/src/env.d.ts` 的 `declare module '*.vue'` 在这里不可见 ——
 * 缺了这条，`tsc -p apps/playground-vue` 会为一堆 `.vue` 报 TS2307。
 *
 * 这里**故意不 import 'vue' 的类型**：本 app 不直接渲染 SFC，只调用
 * `@lowcode-next/designer-vue` 的 `mountDesigner()`。
 */
declare module '*.vue' {
  const component: unknown;
  export default component;
}
