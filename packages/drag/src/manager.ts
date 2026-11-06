import { AutoScroller, findScrollableAncestors } from './auto-scroll';
import { Overlay } from './overlay';
import type {
  DragEventMap,
  DragManager,
  DragManagerOptions,
  DragPayload,
  DragState,
  DropTarget,
  Point,
} from './types';

type Listener<E extends keyof DragEventMap> = (event: DragEventMap[E]) => void;

const DEFAULT_THRESHOLD = 4;

/**
 * 指针状态机（DESIGN-v1 §6.2 / D10）。
 *
 * idle → pending → dragging → dropping → idle
 * - 4px 阈值：避免点击误触
 * - 监听挂在 document 的捕获阶段：防止组件内部 stopPropagation 吃掉事件
 * - pointercancel / blur / visibilitychange 三重兜底：防止指针丢失卡在 dragging
 * - rAF 合帧：一帧最多算一次几何
 */
class DragManagerImpl implements DragManager {
  private currentState: DragState = 'idle';
  private payload: DragPayload | null = null;
  private origin: Point = { x: 0, y: 0 };
  private pendingPoint: Point | null = null;
  private lastPoint: Point = { x: 0, y: 0 };
  private target: DropTarget | null = null;
  private raf = 0;
  private sourceElement: Element | null = null;
  private overlay: Overlay | null = null;
  private readonly threshold: number;
  private readonly listeners = new Map<string, Set<(event: never) => void>>();
  private readonly autoScroller = new AutoScroller();
  private scrollTargets: HTMLElement[] = [];
  private previousUserSelect = '';
  private previousCursor = '';
  /**
   * 拖拽事件挂在哪些文档上。
   *
   * 画布在 iframe 里之后，指针事件被 frame 边界截住：起点可能在宿主文档
   * （从物料面板起拖），move/up 却发生在画布文档里 —— 只监听一个文档，
   * 另一侧的事件就全丢了。这里的策略是**两侧都挂**：指针在哪个文档里，
   * 哪边的事件就会来，坐标天然是那边的视口坐标，与落点几何（同样在画布
   * 文档里量的矩形）自洽；指针在宿主侧时 resolve 会因 containsPoint
   * 不命中而返回 null，语义正好是"还没拖进画布"。
   */
  private docs: Set<Document> = new Set();
  private views: Set<Window> = new Set();

  constructor(private readonly options: DragManagerOptions) {
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
  }

  get state(): DragState {
    return this.currentState;
  }

  on<E extends keyof DragEventMap>(name: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener as (event: never) => void);
    return () => {
      set.delete(listener as (event: never) => void);
    };
  }

  start(payload: DragPayload, event: PointerEvent): void {
    if (this.currentState !== 'idle') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const rootElement = this.options.root();
    // 事件可能来自任何一个文档：起拖事件的文档（物料面板 = 宿主，画布节点 = iframe）
    // + 画布文档 + 主文档兜底。去重后全部挂上。
    const docs = new Set<Document>();
    if (typeof document !== 'undefined') docs.add(document);
    // 用鸭子类型而不是 instanceof：事件 target 可能来自 iframe 的 realm，
    // 那边的 Element / Document 和宿主的不是同一个构造函数
    const eventTarget = event.target as Element | Document | null;
    const eventDoc = eventTarget
      ? 'querySelector' in eventTarget
        ? (eventTarget as Element).ownerDocument
        : (eventTarget as Document)
      : null;
    if (eventDoc) docs.add(eventDoc);
    if (rootElement && rootElement !== globalThis.document.body) {
      docs.add(rootElement.ownerDocument);
    }
    this.docs = docs;
    this.views = new Set([...docs].map((doc) => doc.defaultView).filter(Boolean) as Window[]);

    this.payload = payload;
    this.origin = { x: event.clientX, y: event.clientY };
    this.lastPoint = this.origin;
    this.pendingPoint = null;
    this.target = null;
    this.currentState = 'pending';

    const target = event.target as Element | null;
    this.sourceElement =
      target && typeof target.closest === 'function'
        ? target.closest('[data-node-id]')
        : null;

    // 从画布根向上找滚动容器，而不是从 sourceElement。
    // 从物料面板拖入时 sourceElement 是面板里的 li，向上根本走不到画布，
    // 自动滚动会静默失效。
    this.scrollTargets = rootElement
      ? findScrollableAncestors(rootElement, rootElement.ownerDocument)
      : [];

    for (const doc of this.docs) {
      doc.addEventListener('pointermove', this.handlePointerMove, true);
      doc.addEventListener('pointerup', this.handlePointerUp, true);
      doc.addEventListener('pointercancel', this.handlePointerCancel, true);
      doc.addEventListener('keydown', this.handleKeyDown, true);
      doc.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    for (const view of this.views) {
      view.addEventListener('blur', this.handleInterrupted);
    }
  }

  cancel(): void {
    if (this.currentState === 'idle') return;
    const payload = this.payload;
    this.finish();
    if (payload) this.emit('cancel', { payload });
  }

  dispose(): void {
    this.finish();
    this.listeners.clear();
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.payload) return;

    if (this.currentState === 'pending') {
      const distance = Math.hypot(
        event.clientX - this.origin.x,
        event.clientY - this.origin.y,
      );
      if (distance < this.threshold) return;
      this.beginDrag({ x: event.clientX, y: event.clientY });
    }

    event.preventDefault();
    this.lastPoint = { x: event.clientX, y: event.clientY };
    this.pendingPoint = this.lastPoint;
  };

  private handlePointerUp = (): void => {
    if (!this.payload) return;

    if (this.currentState === 'pending') {
      // 没超过阈值：当成点击，不产生拖拽语义
      this.finish();
      return;
    }

    if (this.currentState === 'dragging') {
      // 用最后一次坐标补齐，避免松手瞬间的落点还停在上一帧
      this.pendingPoint = null;
      this.update(this.lastPoint);
      this.currentState = 'dropping';

      const payload = this.payload;
      const target = this.target;
      this.finish();
      if (payload) this.emit('dragend', { payload, target });
    }
  };

  private handlePointerCancel = (): void => {
    this.cancel();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  };

  private handleInterrupted = (): void => {
    // 点击进入 iframe 时，pointerdown 的默认行为把焦点转移给子 frame，
    // **宿主 window 会收到 blur**（合法的窗口级失焦，不是真的被夺走）。
    // 任一参与文档仍持有焦点就继续拖；真正切走窗口 / 切 tab 时
    // 所有文档同时失焦，这里才会落到 cancel（visibilitychange 再兜一层底）。
    for (const doc of this.docs) {
      if (doc.hasFocus()) return;
    }
    this.cancel();
  };

  private handleVisibilityChange = (): void => {
    for (const doc of this.docs) {
      if (doc.visibilityState === 'hidden') {
        this.cancel();
        return;
      }
    }
  };

  private beginDrag(point: Point): void {
    if (!this.payload) return;
    this.currentState = 'dragging';
    this.lockPageInteraction();

    if (this.options.overlay !== false) {
      // ghost / 指示线画在画布文档里：落点几何都在这边量，坐标系才一致。
      // 从物料面板起拖时 ghost 要等指针进入 iframe 才可见 —— 可接受的取舍。
      this.overlay = new Overlay(this.options.root()?.ownerDocument ?? document);
      this.overlay.setGhost(this.payload, this.sourceElement, point);
    }

    this.emit('dragstart', { payload: this.payload, point });
    this.update(point);

    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    let point = this.pendingPoint;
    this.pendingPoint = null;

    // 没有新坐标也要推进：自动滚动依赖这一帧
    if (this.currentState === 'dragging' && this.scrollTargets.length > 0) {
      if (this.autoScroller.update(this.lastPoint, this.scrollTargets)) {
        this.options.onScroll?.();
        point = this.lastPoint;
      }
    }

    if (point) this.update(point);

    if (this.currentState === 'dragging') {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
    }
  };

  private update(point: Point): void {
    if (!this.payload) return;

    const target = this.options.context.resolve(point, this.payload);
    this.target = target;

    this.overlay?.update(target);
    this.overlay?.moveGhost(point);

    this.emit('drag', { payload: this.payload, target, point });
  }

  private finish(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    for (const doc of this.docs) {
      doc.removeEventListener('pointermove', this.handlePointerMove, true);
      doc.removeEventListener('pointerup', this.handlePointerUp, true);
      doc.removeEventListener('pointercancel', this.handlePointerCancel, true);
      doc.removeEventListener('keydown', this.handleKeyDown, true);
      doc.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    for (const view of this.views) {
      view.removeEventListener('blur', this.handleInterrupted);
    }
    this.docs = new Set();
    this.views = new Set();

    this.overlay?.dispose();
    this.overlay = null;
    this.unlockPageInteraction();

    this.currentState = 'idle';
    this.payload = null;
    this.pendingPoint = null;
    this.target = null;
    this.sourceElement = null;
    this.scrollTargets = [];
  }

  private lockPageInteraction(): void {
    for (const doc of this.docs) {
      const body = doc.body;
      if (!body) continue;
      this.previousUserSelect += `${body.style.userSelect}\u0000`;
      this.previousCursor += `${body.style.cursor}\u0000`;
      body.style.userSelect = 'none';
      body.style.cursor = 'grabbing';
    }
  }

  private unlockPageInteraction(): void {
    const selects = this.previousUserSelect.split('\u0000');
    const cursors = this.previousCursor.split('\u0000');
    [...this.docs].forEach((doc, index) => {
      const body = doc.body;
      if (!body) return;
      body.style.userSelect = selects[index] ?? '';
      body.style.cursor = cursors[index] ?? '';
    });
    this.previousUserSelect = '';
    this.previousCursor = '';
  }

  private emit<E extends keyof DragEventMap>(name: E, event: DragEventMap[E]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of set) {
      (listener as unknown as (payload: DragEventMap[E]) => void)(event);
    }
  }
}

export function createDragManager(options: DragManagerOptions): DragManager {
  return new DragManagerImpl(options);
}
