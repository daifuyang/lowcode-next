/**
 * `@lowcode-next/render-react` —— React 版 render 态接入层（§12.14）。
 *
 * 分层位置：接入层，但**只到渲染为止**。
 *
 * ```text
 * render-react            渲染接入：装配 + 内核 + LowcodeRender 组件
 *   ├─ materials-react    物料实现
 *   ├─ materials          物料描述与注册表
 *   ├─ renderer           React Driver
 *   └─ protocol           schema 类型与校验
 * ```
 *
 * 与 `@lowcode-next/lowcode-react`（编辑态）是**两个形态、一份内核**：
 * 那个包依赖本包复用 `assembleMaterials` / `renderTree`，再叠加编辑器。
 *
 * 依赖链里**没有 `model`，也没有任何 designer 包** —— 消费端不需要文档模型，
 * 更不该为了渲染一个页面把 monaco、radix、lucide 装进自己的项目。
 */

/**
 * 物料样式随包带入。
 *
 * 与编辑态同一个理由：不留「记得自己引 CSS」这个坑。漏引的表现是
 * "组件全是裸的"，属于最难自查的一类问题。
 *
 * 由宿主打包器解析（Vite/webpack），本包只声明、不打包 CSS。
 */
import '@lowcode-next/materials/styles.css';

export { LowcodeRender } from './LowcodeRender';
export type { LowcodeRenderProps } from './LowcodeRender';

/** 内核：给已经持有 schema 树、想自己控制外层容器的场景 */
export { renderTree } from './render-tree';
export type { RenderTreeOptions, TreeInput } from './render-tree';

/** 装配：给需要自己造注册表的高级用法（自定义 driver、SSR 等） */
export { assembleMaterials } from './assemble';
export type { AssembledMaterials, MaterialConfig, MaterialInput } from './assemble';

export { FatalScreen } from './fatal-screen';
export type { FatalScreenProps } from './fatal-screen';

export type { ComponentMeta, PageSchema } from '@lowcode-next/protocol';

/**
 * 渲染模式的类型也要导出：`renderTree` 的选项里有它，编辑态的画布外层
 * 同样需要标注。从 `renderer-core` 转一手，让调用方不必再引一个包。
 */
export type { RenderMode } from '@lowcode-next/renderer';
