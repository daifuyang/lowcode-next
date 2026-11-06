import type { DataSourceConfig, NodeSchema, PageSchema } from '@lowcode-next/protocol';
import type { Document, DocumentChange, DocumentChangeType, MaterialResolver, Selection } from './index';
import { NodeImpl } from './node';

/**
 * 文档实现（DESIGN-v1 §4）。
 *
 * 约定：
 * - 外部只能通过 apply(command) 改结构，命令是唯一写入口（D5/D6）
 * - 变更通过 subscribe 广播；v1 直接整树重渲染（D14）
 */

export interface DocumentInternal extends Document {
  readonly resolver: MaterialResolver;
  /** 内部实现里拿到的是可变节点，命令需要用到 schema 之外的写方法 */
  getNode(id: string): NodeImpl | null;
  insertChild(parentId: string, index: number, schema: NodeSchema): NodeImpl;
  removeNode(id: string): NodeImpl | null;
  setProps(id: string, props: Record<string, unknown>): void;
  setText(id: string, text: string): void;
  /** 改节点标题；undefined / 空串表示删掉自定义标题，回落到物料 meta.title */
  setTitle(id: string, title?: string): void;
  setFlag(id: string, patch: { hidden?: boolean; locked?: boolean }): void;
  setDirective(
    id: string,
    patch: { condition?: unknown; loop?: unknown; loopArgs?: unknown },
  ): void;
  notify(change: DocumentChange): void;
}

export class SelectionImpl implements Selection {
  private currentSelectedId: string | null = null;
  private currentHoverId: string | null = null;
  private readonly listeners = new Set<() => void>();

  get selectedId(): string | null {
    return this.currentSelectedId;
  }

  get hoverId(): string | null {
    return this.currentHoverId;
  }

  select(id: string | null): void {
    if (this.currentSelectedId === id) return;
    this.currentSelectedId = id;
    this.emit();
  }

  hover(id: string | null): void {
    if (this.currentHoverId === id) return;
    this.currentHoverId = id;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export class DocumentImpl implements DocumentInternal {
  readonly id: string;
  readonly selection: SelectionImpl;

  private readonly page: PageSchema;
  private dataSourceList: DataSourceConfig[];
  private readonly rootNode: NodeImpl;
  private readonly index = new Map<string, NodeImpl>();
  private readonly listeners = new Set<(change: DocumentChange) => void>();

  constructor(schema: PageSchema, readonly resolver: MaterialResolver, id = 'doc') {
    this.id = id;
    this.page = schema;
    this.dataSourceList = schema.dataSource ? structuredClone(schema.dataSource.list) : [];
    this.selection = new SelectionImpl();
    this.rootNode = new NodeImpl(schema.componentsTree, resolver);
    this.register(this.rootNode);
  }

  get root(): NodeImpl {
    return this.rootNode;
  }

  get dataSource(): DataSourceConfig[] {
    return this.dataSourceList;
  }

  setDataSource(list: DataSourceConfig[]): void {
    this.dataSourceList = structuredClone(list);
    this.notify({ type: 'doc.dataSource', nodeIds: [] });
  }

  getNode(id: string): NodeImpl | null {
    return this.index.get(id) ?? null;
  }

  apply(command: { readonly type: string; apply(doc: Document): void; revert(doc: Document): void }): void {
    command.apply(this);
    this.notify(changeOf(command));
  }

  toSchema(): PageSchema {
    const output: PageSchema = {
      version: this.page.version,
      componentsMap: structuredClone(this.page.componentsMap),
      componentsTree: toSerializable(this.rootNode.schema),
    };
    if (this.dataSourceList.length) output.dataSource = { list: structuredClone(this.dataSourceList) };
    if (this.page.meta) output.meta = structuredClone(this.page.meta);
    return output;
  }

  subscribe(listener: (change: DocumentChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.index.clear();
  }

  insertChild(parentId: string, index: number, schema: NodeSchema): NodeImpl {
    const parent = this.index.get(parentId);
    if (!parent) throw new Error(`insertChild: 找不到父节点 ${parentId}`);
    if (!parent.isContainer()) {
      throw new Error(`insertChild: ${parent.componentName} 不是容器`);
    }

    const node = new NodeImpl(schema, this.resolver);
    parent.insertChild(index, node);
    this.register(node);
    return node;
  }

  removeNode(id: string): NodeImpl | null {
    const node = this.index.get(id);
    if (!node) return null;
    if (!node.parent) throw new Error('removeNode: root 不能被删除');

    node.parent.removeChild(node);
    this.unregister(node);
    return node;
  }

  setProps(id: string, props: Record<string, unknown>): void {
    const node = this.index.get(id);
    if (!node) return;
    const next: Record<string, unknown> = { ...node.props };
    for (const [key, value] of Object.entries(props)) {
      // undefined 表示删除这个键，而不是保留一个值为 undefined 的键
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    node.schema.props = next;
  }

  setText(id: string, text: string): void {
    this.index.get(id)?.setTextChildren(text);
  }

  setTitle(id: string, title?: string): void {
    const node = this.index.get(id);
    if (!node) return;
    // 空标题等于"没起名"：删键而不是留一个空串，
    // 否则大纲会显示成空白行，导出schema里也多一个无意义的字段
    const next = title?.trim();
    if (next) node.schema.title = next;
    else delete node.schema.title;
  }

  setFlag(id: string, patch: { hidden?: boolean; locked?: boolean }): void {
    const node = this.index.get(id);
    if (!node) return;
    if (patch.hidden !== undefined) {
      if (patch.hidden) node.schema.hidden = true;
      else delete node.schema.hidden;
    }
    if (patch.locked !== undefined) {
      if (patch.locked) node.schema.locked = true;
      else delete node.schema.locked;
    }
  }

  setDirective(
    id: string,
    patch: { condition?: unknown; loop?: unknown; loopArgs?: unknown },
  ): void {
    const node = this.index.get(id);
    if (!node) return;
    // undefined 表示删除该键：高级面板把输入清空时，键要整个消失，
    // 不能留一个值为 undefined 的键污染导出的 schema
    if ('condition' in patch) {
      if (patch.condition === undefined) delete node.schema.condition;
      else node.schema.condition = patch.condition as NodeSchema['condition'];
    }
    if ('loop' in patch) {
      if (patch.loop === undefined) delete node.schema.loop;
      else node.schema.loop = patch.loop as NodeSchema['loop'];
    }
    if ('loopArgs' in patch) {
      if (patch.loopArgs === undefined) delete node.schema.loopArgs;
      else node.schema.loopArgs = patch.loopArgs as NodeSchema['loopArgs'];
    }
  }

  notify(change: DocumentChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private register(node: NodeImpl): void {
    this.index.set(node.id, node);
    for (const child of node.children) this.register(child as NodeImpl);
  }

  private unregister(node: NodeImpl): void {
    this.index.delete(node.id);
    for (const child of node.children) this.unregister(child as NodeImpl);
  }
}

function changeOf(command: { readonly type: string }): DocumentChange {
  const withChange = command as { change?: DocumentChange; type: string };
  if (withChange.change) return withChange.change;
  return { type: fallbackType(command.type), nodeIds: [] };
}

function fallbackType(type: string): DocumentChangeType {
  if (type.includes('insert')) return 'node.add';
  if (type.includes('move')) return 'node.move';
  if (type.includes('remove')) return 'node.remove';
  if (type.includes('props')) return 'node.props';
  return 'doc.reset';
}

/** toSchema 前剥掉运行时引用，避免 structuredClone 撞到不可序列化值 */
function toSerializable(schema: NodeSchema): NodeSchema {
  const clone: NodeSchema = {
    id: schema.id,
    componentName: schema.componentName,
  };
  if (schema.title !== undefined) clone.title = schema.title;
  if (schema.props) clone.props = cloneValue(schema.props);
  if (schema.children) {
    clone.children = schema.children.map((child) =>
      typeof child === 'string' ? child : toSerializable(child),
    );
  }
  if (schema.condition !== undefined) clone.condition = schema.condition;
  if (schema.loop !== undefined) clone.loop = schema.loop;
  if (schema.loopArgs) clone.loopArgs = schema.loopArgs;
  if (schema.hidden !== undefined) clone.hidden = schema.hidden;
  if (schema.locked !== undefined) clone.locked = schema.locked;
  if (schema.meta) clone.meta = cloneValue(schema.meta);
  return clone;
}

/** props 里可能混入函数/RegExp，structuredClone 会抛，退化到原引用 */
function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export function createDocument(
  schema: PageSchema,
  resolver: MaterialResolver,
  id?: string,
): DocumentImpl {
  return new DocumentImpl(schema, resolver, id);
}
