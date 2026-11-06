import type { ComponentMeta, DataSourceConfig, NodeSchema, PageSchema } from '@lowcode-next/protocol';

/**
 * 文档模型契约（M2 实现）。
 *
 * 约定：
 * - 所有写操作必须走 Document.apply(command)，节点上不暴露可直接改结构的方法
 * - Document 不认识 renderer，物料信息通过 MaterialResolver 注入
 * - 变更通过 subscribe 广播，payload 携带 nodeIds，为 v2 细粒度订阅预留
 */

export type DocumentChangeType =
  | 'node.add'
  | 'node.remove'
  | 'node.move'
  | 'node.props'
  | 'node.children'
  | 'node.title'
  | 'node.flag'
  | 'node.directive'
  | 'doc.dataSource'
  | 'doc.reset';

export interface DocumentChange {
  type: DocumentChangeType;
  nodeIds: string[];
}

export interface Node {
  readonly id: string;
  readonly componentName: string;
  readonly meta: ComponentMeta | null;
  readonly parent: Node | null;
  readonly children: readonly Node[];
  readonly schema: NodeSchema;
  readonly props: Readonly<Record<string, unknown>>;
  readonly hidden: boolean;
  readonly locked: boolean;

  isContainer(): boolean;
  index(): number;
  /** 判断 other 是否在自身子树内（含自身），拖拽防自嵌套用 */
  contains(other: Node): boolean;
}

export interface Selection {
  readonly selectedId: string | null;
  readonly hoverId: string | null;
  select(id: string | null): void;
  hover(id: string | null): void;
  subscribe(listener: () => void): () => void;
}

export interface Command {
  readonly type: string;
  apply(doc: Document): void;
  revert(doc: Document): void;
  /** 返回合并后的命令，用于连续输入合并；返回 null 表示不合并 */
  mergeWith?(next: Command): Command | null;
}

/** 由 @lowcode-next/renderer 的 MaterialRegistry 实现并注入 */
export interface MaterialResolver {
  getMeta(componentName: string): ComponentMeta | null;
}

export interface Document {
  readonly id: string;
  readonly root: Node;
  readonly selection: Selection;
  /** 页面数据源列表（schema.dataSource.list 的编辑态视图） */
  readonly dataSource: DataSourceConfig[];

  getNode(id: string): Node | null;
  apply(command: Command): void;
  /** 整表替换数据源列表（数据源面板的编辑粒度；不进撤销栈，引擎同口径） */
  setDataSource(list: DataSourceConfig[]): void;
  toSchema(): PageSchema;
  subscribe(listener: (change: DocumentChange) => void): () => void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* 实现（M2）                                                          */
/* ------------------------------------------------------------------ */

export { NodeImpl } from './node';
export { DocumentImpl, SelectionImpl, createDocument } from './document';
export type { DocumentInternal } from './document';
export {
  InsertNode,
  MoveNode,
  RemoveNode,
  SetProps,
  SetText,
  SetTitle,
  SetFlag,
  SetDirective,
} from './commands';
export type { DropSlot } from './commands';
export { History } from './history';
export { createNodeId } from './id';
