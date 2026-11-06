/**
 * 拖拽引擎契约（M3/M4 实现）。
 *
 * 本包**不依赖 @lowcode-next/model**，只认字符串 id、坐标和矩形。
 * 好处：可用纯数字单测 Locator，也可脱离低代码场景复用。
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DragPayload =
  | { type: 'node'; ids: string[]; source: 'canvas' }
  | { type: 'material'; componentName: string };

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  containerId: string;
  /** 落在 container.children 中的下标 */
  index: number;
  position: DropPosition;
  /** 指示线 / 高亮框的矩形（屏幕坐标） */
  rect: Rect;
  axis: 'x' | 'y';
  valid: boolean;
  reason?: string;
  point: Point;
}

/**
 * 由使用方（designer）实现：负责"往哪个容器里放、要不要下钻"这类业务规则。
 * 拖拽引擎自己不做树遍历，只做指针与几何。
 */
export interface DropContext {
  resolve(point: Point, payload: DragPayload): DropTarget | null;
  canAccept(payload: DragPayload, containerId: string): boolean;
}

export type DragState = 'idle' | 'pending' | 'dragging' | 'dropping';

export interface DragManagerOptions {
  /** 画布根元素，命中测试不会越过它 */
  root: () => HTMLElement;
  context: DropContext;
  /** 起拖阈值（px），默认 4 */
  threshold?: number;
  /** 是否绘制 overlay，默认 true */
  overlay?: boolean;
  /** 自动滚动发生后立刻回调，用于同步失效矩形缓存（比等 scroll 事件快一帧） */
  onScroll?: () => void;
}

export interface DragEventMap {
  dragstart: { payload: DragPayload; point: Point };
  drag: { payload: DragPayload; target: DropTarget | null; point: Point };
  dragend: { payload: DragPayload; target: DropTarget | null };
  cancel: { payload: DragPayload };
}

export interface DragManager {
  start(payload: DragPayload, event: PointerEvent): void;
  cancel(): void;
  on<E extends keyof DragEventMap>(
    name: E,
    listener: (event: DragEventMap[E]) => void,
  ): () => void;
  readonly state: DragState;
  dispose(): void;
}

/** Locator 的入参：全部是纯数据，无 DOM */
export interface LocateInput {
  point: Point;
  container: Rect;
  /** 有序子节点矩形。调用方负责剔除正在拖拽的节点 */
  children: Rect[];
  axis?: 'x' | 'y' | 'auto';
  /** 边缘吸附阈值，默认 8 */
  edgeThreshold?: number;
}

export interface LocateResult {
  index: number;
  position: DropPosition;
  axis: 'x' | 'y';
  /** 指示线矩形（屏幕坐标） */
  rect: Rect;
  /** 容器高亮矩形 */
  containerRect: Rect;
}
