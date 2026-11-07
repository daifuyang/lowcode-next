/**
 * `@lowcode-next/lowcode-react` —— React 版编辑态接入层（§12.14）。
 *
 * 分层位置：最外层，唯一允许同时依赖「编辑器 + 渲染 + 模型」的包。
 *
 * ```text
 * lowcode-react          编辑态：document、画布宿主、Designer 接线
 *   ├─ designer-react    编辑器视图
 *   ├─ model             文档模型
 *   └─ render-react      render 态：装配 + 内核 + LowcodeRender
 *        └─ materials-react / materials / renderer / protocol
 * ```
 *
 * **两个形态、一份内核。** 装配（`assembleMaterials`）与渲染（`renderTree`）
 * 都在 `render-react` 里，编辑态只是多订阅了文档变化、多挂了编辑界面 ——
 * 所以「编辑器里看到什么、线上就渲染什么」是结构保证的。
 *
 * 只用渲染、不想要编辑器时，直接装 `@lowcode-next/render-react`，
 * 不必把 designer 那一串（monaco / radix / lucide）拖进项目。
 */

/**
 * 物料样式随包带入（`render-react` 里也有一次，打包器会去重）。
 *
 * 不留「记得自己引 CSS」这个坑：漏引的表现是"编辑器面板正常、画布里的组件是裸的"，
 * 属于最难自查的一类问题。
 */
import '@lowcode-next/materials/styles.css';

export { createEditor } from './editor';
export type { CreateEditorOptions, EditorHandle } from './editor';

/** 编辑态画布：把 render 内核 + 文档订阅包成 Designer 需要的形态 */
export { CanvasSurface } from './canvas';
export type { CanvasSurfaceProps } from './canvas';

/**
 * 装配与错误页的**归属**已经移到 `render-react`（两个形态共用），
 * 这里转出去只为让既有接入方不必多引一个包。
 */
export { assembleMaterials, FatalScreen } from '@lowcode-next/render-react';
export type {
  AssembledMaterials,
  MaterialConfig,
  MaterialInput,
} from '@lowcode-next/render-react';

export type { ComponentMeta, PageSchema } from '@lowcode-next/protocol';
