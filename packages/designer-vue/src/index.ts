/**
 * Vue 版设计器（DESIGN-v1 §12.13.3 / §12.13.7 M-L3-3）。
 *
 * 这里导出的是**视图**：外壳、大纲、物料、选中框、浮条。
 * 状态与写操作在 `@lowcode-next/designer-core` 的 `DesignerSession` 里，
 * 所以本包与 `designer-react` 只共享 core 与 designer-ui（同一份 CSS Module），
 * 两者之间没有 import 关系，可以各自 tree-shake（§12.13.6）。
 *
 * 当前进度：**M-L3-3 只读骨架**。没有属性面板（M-L3-4）、没有数据源与拖拽
 * （M-L3-5），因此这里没有 setter 相关导出 —— 不要为了"对齐 React 的导出面"
 * 提前导出还不存在的东西。
 */
export { default as Designer } from './Designer.vue';
export { default as DesignerShell } from './DesignerShell.vue';
export { default as ActivityRail } from './ActivityRail.vue';
export { default as LeftPane } from './LeftPane.vue';
export { default as MaterialPanel } from './MaterialPanel.vue';
export { default as TreePanel } from './TreePanel.vue';
export { default as TreeNode } from './TreeNode.vue';
export { default as FloatToolbar } from './FloatToolbar.vue';
export { default as SelectionBorders } from './SelectionBorders.vue';
export { default as PaneHeader } from './PaneHeader.vue';
export { default as MatIcon } from './MatIcon.vue';
export { default as EngineIcon } from './EngineIcon.vue';

export { mountDesigner } from './mount';
export type { MountDesignerOptions } from './mount';
export type { ActivityItem } from './types';

// 与 designer-react 一样把 core 的公开面转出去：宿主接 Vue 版时不需要再单独装 core
export * from '@lowcode-next/designer-core';
