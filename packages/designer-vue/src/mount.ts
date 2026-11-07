import { createApp } from 'vue';
import type { Component } from 'vue';
import type { DocumentImpl } from '@lowcode-next/model';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';

import Designer from './Designer.vue';

export interface MountDesignerOptions {
  document: DocumentImpl;
  registry: MaterialMetaRegistry;
  canvasPadding?: number;
  preview?: () => void;
}

/**
 * 把 Vue 版设计器挂到某个容器上（宿主侧唯一入口）。
 *
 * 宿主**不应该**自己 `createApp(Designer)`：那会让 `vue` 出现在宿主的依赖里，
 * 也就出现了「同一页面两份 Vue runtime」的风险（和 React 的 `dedupe` 是同一个
 * 问题）。这里只暴露 `mountDesigner()`，`vue` 由本包自带。
 *
 * 返回值是卸载函数；重复调用幂等（Vue 的 `app.unmount()` 对已卸载实例是空操作）。
 */
export function mountDesigner(
  target: string | Element,
  options: MountDesignerOptions,
): () => void {
  // `Designer` 的静态类型取决于调用方有没有 `*.vue` 的声明：本包（shim 到
  // `DefineComponent`）没问题，但宿主若给了更宽的声明（playground 为了不依赖
  // `vue` 的类型，声明成 `unknown`）就会在这里对不上。收窄一次，运行时不变。
  const app = createApp(
    Designer as unknown as Component,
    options as unknown as Record<string, unknown>,
  );
  app.mount(target);
  return () => app.unmount();
}
