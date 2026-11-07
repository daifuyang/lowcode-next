/**
 * React 渲染层（DESIGN-v1 §5.1）。
 *
 * 契约、求值器、空容器占位判定都在 `@lowcode-next/renderer-core`（零框架），
 * 本包只剩 React Driver。这样 Vue 版可以只要契约、不要 React。
 *
 * 对外 API 保持原样：`evaluate` / `shouldPlacePlaceholder` / `IRNode` / `Driver`
 * 等仍然从这里能拿到，宿主的 import 不用改。
 */

export * from '@lowcode-next/renderer-core';

export { createReactDriver } from './react-driver';
export type { ReactDriverOptions, ReactRendererInput } from './react-driver';
export { FaultBoundary } from './fault-boundary';
