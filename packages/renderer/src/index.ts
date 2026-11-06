import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 渲染层契约（M1 实现 Evaluator 与 ReactDriver）。
 *
 * 三段式：NodeSchema ──Evaluator──> IRNode[] ──Driver──> 框架节点
 * Evaluator 是纯函数，不含任何框架概念；Driver 只做最后一步映射。
 * 框架无关性完全依赖这条边界（见 DESIGN-v1.md §5.1 / §7.4）。
 */

export type RenderMode = 'edit' | 'runtime';

export interface IRNode {
  /** 对应 NodeSchema.id，会作为 data-node-id 输出 */
  id: string;
  /** React/Vue 的列表 key：id 或 id + 循环下标 */
  key: string;
  /** 组件名，由 Driver 通过 MaterialRegistry 解析 */
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
 * v1 只实现 ReactDriver，VueDriver 后续补，拖拽引擎无需改动。
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

/* ------------------------------------------------------------------ */
/* 实现（M1）                                                          */
/* ------------------------------------------------------------------ */

export { evaluate } from './evaluator';
export { MaterialRegistry, createMaterialRegistry } from './registry';
export type { MaterialDefinition } from './registry';
export { createReactDriver, flagString, shouldPlacePlaceholder } from './react-driver';
export type { ReactDriverOptions } from './react-driver';
export * from './materials';
