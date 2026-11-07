import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 渲染层契约（DESIGN-v1 §5.1）。
 *
 * 三段式：NodeSchema ──Evaluator──> IRNode[] ──Driver──> 框架节点
 * Evaluator 是纯函数，不含任何框架概念；Driver 只做最后一步映射。
 * 框架无关性完全依赖这条边界。
 *
 * **为什么单独成包**：这些接口以前和 React Driver 一起住在 `@lowcode-next/renderer`，
 * 而那个包的 dependencies 里有 `react`。Vue 版的 Driver（`@lowcode-next/renderer-vue`）
 * 只想要 `IRNode` / `Driver` 两个类型，却被迫依赖一个 React 包 —— 与
 * `designer-vue` 依赖 `renderer` 是同一个错误。切开之后：
 *
 * ```text
 * renderer-core（零框架：契约 + 求值器 + 占位判定）
 *   ↖ renderer      （React Driver）
 *   ↖ renderer-vue  （Vue Driver）
 * ```
 */

export type RenderMode = 'edit' | 'runtime';

export interface IRNode {
  /** 对应 NodeSchema.id，会作为 data-node-id 输出 */
  id: string;
  /** React/Vue 的列表 key：id 或 id + 循环下标 */
  key: string;
  /** 组件名，由 Driver 通过物料注册表解析 */
  type: string;
  props: Record<string, unknown>;
  children: Array<IRNode | string>;
  /** 编辑态修饰（运行态恒为空） */
  editFlags?: EditFlags;
}

export interface EditFlags {
  /** hidden: true —— 编辑态半透明可见 */
  hidden?: boolean;
  /** 有 loop 指令 —— 编辑态只渲染一次，加角标 */
  loop?: boolean;
  /** condition 求值为 false —— 编辑态置灰 */
  conditionFalse?: boolean;
  /**
   * 节点被锁定 —— 编辑态不可投放、不可拖动。
   *
   * 主要给空容器占位用：锁定的容器里那个灰块要换成"锁定元素及其子元素不可编辑"，
   * 否则用户会一直对着"拖拽组件或模板到这里"拖，却永远落不进去（lowcode 同款处理）。
   */
  locked?: boolean;
}

export interface EvalContext {
  mode: RenderMode;
  /** 表达式作用域：state / props / item / index / utils */
  scope: Record<string, unknown>;
  resolver: MaterialResolver;
}

export interface MaterialResolver {
  getMeta(componentName: string): ComponentMeta | null;
  /** 组件解析交给具体 Driver，Evaluator 只需判断存在性 */
  has(componentName: string): boolean;
}

/**
 * Driver：唯一的框架相关层。
 *
 * 每个框架一个实现，接口一致 —— `@lowcode-next/renderer` 是 React 版，
 * `@lowcode-next/renderer-vue` 是 Vue 版。拖拽引擎、选中框、命中判定都不需要知道
 * 用的是哪一个：它们只查 iframe 里的 DOM。
 */
export interface Driver<Output = unknown> {
  render(node: IRNode): Output;
  renderRoot(nodes: Array<IRNode | string>): Output;
}

/** 编辑态与运行态在循环/条件/隐藏上的语义差异，见 §5.2 */
export interface RendererOptions {
  mode: RenderMode;
  resolver: MaterialResolver;
}

export { evaluate } from './evaluator';
export { shouldPlacePlaceholder } from './placeholder';
export { flagString } from './flags';
