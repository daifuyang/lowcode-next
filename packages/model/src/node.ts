import { isContainerMeta } from '@lowcode-next/protocol';
import type { ComponentMeta, NodeSchema } from '@lowcode-next/protocol';
import type { MaterialResolver, Node } from './index';

/**
 * 可变节点实现（DESIGN-v1 §4.1 / D5）。
 *
 * 结构变更只能由 Document 内部调用 insertChild / removeChild 完成，
 * 外部拿到的 children 是只读视图。
 *
 * children 采用双数组维护：
 * - `entries` 与 schema.children 一一对齐（元素 + 文本混排）
 * - `nodes` 只装元素节点，拖拽下标以它为准
 */
export class NodeImpl implements Node {
  readonly id: string;
  readonly componentName: string;
  readonly meta: ComponentMeta | null;
  parent: NodeImpl | null = null;

  private readonly schemaRef: NodeSchema;
  private entries: Array<NodeImpl | string> = [];
  private nodes: NodeImpl[] = [];

  constructor(schema: NodeSchema, resolver: MaterialResolver) {
    this.id = schema.id;
    this.componentName = schema.componentName;
    this.schemaRef = schema;
    this.meta = resolver.getMeta(schema.componentName) ?? null;

    for (const child of schema.children ?? []) {
      if (typeof child === 'string') {
        this.entries.push(child);
        continue;
      }
      const node = new NodeImpl(child, resolver);
      node.parent = this;
      this.entries.push(node);
      this.nodes.push(node);
    }
  }

  get schema(): NodeSchema {
    return this.schemaRef;
  }

  get props(): Readonly<Record<string, unknown>> {
    if (!this.schemaRef.props) this.schemaRef.props = {};
    return this.schemaRef.props;
  }

  get children(): readonly Node[] {
    return this.nodes;
  }

  get hidden(): boolean {
    return Boolean(this.schemaRef.hidden);
  }

  get locked(): boolean {
    return Boolean(this.schemaRef.locked);
  }

  isContainer(): boolean {
    return isContainerMeta(this.meta);
  }

  index(): number {
    return this.parent ? this.parent.nodes.indexOf(this) : -1;
  }

  contains(other: Node): boolean {
    let current: Node | null = other;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  /** 内部使用：按元素下标插入，同时写回 schema.children */
  insertChild(index: number, node: NodeImpl): void {
    const clamped = Math.max(0, Math.min(index, this.nodes.length));
    const entryIndex = this.entryIndexFor(clamped);

    node.parent = this;
    this.nodes.splice(clamped, 0, node);
    this.entries.splice(entryIndex, 0, node);

    const children = this.ensureSchemaChildren();
    children.splice(entryIndex, 0, node.schema);
  }

  /** 内部使用：移除子元素，同时写回 schema.children */
  removeChild(node: NodeImpl): void {
    const nodeIndex = this.nodes.indexOf(node);
    if (nodeIndex < 0) return;

    const entryIndex = this.entries.indexOf(node);
    this.nodes.splice(nodeIndex, 1);
    if (entryIndex >= 0) this.entries.splice(entryIndex, 1);
    node.parent = null;

    const children = this.schemaRef.children;
    if (children) {
      const schemaIndex = children.indexOf(node.schema);
      if (schemaIndex >= 0) children.splice(schemaIndex, 1);
    }
  }

  /** 元素下标 → schema.children 下标 */
  private entryIndexFor(nodeIndex: number): number {
    if (nodeIndex >= this.nodes.length) return this.entries.length;
    const target = this.nodes[nodeIndex]!;
    const entryIndex = this.entries.indexOf(target);
    return entryIndex >= 0 ? entryIndex : this.entries.length;
  }

  /**
   * 内部使用：整体替换纯文本 children（属性面板改文案走这里）。
   *
   * 有元素子节点时直接拒绝 —— 那不是"改文案"，是把整棵子树删掉换成一行字，
   * 调用方应该明确用 RemoveNode 表达删除意图。
   */
  setTextChildren(text: string): void {
    if (this.nodes.length > 0) return;
    const next = text ? [text] : [];
    this.entries = [...next];
    this.schemaRef.children = [...next];
  }

  /** 内部使用：回滚纯文本 children（SetText 的 revert 用） */
  restoreTextChildren(children: Array<NodeSchema | string>): void {
    if (this.nodes.length > 0) return;
    const next = children.filter((child): child is string => typeof child === 'string');
    this.entries = [...next];
    this.schemaRef.children = [...next];
  }

  /** 只读快照：当前 children 里有没有元素节点 */
  hasElementChildren(): boolean {
    return this.nodes.length > 0;
  }

  private ensureSchemaChildren(): Array<NodeSchema | string> {
    if (!this.schemaRef.children) this.schemaRef.children = [];
    return this.schemaRef.children;
  }
}
