import type { NodeSchema } from '@lowcode-next/protocol';
import type { Command, DocumentChange } from './index';
import type { DocumentInternal } from './document';
import { createNodeId } from './id';

/** 落点：容器 id + 元素下标（不含被拖节点的坐标系） */
export interface DropSlot {
  containerId: string;
  index: number;
}

/**
 * 连续输入的合并窗口。
 *
 * 属性面板是逐按键提交的，不合并的话每敲一个字都是一条历史记录，
 * 撤销一次只退一个字符。同 key 且在窗口内的修改合并成一条，
 * 撤销退回"这轮输入开始之前"的完整值。
 */
const MERGE_WINDOW = 800;

function now(): number {
  return Date.now();
}

/**
 * v1 的四个命令（DESIGN-v1 §4.2）。
 *
 * 都是可逆的：apply 之后再 revert 必须回到原始结构，
 * 这是 v1.1 接 history 的前提。
 */

export class InsertNode implements Command {
  readonly type = 'insert-node';
  readonly change: DocumentChange;
  private readonly schema: NodeSchema;

  constructor(
    private readonly parentId: string,
    private readonly index: number,
    template: Omit<NodeSchema, 'id'> & { id?: string },
  ) {
    const id = template.id ?? createNodeId(template.componentName.toLowerCase());
    this.schema = { ...template, id };
    this.change = { type: 'node.add', nodeIds: [id] };
  }

  get nodeId(): string {
    return this.schema.id;
  }

  apply(doc: DocumentInternal): void {
    doc.insertChild(this.parentId, this.index, this.schema);
  }

  revert(doc: DocumentInternal): void {
    doc.removeNode(this.schema.id);
  }
}

export class MoveNode implements Command {
  readonly type = 'move-node';
  readonly change: DocumentChange;
  private previous: { parentId: string; index: number; schema: NodeSchema } | null = null;

  constructor(
    private readonly nodeId: string,
    private readonly target: DropSlot,
  ) {
    this.change = { type: 'node.move', nodeIds: [nodeId] };
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node || !node.parent) return;
    if (node.id === doc.root.id) return;

    this.previous = {
      parentId: node.parent.id,
      index: node.index(),
      schema: node.schema,
    };

    doc.removeNode(this.nodeId);
    doc.insertChild(this.target.containerId, this.target.index, this.previous.schema);
  }

  revert(doc: DocumentInternal): void {
    if (!this.previous) return;
    doc.removeNode(this.nodeId);
    doc.insertChild(this.previous.parentId, this.previous.index, this.previous.schema);
  }
}

export class RemoveNode implements Command {
  readonly type = 'remove-node';
  readonly change: DocumentChange;
  private removed: { parentId: string; index: number; schema: NodeSchema } | null = null;

  constructor(private readonly nodeId: string) {
    this.change = { type: 'node.remove', nodeIds: [nodeId] };
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node || !node.parent) return;

    this.removed = {
      parentId: node.parent.id,
      index: node.index(),
      schema: node.schema,
    };
    doc.removeNode(this.nodeId);
  }

  revert(doc: DocumentInternal): void {
    if (!this.removed) return;
    doc.insertChild(this.removed.parentId, this.removed.index, this.removed.schema);
  }
}

/**
 * 改属性。
 *
 * 两个语义细节，都是做属性面板时踩出来的：
 * 1. patch 里值为 `undefined` 表示**删除该键**，而不是写一个 undefined。
 *    否则用户把输入框清空之后，键还在、值是 undefined，
 *    面板显示"空"，物料那边 `num(undefined, 16)` 回落到默认值，
 *    但导出的 schema 里留着一个 undefined —— 既不是"没设置"也不合法。
 * 2. 同一节点同一批键的连续修改在 800ms 内合并成一条历史，
 *    撤销退回整轮输入之前，而不是逐字符回退。
 */
export class SetProps implements Command {
  readonly type = 'set-props';
  readonly change: DocumentChange;
  private previous: Record<string, unknown> | null = null;
  private patch: Record<string, unknown>;
  private time = 0;
  private readonly key: string;

  constructor(
    private readonly nodeId: string,
    patch: Record<string, unknown>,
  ) {
    this.patch = patch;
    this.change = { type: 'node.props', nodeIds: [nodeId] };
    this.key = `${nodeId}:${Object.keys(patch).sort().join(',')}`;
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node) return;
    if (!this.previous) this.previous = { ...node.props };
    doc.setProps(this.nodeId, this.patch);
    this.time = now();
  }

  revert(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node || !this.previous) return;
    node.schema.props = { ...this.previous };
  }

  mergeWith(next: Command): Command | null {
    if (!(next instanceof SetProps)) return null;
    if (next.key !== this.key) return null;
    if (next.time - this.time > MERGE_WINDOW) return null;

    // 就地合并：previous 保留整轮输入的起点，patch 滚到最新值。
    // 文档已经被 next.apply 改到最新状态，这里只改栈上的记录。
    this.patch = { ...this.patch, ...next.patch };
    this.time = next.time;
    return this;
  }
}

/**
 * 改文案。
 *
 * 文案在 schema 里是 `children: ['标题']`，不是 prop —— 这是最容易漏的一类编辑。
 * 属性面板只能改 props，改不了 children，用户最常做的那件事（改字）反而没入口。
 *
 * 只处理"纯文本 children"：一旦有元素子节点就直接放弃，
 * 避免把一堆子节点替换成一行字符串（那是删除，不是改文案）。
 */
export class SetText implements Command {
  readonly type = 'set-text';
  readonly change: DocumentChange;
  private previous: Array<NodeSchema | string> | null = null;

  constructor(
    private readonly nodeId: string,
    private readonly text: string,
  ) {
    this.change = { type: 'node.children', nodeIds: [nodeId] };
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node) return;
    if (node.children.length > 0) return;
    if (!this.previous) this.previous = [...(node.schema.children ?? [])];
    doc.setText(this.nodeId, this.text);
  }

  revert(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node || !this.previous) return;
    node.restoreTextChildren(this.previous);
  }
}

/**
 * 改 condition / loop / loopArgs 这类渲染指令（DESIGN-v1 §3：节点级、不在 props）。
 *
 * 对应 lowcode-engine 的「高级」页签（addon-combine 里的 #advanced 分组）。
 * 与 SetFlag 同一模式：undefined 表示删键。
 */
export class SetDirective implements Command {
  readonly type = 'set-directive';
  readonly change: DocumentChange;
  private previous: Pick<NodeSchema, 'condition' | 'loop' | 'loopArgs'> | null = null;

  constructor(
    private readonly nodeId: string,
    private readonly patch: { condition?: unknown; loop?: unknown; loopArgs?: unknown },
  ) {
    this.change = { type: 'node.directive', nodeIds: [nodeId] };
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node) return;
    if (!this.previous) {
      this.previous = {
        condition: node.schema.condition,
        loop: node.schema.loop,
        loopArgs: node.schema.loopArgs,
      };
    }
    doc.setDirective(this.nodeId, this.patch);
  }

  revert(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node || !this.previous) return;
    const previous = this.previous;
    doc.setDirective(this.nodeId, {
      condition: previous.condition,
      loop: previous.loop,
      loopArgs: previous.loopArgs,
    });
  }
}

/**
 * 改节点标题（大纲里显示的名字）。
 *
 * 语义上和 lowcode 的「重命名」一致，落点不同：引擎把 label 存在大纲 controller 里，
 * 刷新就丢；这里写进 `schema.title` —— 能进历史、能序列化、能随页面存下来。
 * 空串 / undefined 表示恢复默认标题（删键），大纲回落到物料 meta.title。
 */
export class SetTitle implements Command {
  readonly type = 'set-title';
  readonly change: DocumentChange;
  private previous: string | undefined;
  private applied = false;

  constructor(
    private readonly nodeId: string,
    private readonly title?: string,
  ) {
    this.change = { type: 'node.title', nodeIds: [nodeId] };
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node) return;
    // 只在第一次 apply 时记旧值：redo 时不能把"改完的标题"当成旧值
    if (!this.applied) {
      this.previous = node.schema.title;
      this.applied = true;
    }
    doc.setTitle(this.nodeId, this.title);
  }

  revert(doc: DocumentInternal): void {
    if (!this.applied) return;
    doc.setTitle(this.nodeId, this.previous);
  }
}

/** 改 hidden / locked 这类 schema 顶层开关，不属于 props */
export class SetFlag implements Command {
  readonly type = 'set-flag';
  readonly change: DocumentChange;
  private previous: { hidden: boolean; locked: boolean } | null = null;

  constructor(
    private readonly nodeId: string,
    private readonly patch: { hidden?: boolean; locked?: boolean },
  ) {
    this.change = { type: 'node.flag', nodeIds: [nodeId] };
  }

  apply(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node) return;
    if (!this.previous) {
      this.previous = { hidden: Boolean(node.schema.hidden), locked: Boolean(node.schema.locked) };
    }
    doc.setFlag(this.nodeId, this.patch);
  }

  revert(doc: DocumentInternal): void {
    const node = doc.getNode(this.nodeId);
    if (!node || !this.previous) return;
    if (this.previous.hidden) node.schema.hidden = true;
    else delete node.schema.hidden;
    if (this.previous.locked) node.schema.locked = true;
    else delete node.schema.locked;
  }
}
