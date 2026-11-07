/**
 * `@lowcode-next/lowcode-react` —— React 版零配置接入层（DESIGN-v1 §12.14）。
 *
 * 分层位置：最外层，唯一允许同时依赖「编辑器 + 渲染 + 物料 + 模型」的包。
 *
 * ```text
 * lowcode-react          接入层：装配、document、画布宿主、错误兜底
 *   ├─ designer-react    编辑器视图
 *   ├─ materials-react   物料实现
 *   └─ renderer          渲染驱动
 * ```
 *
 * 前面的包都只解决「一个层面」的问题，接入方要自己把四五个包接线起来；
 * 这里把这套接线固化成一次 `mountEditor()`。面向业务方的文档只提这一个函数。
 */

/**
 * 物料样式随包带入。
 *
 * 不留「记得自己引 CSS」这个坑：漏引的表现是"编辑器面板正常、画布里的组件是裸的"，
 * 属于最难自查的一类问题。副作用 import 让接入方无从遗漏。
 *
 * 由宿主打包器解析（Vite/webpack），本包只声明、不打包 CSS。
 */
import '@lowcode-next/materials/styles.css';

export { mountEditor } from './mount';
export type { LowcodeEditorHandle, MountEditorOptions } from './mount';
export { assembleMaterials } from './assemble';
export type { AssembledMaterials, MaterialConfig } from './assemble';
export { CanvasSurface } from './canvas';
export type { CanvasSurfaceProps } from './canvas';
export { FatalScreen } from './fatal-screen';

export type { ComponentMeta } from '@lowcode-next/protocol';
export type { PageSchema } from '@lowcode-next/protocol';
