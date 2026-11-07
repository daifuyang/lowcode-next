/**
 * Vue SFC 的模块声明。
 *
 * `tsc -b` 不认 `.vue`，本包的 `tsconfig` 只 include `src` 下的 `.ts`，所以 SFC 的
 * 模板与脚本**没有静态类型校验** —— 与 `designer-vue` 同样的处境（`vue-tsc` 3.x
 * 与仓库的 TypeScript 7 不兼容）。兜底手段是「Vite 构建 + 浏览器实测 + 与
 * React 版 DOM 逐项对照」，这也是为什么先只做 3 个物料：多一个物料就多一份
 * 手工比对的成本，先把链路和判据钉死再铺开。
 */
declare module '*.vue' {
  import type { Component } from 'vue';

  /**
   * 声明成 `Component` 而不是 `DefineComponent<...>`：SFC 没有静态类型校验的前提下，
   * 后者那几个泛型参数只会让「赋值给 `Record<string, Component>`」报不兼容，
   * 换不来任何额外检查。
   */
  const component: Component;
  export default component;
}
