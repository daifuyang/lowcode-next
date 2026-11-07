import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

/**
 * React 版编辑器装配。
 *
 * 与 `apps/playground-vue/src/boot.ts` 一一对应 —— 两者各自是独立 app，
 * 不存在「一个入口按开关选一个」，所以不需要编译期常量，也没有动态 `import()`
 * 拆 chunk（那是为了把另一套编辑器 DCE 掉，现在另一套根本不在依赖图里）。
 */
export function boot() {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  /**
   * 注册表演示（DESIGN-v1 §12.12.6）：`?setter=demo` 时把内置 `textarea` 换成
   * 一个自定义实现，用来验证「编辑器已经跑起来之后注册 / 加载 setter，属性面板立刻刷新」。
   *
   * 用动态 `import()` 而不是顶部静态导入，是刻意的：它复现真实场景 ——
   * setter 包往往在插件激活、路由切换时才拉，而不是首屏必备。
   * 不加参数就什么都不注册，界面与接线前完全一致（零回归）。
   *
   * 这是**功能演示开关**，不是 flavor：它不影响加载哪套设计器，所以可以留在运行时。
   */
  if (new URLSearchParams(globalThis.location.search).get('setter') === 'demo') {
    void import('./demo-setters').then(({ registerDemoSetters }) => registerDemoSetters());
  }
}
