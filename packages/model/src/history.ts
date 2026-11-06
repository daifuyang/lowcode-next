import type { Command, Document, DocumentChange } from './index';
import type { DocumentInternal } from './document';

/**
 * 撤销 / 重做。
 *
 * 四个命令从 M2 起就是可逆的，但 `Command.mergeWith` 一直是个没人调用的空契约 ——
 * 属性面板一做出来这条就绕不过去了：输入框是逐按键提交的，不合并的话
 * 撤销一次只退一个字符，用户按十次撤销也回不到编辑前。
 *
 * 所以 History 只在栈这一层负责「合并 + 反转」，不碰命令内部实现。
 */

/** 把一条命令反转成它的逆命令：apply 调 revert，revert 调 apply */
function invert(command: Command): Command {
  const withChange = command as Command & { change?: DocumentChange };
  const inverted = {
    type: command.type,
    change: withChange.change,
    apply: (doc: Document) => command.revert(doc as DocumentInternal),
    revert: (doc: Document) => command.apply(doc as DocumentInternal),
  };
  return inverted as Command;
}

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly doc: DocumentInternal,
    private readonly limit = 100,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get depth(): number {
    return this.undoStack.length;
  }

  execute(command: Command): void {
    this.doc.apply(command);

    const top = this.undoStack[this.undoStack.length - 1];
    const merged = top?.mergeWith?.(command) ?? null;

    if (merged) {
      this.undoStack[this.undoStack.length - 1] = merged;
    } else {
      this.undoStack.push(command);
      // 超过上限丢最旧的：这里是"最多能退多少步"，不是正确性问题
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }

    // 新操作会截断重做分支
    this.redoStack = [];
    this.emit();
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    this.doc.apply(invert(command));
    this.redoStack.push(command);
    this.emit();
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    this.doc.apply(command);
    this.undoStack.push(command);
    this.emit();
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
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
