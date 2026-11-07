import { createDragManager, RectCache } from '@lowcode-next/drag';
import type { DragManager } from '@lowcode-next/drag';
import { History, InsertNode, MoveNode, RemoveNode } from '@lowcode-next/model';
import type { Command, DocumentImpl } from '@lowcode-next/model';
import type { DataSourceConfig, PageSchema } from '@lowcode-next/protocol';
import { nodeAt, revealNode } from './dom';
import { createDesignerDropContext } from './drop-context';
import { defaultInsertTemplate } from './materials';
import type { MaterialLookup } from './materials';

/**
 * 设计器会话（DESIGN-v1 §12.13.3）：**设计时的唯一状态与写通道**，零框架。
 *
 * 它把原来散在 `Designer.tsx` 里的 `useState` / `useRef` / `useEffect` 搬进一个类：
 * 画布尺寸、历史可用性、拖拽态、左栏页签、数据源编辑、选中/悬停、iframe 桥。
 *
 * 视图层（`designer-react` / `designer-vue`）只做两件事：
 * 1. `subscribe` + `getSnapshot` → 重渲染；
 * 2. 把用户手势翻译成这里的命令。
 *
 * 三条纪律：
 * - **快照引用稳定**：没变化就返回同一个对象，否则 `useSyncExternalStore` 会死循环；
 * - **写操作只有一条通道**：`commit()` → `History.execute()`，别处不许 new Command；
 * - **粒度不变**：仍是整树重渲染（D14），session 不尝试做细粒度订阅。
 */
/* ------------------------------------------------------------------ */
/* 快照                                                                */
/* ------------------------------------------------------------------ */

export type CanvasDevice = 'default' | 'tablet' | 'phone';

/**
 * 画布尺寸档位（照引擎 demo 的 lp-simulator-pane：只有三个设备钮）。
 * 桌面 = 回到进入时的基准宽度；平板 / 手机 = 引擎里 deviceStyle 给的定宽。
 */
export const CANVAS_DEVICES = [
  { key: 'default', label: '桌面', width: null },
  { key: 'tablet', label: '平板 768', width: 768 },
  { key: 'phone', label: '手机 375', width: 375 },
] as const satisfies ReadonlyArray<{
  key: CanvasDevice;
  label: string;
  width: number | null;
}>;

export interface DataSourceEditing {
  draft: DataSourceConfig;
  isNew: boolean;
}

export interface DesignerSnapshot {
  /** 单调递增：任何状态变化都会 +1，视图据此判断"要不要重渲染" */
  revision: number;
  device: CanvasDevice;
  /** 画布的**设计宽度**（"纸张"宽度），不是容器实测宽度 */
  canvasWidth: number | null;
  /** 宽度输入框里还没回车的草稿 */
  canvasDraft: string | null;
  /** iframe 加载完成计数：load 每发生一次 +1 */
  frameReady: number;
  dragging: boolean;
  history: { canUndo: boolean; canRedo: boolean };
  selectable: { selectedId: string | null; hoverId: string | null };
  ui: { leftTab: string; pinned: boolean; paneOpen: boolean };
  dataSourceEditing: DataSourceEditing | null;
}

export interface DesignerSessionOptions {
  document: DocumentImpl;
  /** 物料只用到 `has` / `getMeta`，不绑定具体 registry 实现 */
  materials: MaterialLookup;
  /** 画布 iframe 的内边距（透传给画布入口） */
  canvasPadding?: number;
  onSchemaChange?: (schema: PageSchema) => void;
  /**
   * 保存出口（宿主注入）。core 不知道存储 —— 写 localStorage、落库、下载
   * 都是宿主的事；没传时 `save()` 静默 no-op。
   */
  onSave?: (schema: PageSchema) => void;
  /** 左栏「钉住」偏好的存储；默认 localStorage，测试可注入内存实现 */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** 画布入口页；默认相对当前 location 的 `canvas.html`。`portal` 模式忽略 */
  canvasUrl?: string;
  /**
   * 画布装载方式（§12.13.13）。
   *
   * - `frame`（默认）：iframe 指向独立入口页，schema 经 `postMessage` 推入。
   *   画布代码在自己的 document 里执行，跨 frame 传不了函数，所以必须有入口模块。
   * - `portal`：iframe 文档由宿主现场写出，画布内容用 React Portal 投进去，
   *   与编辑器**同一棵树** —— 用户组件、Context、样式全部直接可用。
   *   此时不推消息、不听握手，改由 `markCanvasReady()` 通知首帧就绪。
   */
  canvasMode?: 'frame' | 'portal';
}

const PIN_KEY = 'lowcode-next:left-fixed';

/* ------------------------------------------------------------------ */

export class DesignerSession {
  private readonly doc: DocumentImpl;
  private readonly materials: MaterialLookup;
  private readonly history: History;
  private readonly rects = new RectCache();

  private padding: number;
  private onSchemaChange?: (schema: PageSchema) => void;
  private onSave?: (schema: PageSchema) => void;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private readonly canvasUrl: string;
  private readonly canvasMode: 'frame' | 'portal';

  /* --- 状态 --- */
  private device: CanvasDevice = 'default';
  private canvasWidth: number | null = null;
  private canvasDraft: string | null = null;
  private frameReady = 0;
  private dragging = false;
  private historyState = { canUndo: false, canRedo: false };
  private leftTab = 'tree';
  private pinned: boolean;
  private paneOpen = false;
  private dataSourceEditing: DataSourceEditing | null = null;
  private revision = 0;
  private snapshot: DesignerSnapshot;

  /* --- DOM 生命周期 --- */
  private frame: HTMLIFrameElement | null = null;
  private frameCleanup: (() => void) | null = null;
  private frameLoadHandler: (() => void) | null = null;
  private drag: DragManager | null = null;
  private disposers: Array<() => void> = [];
  private started = false;
  /** 进入设计器时锁定的画布宽度：桌面档（恢复基准）的复位值 */
  private baseWidth: number | null = null;
  /** 画布内点选时不要触发"选中即滚进视野" */
  private skipReveal = false;
  /** `dragging` 的镜像：iframe 桥接的指针处理器要读它，又不能为之重挂监听 */
  private draggingFlag = false;

  private readonly listeners = new Set<() => void>();

  constructor(options: DesignerSessionOptions) {
    this.doc = options.document;
    this.materials = options.materials;
    this.history = new History(options.document);
    this.padding = options.canvasPadding ?? 20;
    this.onSchemaChange = options.onSchemaChange;
    this.onSave = options.onSave;
    this.storage = options.storage === undefined ? safeLocalStorage() : options.storage;
    this.canvasUrl =
      options.canvasUrl ?? new URL('canvas.html', globalThis.location.href).toString();
    this.canvasMode = options.canvasMode ?? 'frame';
    this.pinned = this.readPinned();
    this.snapshot = this.buildSnapshot();
  }

  /* ---------------------------------------------------------------- */
  /* 订阅                                                              */
  /* ---------------------------------------------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DesignerSnapshot => this.snapshot;

  /** 宿主在每次渲染后同步最新 props（避免闭包捕获旧的 `onSchemaChange`） */
  update(options: {
    canvasPadding?: number;
    onSchemaChange?: (schema: PageSchema) => void;
    onSave?: (schema: PageSchema) => void;
  }): void {
    if (options.canvasPadding !== undefined && options.canvasPadding !== this.padding) {
      this.padding = options.canvasPadding;
      this.postSchema();
    }
    if ('onSchemaChange' in options) this.onSchemaChange = options.onSchemaChange;
    if ('onSave' in options) this.onSave = options.onSave;
  }

  /* ---------------------------------------------------------------- */
  /* 生命周期                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * 挂上全局副作用：文档订阅、历史订阅、选区跟随、滚动失效、快捷键、拖拽引擎。
   *
   * 与构造函数分开，是为了让 `new DesignerSession()` 保持纯状态（可以在 render
   * 期间安全创建），副作用统一在 mount 之后发生 —— Vue 的 `onMounted` 同理。
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // 文档或选区变化 → 整树重渲染（v1 明确不做细粒度，见 D14）
    this.disposers.push(this.doc.subscribe(() => this.emit()));
    this.disposers.push(this.doc.selection.subscribe(() => this.emit()));

    const syncHistory = () => {
      this.historyState = { canUndo: this.history.canUndo, canRedo: this.history.canRedo };
      this.emit();
    };
    this.disposers.push(this.history.subscribe(syncHistory));

    this.disposers.push(this.watchSelectionScroll());

    // 滚动 / 缩放会让矩形缓存失真（§6.3 D11）
    const invalidate = () => this.rects.invalidate();
    globalThis.document.addEventListener('scroll', invalidate, true);
    globalThis.window?.addEventListener('resize', invalidate);
    this.disposers.push(() => {
      globalThis.document.removeEventListener('scroll', invalidate, true);
      globalThis.window?.removeEventListener('resize', invalidate);
    });

    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    globalThis.document.addEventListener('keydown', onKeyDown);
    this.disposers.push(() => globalThis.document.removeEventListener('keydown', onKeyDown));

    /**
     * 画布就绪握手（独立入口页在 effect 里发 `lc:canvas-ready`）。
     *
     * 只有这一半是**必须**的：iframe 的 `load` 早于画布组件的 effect 时，
     * `bindFrame()` 里那次 `postSchema()` 打在空地上（画布还没注册 message 监听），
     * 表现就是"打开编辑器，画布一片空白，点一下属性面板才出来"。
     * 收到握手补发一次，首屏才稳定 —— 与框架无关，两版都走这条路径。
     *
     * `portal` 模式没有独立入口页，也就没有这条消息，见 `markCanvasReady()`。
     */
    if (this.canvasMode === 'frame') {
      const onCanvasReady = (event: MessageEvent) => {
        if (!this.frame) return;
        // 只认同源消息：`event.source` 在跨 frame 时是另一种 proxy，拿它和
        // `contentWindow` 做 `===` 在部分环境下不成立（headless 实测过），
        // 而 `postSchema()` 是幂等的全量推送，多收一条无副作用。
        if (event.origin !== globalThis.location.origin) return;
        if ((event.data as { type?: string } | null)?.type !== 'lc:canvas-ready') return;
        this.postSchema();
      };
      globalThis.addEventListener('message', onCanvasReady);
      this.disposers.push(() => globalThis.removeEventListener('message', onCanvasReady));
    }

    this.disposers.push(this.createDrag());
    syncHistory();
  }

  attachFrame(frame: HTMLIFrameElement): void {
    this.frame = frame;
    this.frameLoadHandler = () => this.handleFrameLoad();
    frame.addEventListener('load', this.frameLoadHandler);
    // 同源且已经加载完（刷新 / 热更新后 src 命中缓存）时 load 不会再来一次
    if (frame.contentDocument?.readyState === 'complete') this.handleFrameLoad();
  }

  /**
   * `portal` 模式：画布内容已经渲染进 iframe 文档。
   *
   * 独立入口页靠 iframe 的 `load` 事件通知「画布 DOM 就绪」，而 portal 的内容
   * 是 React commit 之后才出现的 —— 那时 iframe 的 load 早就发过了，`getCanvas()`
   * 还是 null，宽度量不到、iframe 桥也挂不上。所以由宿主在画布首帧后显式调一次。
   *
   * 幂等：`measureBaseWidth` 只在 `baseWidth === null` 时生效，重复调用只是
   * 重挂一次 iframe 桥（`bindFrame` 开头会先清旧的），不会累积监听。
   */
  markCanvasReady(): void {
    this.handleFrameLoad();
  }

  detachFrame(): void {
    if (this.frame && this.frameLoadHandler) {
      this.frame.removeEventListener('load', this.frameLoadHandler);
    }
    this.frameLoadHandler = null;
    this.frameCleanup?.();
    this.frameCleanup = null;
    this.frame = null;
  }

  /**
   * 释放全部副作用，**可重入**：StrictMode 下 mount → unmount → mount 会走
   * dispose 又 start 一次，同一个实例必须能重新跑起来。这里只清副作用与订阅，
   * 不清业务状态（设备档、选中、历史都在，重挂后界面不会跳）。
   */
  dispose(): void {
    this.started = false;
    this.detachFrame();
    this.drag?.dispose();
    this.drag = null;
    for (const off of this.disposers.splice(0)) off();
    // 订阅者（视图）的生死由视图自己管：React / Vue 在卸载时各自退订，
    // 这里清空会把 StrictMode 的「重挂」路径变成"订阅丢了但组件还在"
  }

  /* ---------------------------------------------------------------- */
  /* 查询                                                              */
  /* ---------------------------------------------------------------- */

  getCanvas = (): HTMLElement | null => {
    // 画布根在 iframe 文档里（canvas 入口渲染的 [data-lc-canvas]）。
    // 同源 frame：直接查它的文档，观察者 / 矩形读取都不需要消息通道。
    return (
      this.frame?.contentDocument?.querySelector<HTMLElement>('[data-lc-canvas]') ?? null
    );
  };

  getFrame = (): HTMLIFrameElement | null => this.frame;

  get canvasSource(): string {
    return this.canvasUrl;
  }

  /* ---------------------------------------------------------------- */
  /* 写通道                                                            */
  /* ---------------------------------------------------------------- */

  /** 唯一写通道：只有这里进历史栈 */
  commit(command: Command): void {
    this.history.execute(command);
    this.onSchemaChange?.(this.doc.toSchema());
  }

  undo(): void {
    if (!this.history.undo()) return;
    this.ensureSelection();
    this.onSchemaChange?.(this.doc.toSchema());
  }

  redo(): void {
    if (!this.history.redo()) return;
    this.ensureSelection();
    this.onSchemaChange?.(this.doc.toSchema());
  }

  /**
   * 保存：core 只负责「把当前 schema 交出去」，存到哪是宿主的事（对齐引擎：
   * 编辑器核心不知道存储，demo/插件层决定写 localStorage）。
   * 宿主没传 `onSave` 就静默 no-op；Ctrl+S 与保存按钮共用这一个出口。
   */
  save(): void {
    const schema = this.doc.toSchema();
    this.onSave?.(schema);
    this.onSchemaChange?.(schema);
  }
  /* ---------------------------------------------------------------- */
  /* 选中 / 视口                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * 选中但不触发"滚进视野"。
   *
   * 用在指针本来就点在节点上的场合（画布点选、拖放落点）：那里的节点必然看得见，
   * 再把它滚到视口顶部只会让画面莫名一跳。大纲里点行、层级面板跳级仍然会滚。
   */
  selectQuietly(id: string | null): void {
    this.skipReveal = true;
    try {
      this.doc.selection.select(id);
    } finally {
      this.skipReveal = false;
    }
  }

  select(id: string | null, options: { reveal?: boolean } = {}): void {
    if (options.reveal === false) {
      this.selectQuietly(id);
      return;
    }
    this.doc.selection.select(id);
  }

  hover(id: string | null): void {
    this.doc.selection.hover(id);
  }

  /**
   * Delete / Backspace：删掉选中节点并把选区落到父级。
   * 返回是否真的删了 —— 调用方据此决定要不要 `preventDefault()`，
   * 否则在根节点 / 锁定节点上按 Delete 会莫名其妙吃掉浏览器的默认行为。
   */
  removeSelected(): boolean {
    const selectedId = this.doc.selection.selectedId;
    if (!selectedId || selectedId === this.doc.root.id) return false;

    const node = this.doc.getNode(selectedId);
    if (!node || node.locked) return false;

    const parentId = node.parent?.id ?? this.doc.root.id;
    this.commit(new RemoveNode(selectedId));
    this.doc.selection.select(parentId);
    return true;
  }

  /** 把某个节点滚进画布视野（**不做平滑滚动**，理由见 §7.4.1） */
  locate(nodeId: string): void {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const element = canvas.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
    element?.scrollIntoView({ block: 'center' });
  }

  /* ---------------------------------------------------------------- */
  /* 画布尺寸                                                          */
  /* ---------------------------------------------------------------- */

  setDevice(key: CanvasDevice): void {
    this.device = key;
    const preset = CANVAS_DEVICES.find((item) => item.key === key);
    // 桌面档（width=null）回到进入时的基准宽度；其余档位是定宽
    this.canvasWidth = preset?.width ?? this.baseWidth;
    this.canvasDraft = null;
    this.emit();
  }

  setCanvasDraft(value: string | null): void {
    if (this.canvasDraft === value) return;
    this.canvasDraft = value;
    this.emit();
  }

  /** 回车提交：越界 / 非法直接弹回实测值（引擎的 onPressEnter 语义） */
  commitCanvasDraft(): void {
    const raw = this.canvasDraft;
    const parsed = Math.round(Number(raw));
    if (raw !== null && raw !== '' && Number.isFinite(parsed)) {
      this.canvasWidth = Math.min(3840, Math.max(320, parsed));
    }
    this.canvasDraft = null;
    this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* 左栏 / 数据源                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * 这一组写成**箭头类字段**而不是原型方法：视图层会把它们裸传当回调
   * （`onTogglePin={session.togglePin}`），普通函数经 React onClick 调用时
   * `this` 是 undefined（严格模式），按下就抛 TypeError —— 表现就是
   * "固定 / 关闭按钮完全没反应"。与上面 `subscribe` / `getSnapshot` 同款。
   */
  setLeftTab = (tab: string): void => {
    this.leftTab = tab;
    this.dataSourceEditing = null;
    this.paneOpen = true;
    this.emit();
  };

  /**
   * 点图标栏：点当前这个 = 收起，点别的 = 切过去并打开 —— 照 lowcode 的 PanelDock，
   * 浮层面板靠图标栏开合，不靠"点画布"，否则点一下画布面板就没了。
   */
  toggleLeftTab = (tab: string): void => {
    if (tab === this.leftTab && this.paneOpen) {
      this.closePane();
      return;
    }
    this.setLeftTab(tab);
  };

  setPaneOpen = (open: boolean): void => {
    if (this.paneOpen === open) return;
    this.paneOpen = open;
    if (!open) this.dataSourceEditing = null;
    this.emit();
  };

  togglePin = (): void => {
    this.pinned = !this.pinned;
    this.writePinned(this.pinned);
    // 切装载方式意味着"我要用这个面板"，顺手把它打开
    this.paneOpen = true;
    this.emit();
  };

  closePane = (): void => {
    this.paneOpen = false;
    // 面板都收起来了，从它里面打开的编辑表单也一并收掉 —— 否则画布上会留一块
    // 没有来源的白板
    this.dataSourceEditing = null;
    this.emit();
  };

  editDataSource(draft: DataSourceConfig, isNew: boolean): void {
    this.dataSourceEditing = { draft, isNew };
    this.emit();
  }

  closeDataSourceEditor(): void {
    if (!this.dataSourceEditing) return;
    this.dataSourceEditing = null;
    this.emit();
  }

  /** 数据源表单确认：同 id 覆盖，否则追加（`setDataSource` 不进历史，对齐现状） */
  applyDataSource(next: DataSourceConfig): void {
    const draft = this.dataSourceEditing?.draft;
    const list = [...this.doc.dataSource];
    const index = draft ? list.findIndex((item) => item.id === draft.id) : -1;
    if (index >= 0) list[index] = next;
    else list.push(next);
    this.doc.setDataSource(list);
    this.dataSourceEditing = null;
    this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* 指针 / 键盘（iframe 桥由 attachFrame 挂）                          */
  /* ---------------------------------------------------------------- */

  handleCanvasPointerOver = (event: PointerEvent): void => {
    if (this.draggingFlag) return;
    const canvas = this.getCanvas();
    if (!canvas) return;
    const hit = nodeAt({ x: event.clientX, y: event.clientY }, canvas);
    this.doc.selection.hover(hit ? hit.id : null);
  };

  handleCanvasPointerDown = (event: PointerEvent): void => {
    const canvas = this.getCanvas();
    if (!canvas) return;

    const hit = nodeAt({ x: event.clientX, y: event.clientY }, canvas);
    if (!hit) {
      this.doc.selection.select(null);
      return;
    }

    const node = this.doc.getNode(hit.id);
    if (!node) return;

    // 点画布：节点就在指针下面，不要再把它滚到视口顶部
    this.selectQuietly(node.id);

    // 根节点和锁定节点不允许拖动
    if (node.id === this.doc.root.id || node.locked) return;

    this.drag?.start({ type: 'node', ids: [node.id], source: 'canvas' }, event);
  };

  handleCanvasPointerOut = (event: PointerEvent): void => {
    // 指针离开 iframe：relatedTarget 跨不过 frame 边界（必为 null），
    // 对齐原来 canvasRoot 的 onPointerLeave —— 画布外不保留悬停框
    if (event.relatedTarget) return;
    this.doc.selection.hover(null);
  };

  /**
   * 快捷键：Delete 删除、Ctrl/Cmd+Z 撤销、加 Shift 重做、Ctrl/Cmd+S 保存。
   * 宿主文档和画布（iframe）文档**都要挂** —— 焦点在画布里时键盘事件只进 iframe。
   */
  handleKeyDown = (event: KeyboardEvent): void => {
    // 正在输入时不劫持：否则在属性面板里按退格会删节点
    if (isEditable(event.target)) return;

    const meta = event.metaKey || event.ctrlKey;

    if (meta && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (meta && (event.key === 'y' || event.key === 'Y')) {
      event.preventDefault();
      this.redo();
      return;
    }
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.save();
      return;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (this.removeSelected()) event.preventDefault();
  };

  /** 物料面板起拖（React / Vue 两版共用） */
  startMaterialDrag(componentName: string, event: PointerEvent): void {
    this.drag?.start({ type: 'material', componentName }, event);
  }

  /* ---------------------------------------------------------------- */
  /* 内部                                                              */
  /* ---------------------------------------------------------------- */

  private createDrag(): () => void {
    const dropContext = createDesignerDropContext({
      root: () => this.getCanvas(),
      document: this.doc,
      registry: this.materials,
      rects: this.rects,
    });

    const manager = createDragManager({
      // 画布未就绪时兜底回主文档：DragManager 会把监听同时挂到
      // 起拖事件的文档和画布文档上（跨 frame 拖拽两侧都要收事件）
      root: () => this.getCanvas() ?? globalThis.document.body,
      context: dropContext,
      threshold: 4,
      // 自动滚动后立刻失效缓存，否则本帧仍按滚动前的坐标算落点
      onScroll: () => this.rects.invalidate(),
    });
    this.drag = manager;

    const offStart = manager.on('dragstart', () => {
      const canvas = this.getCanvas();
      if (canvas) this.rects.prime(canvas);
      this.setDragging(true);
    });

    const offEnd = manager.on('dragend', ({ payload, target }) => {
      this.setDragging(false);
      if (!target || !target.valid) return;

      if (payload.type === 'material') {
        const meta = this.materials.getMeta(payload.componentName);
        const template = defaultInsertTemplate(meta, payload.componentName);
        const command = new InsertNode(target.containerId, target.index, template);
        this.commit(command);
        this.selectQuietly(command.nodeId);
      } else {
        const [nodeId] = payload.ids;
        if (!nodeId) return;
        this.commit(
          new MoveNode(nodeId, {
            containerId: target.containerId,
            index: target.index,
          }),
        );
        this.selectQuietly(nodeId);
      }
    });

    // Esc / pointercancel / 窗口失焦都会走 cancel，没有这一条会一直藏着工具条
    const offCancel = manager.on('cancel', () => this.setDragging(false));

    return () => {
      offStart();
      offEnd();
      offCancel();
      manager.dispose();
      if (this.drag === manager) this.drag = null;
    };
  }

  private setDragging(value: boolean): void {
    this.draggingFlag = value;
    if (this.dragging === value) return;
    this.dragging = value;
    this.emit();
  }

  /**
   * 选中变化 → 把节点滚进画布视野（引擎 `activeTracker.onChange → scrollToNode`）。
   *
   * 放在**订阅回调**里而不是渲染之后：回调是同步的，此时 DOM 还是上一帧的，
   * 先滚动、再让这次渲染去测量，框和工具条一次就画在对的位置，不会先错一帧再纠正。
   */
  private watchSelectionScroll(): () => void {
    let last = this.doc.selection.selectedId;

    return this.doc.selection.subscribe(() => {
      const id = this.doc.selection.selectedId;
      if (!id || id === last) return;
      last = id;

      // 选中是一次"确认"动作，hover 到此为止：不清的话，从层级面板 / 大纲 /
      // 面包屑点选后那条虚线框会停在原来的节点上，和新的选中框同时存在。
      if (this.doc.selection.hoverId) this.doc.selection.hover(null);

      if (this.skipReveal) return;
      this.reveal(id);
    });
  }

  /**
   * 滚到位。元素可能还没挂上：拖入物料时 `select()` 发生在提交那一刻，
   * 视图还没渲染出新节点。等一帧再试 —— 这一帧里框本来就在视口外，
   * 补上滚动不会有任何可感知的跳动。
   */
  private reveal(id: string, retry = 1): void {
    const element = this.getCanvas()?.querySelector<HTMLElement>(
      `[data-node-id="${CSS.escape(id)}"]`,
    );
    if (element) {
      revealNode(element);
      return;
    }
    if (retry > 0) requestAnimationFrame(() => this.reveal(id, retry - 1));
  }

  private handleFrameLoad(): void {
    this.frameReady += 1;
    this.measureBaseWidth();
    this.bindFrame();
    this.emit();
  }

  /**
   * 挂载后量一次可用宽度锁成设计宽度。此刻画布还是流式，测得的就是可用宽度；
   * 赋值后除首帧外不产生任何视觉变化。
   */
  private measureBaseWidth(): void {
    if (this.baseWidth !== null) return;
    const el = this.getCanvas();
    if (!el) return;
    const width = Math.max(320, Math.round(el.getBoundingClientRect().width));
    this.baseWidth = width;
    this.canvasWidth = width;
  }

  /**
   * iframe 画布桥接（DESIGN-v1 §7.3）：
   * - **schema 同步走 postMessage**：文档任何变化全量推给画布入口；
   * - **事件走同源直挂**：合成事件到不了 frame 里，直接挂在 iframe 文档上。
   */
  private bindFrame(): void {
    this.frameCleanup?.();
    this.frameCleanup = null;

    const frameDoc = this.frame?.contentDocument;
    if (!frameDoc) return;

    const pointerDown = (event: PointerEvent) => this.handleCanvasPointerDown(event);
    const pointerOver = (event: PointerEvent) => this.handleCanvasPointerOver(event);
    const pointerOut = (event: PointerEvent) => this.handleCanvasPointerOut(event);
    const keyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    const invalidate = () => this.rects.invalidate();

    frameDoc.addEventListener('pointerdown', pointerDown);
    frameDoc.addEventListener('pointerover', pointerOver);
    frameDoc.addEventListener('pointerout', pointerOut);
    frameDoc.addEventListener('keydown', keyDown);
    frameDoc.addEventListener('scroll', invalidate, true);

    this.postSchema();
    const offDoc = this.doc.subscribe(() => this.postSchema());

    /**
     * 首屏补发（**不要删**）。
     *
     * `load` 只保证 iframe 的文档加载完，不保证画布组件的 `message` 监听已经挂上：
     * 画布那份应用往往比宿主小、先把模块跑完，而宿主的 `start()` 还排在首屏
     * effect 里 —— 这一次 `postSchema()` 就打在空地上，表现是「打开编辑器画布一片
     * 空白，点一下节点才出来」。画布侧发的 `lc:canvas-ready` 是首选握手，但它的
     * 时序同样可能早于宿主监听，所以这里按 DOM 结果补发：**画布真的渲染出
     * `[data-node-id]` 就停**，最多 6 次（约 720ms）。
     */
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    const retry = () => {
      retryTimer = null;
      if (tries >= 6) return;
      tries += 1;
      if (this.frame?.contentDocument?.querySelector('[data-node-id]')) return;
      this.postSchema();
      retryTimer = globalThis.setTimeout(retry, 120);
    };
    retryTimer = globalThis.setTimeout(retry, 120);

    this.frameCleanup = () => {
      if (retryTimer) globalThis.clearTimeout(retryTimer);
      retryTimer = null;
      frameDoc.removeEventListener('pointerdown', pointerDown);
      frameDoc.removeEventListener('pointerover', pointerOver);
      frameDoc.removeEventListener('pointerout', pointerOut);
      frameDoc.removeEventListener('keydown', keyDown);
      frameDoc.removeEventListener('scroll', invalidate, true);
      offDoc();
    };
  }

  private postSchema(): void {
    if (this.canvasMode === 'portal') return;
    const frameWin = this.frame?.contentWindow;
    if (!frameWin) return;
    frameWin.postMessage(
      { type: 'lc:schema', schema: this.doc.toSchema(), padding: this.padding },
      new URL(this.canvasUrl).origin,
    );
  }

  /** 撤销/重做之后选中节点可能已经不存在了，把选区落回根节点 */
  private ensureSelection(): void {
    const id = this.doc.selection.selectedId;
    if (id && !this.doc.getNode(id)) this.doc.selection.select(this.doc.root.id);
  }

  /**
   * 选中 / hover 标记：只写 DOM 属性，不给每个物料加选中态 prop。
   * **视觉不靠它们**（框由 SelectionBorders 那层绝对定位的 div 画），保留是为了
   * 调试、自动化测试，以及"hover 元素同时被选中时只画一个框"的判断。
   * 只在真的变化时才改属性 —— 多余的 setAttribute 会触发 RectCache 的
   * MutationObserver，白白让拖拽前的矩形缓存失效一次。
   */
  private syncMarks(): void {
    const canvas = this.getCanvas();
    if (!canvas) return;

    for (const attr of ['data-selected', 'data-hovered'] as const) {
      const id =
        attr === 'data-selected' ? this.doc.selection.selectedId : this.doc.selection.hoverId;

      for (const el of canvas.querySelectorAll(`[${attr}]`)) {
        if (!id || el.getAttribute('data-node-id') !== id) el.removeAttribute(attr);
      }
      if (!id) continue;

      const target = canvas.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
      if (target && !target.hasAttribute(attr)) target.setAttribute(attr, '');
    }
  }

  private buildSnapshot(): DesignerSnapshot {
    return {
      revision: this.revision,
      device: this.device,
      canvasWidth: this.canvasWidth,
      canvasDraft: this.canvasDraft,
      frameReady: this.frameReady,
      dragging: this.dragging,
      history: this.historyState,
      selectable: {
        selectedId: this.doc.selection.selectedId,
        hoverId: this.doc.selection.hoverId,
      },
      ui: { leftTab: this.leftTab, pinned: this.pinned, paneOpen: this.paneOpen },
      dataSourceEditing: this.dataSourceEditing,
    };
  }

  private emit(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    this.syncMarks();
    for (const listener of [...this.listeners]) listener();
  }

  private readPinned(): boolean {
    try {
      // 默认悬浮 —— lowcode 的大纲面板 `let isInFloatArea = true`，只有点过图钉
      // 存了偏好才会变成占位。新用户看到的第一眼和引擎一致。
      return this.storage?.getItem(PIN_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writePinned(value: boolean): void {
    try {
      this.storage?.setItem(PIN_KEY, value ? '1' : '0');
    } catch {
      /* 隐私模式下写不了，忽略即可 —— 装载方式只是偏好，不该影响编辑 */
    }
  }
}

/* ------------------------------------------------------------------ */

function safeLocalStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isEditable(target: EventTarget | null): boolean {
  // 不能用 instanceof HTMLElement：画布在 iframe 里，那边 realm 的构造函数
  // 和宿主的不是同一个，画布内输入框的按键会被误判
  if (
    !(target instanceof globalThis.HTMLElement) &&
    typeof (target as Element)?.closest !== 'function'
  ) {
    return false;
  }
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
