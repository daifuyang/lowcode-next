import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Monitor, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { createDragManager, RectCache } from '@lowcode-next/drag';
import type { DragManager } from '@lowcode-next/drag';
import { History, InsertNode, MoveNode, RemoveNode } from '@lowcode-next/model';
import type { Command, DocumentImpl } from '@lowcode-next/model';
import type { MaterialRegistry } from '@lowcode-next/renderer';
import type { DataSourceConfig, NodeSchema, PageSchema } from '@lowcode-next/protocol';
import { ActivityRail, DataSourceTabIcon, MaterialTabIcon, OutlineTabIcon } from './ActivityRail';
import { DataSourceForm } from './DataSourceForm';
import { DataSourcePanel } from './DataSourcePanel';
import { DesignerShell } from './DesignerShell';
import { FloatToolbar } from './FloatToolbar';
import { MaterialPanel } from './MaterialPanel';
import { PropertyPanel } from './PropertyPanel';
import { SelectionBorders } from './SelectionBorders';
import { TitleTooltip } from './Tooltip';
import { TreePanel } from './TreePanel';
import { nodeAt, revealNode } from './dom';
import { createDesignerDropContext } from './drop-context';
import styles from './Designer.module.css';

export interface DesignerProps {
  document: DocumentImpl;
  registry: MaterialRegistry;
  /** 右区「预览」回调：宿主自己决定怎么开预览（引擎 demo 是开 preview.html）。缺省按钮置灰 */
  onPreview?: () => void;
  /** 覆盖右栏内容；缺省是内置属性面板 */
  rightPanel?: ReactNode;
  /** 画布内边距，默认 20；做整幅落地页时设 0，让区块自己贴边 */
  canvasPadding?: number;
  onSchemaChange?: (schema: PageSchema) => void;
}

/**
 * 画布尺寸档位（照引擎 demo 的 lp-simulator-pane：只有三个设备钮）。
 * 桌面 = 回到进入时的基准宽度；平板 / 手机 = 引擎里 deviceStyle 给的定宽。
 */
const CANVAS_DEVICES = [
  { key: 'default', label: '桌面', width: null, Icon: Monitor },
  { key: 'tablet', label: '平板 768', width: 768, Icon: Tablet },
  { key: 'phone', label: '手机 375', width: 375, Icon: Smartphone },
] as const;

type CanvasDevice = (typeof CANVAS_DEVICES)[number]['key'];

/**
 * 设计器组装（DESIGN-v1 §7.1）。
 *
 * 三条数据流在这里汇合：
 * - 高频拖拽：pointer → DragManager → DropContext → Overlay，**不碰 React state**
 * - 低频提交：pointerup → Command → History → Document.apply → 整树重渲染（D14）
 * - 选中：pointerdown → Selection → 高亮 + 大纲 + 属性面板 + 路径条
 *
 * 所有写操作统一走 `commit`：只有这一条通道会进历史栈。
 * 面板拿到的也是 commit，所以属性面板的每次修改都可撤销。
 */
export function Designer({
  document: doc,
  registry,
  onPreview,
  rightPanel,
  canvasPadding = 20,
  onSchemaChange,
}: DesignerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragManager | null>(null);
  const rectsRef = useRef<RectCache | null>(null);
  if (!rectsRef.current) rectsRef.current = new RectCache();
  /** 画布内点选时不要触发"选中即滚进视野"—— 鼠标下的节点本来就在眼前，跟着跳反而晕 */
  const skipRevealRef = useRef(false);

  /**
   * 画布尺寸（顶栏中区，对齐引擎 demo 的 SimulatorResizePane）：
   * - `device`：当前档位，只控制哪个图标亮（引擎的 state.active，输入宽度不改变它）
   * - `canvasWidth`：画布的**设计宽度**（"纸张"宽度），不是容器实测宽度 ——
   *   挂载时量一次可用宽度锁定，之后只有用户（输入 / 切档）能改它。
   *   面板开合、窗口缩放**都不改它**：宽度一变整页内容重排（落地页 3 列网格
   *   塌成 2 列、高度骤变几百 px），看起来就是"页面在抖"；宽度不变时左栏
   *   切换只是可视窗口变窄（stage 出横向滚动），内容纹丝不动。引擎把画布
   *   放在 iframe 里隔离这次重排，我们把"纸张不变"写在宿主侧，效果等价。
   * - `draft`：输入框里还没回车的草稿
   */
  const [device, setDevice] = useState<CanvasDevice>('default');
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  /** 进入设计器时锁定的画布宽度：桌面档（恢复基准）的复位值 */
  const baseWidthRef = useRef<number | null>(null);

  const [, forceRender] = useState(0);
  const refresh = useCallback(() => forceRender((value) => value + 1), []);

  const history = useMemo(() => new History(doc), [doc]);

  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });

  // 拖拽期间把浮动工具条藏起来：它是 fixed 层，会挡住 elementFromPoint 的命中。
  // 只在起拖/结束这两个边缘事件上置位，不参与高频路径。
  const [dragging, setDragging] = useState(false);
  /** dragging 的镜像：iframe 桥接的指针处理器要读它，又不能为之重挂监听 */
  const draggingRef = useRef(false);
  const setDraggingSync = useCallback((value: boolean) => {
    draggingRef.current = value;
    setDragging(value);
  }, []);

  const getCanvas = useCallback(() => {
    // 画布根在 iframe 文档里（canvas 入口渲染的 [data-lc-canvas]）。
    // 同源 frame：直接查它的文档，观察者 / 矩形读取都不需要消息通道。
    return frameRef.current?.contentDocument?.querySelector<HTMLElement>('[data-lc-canvas]') ?? null;
  }, []);

  const getFrame = useCallback(() => frameRef.current, []);

  /** iframe 加载完成的计数：load 每发生一次 +1，所有挂进画布文档的 effect 靠它重跑 */
  const [frameReady, setFrameReady] = useState(0);

  // 画布渲染入口（同源的 canvas.html）：schema 经 postMessage 推过去
  const canvasUrl = useMemo(() => new URL('canvas.html', globalThis.location.href).toString(), []);

  // 挂载后量一次可用宽度锁成设计宽度。此刻画布还是流式，测得的就是可用宽度；
  // setCanvasWidth(w) 与流式宽度一致，除首帧外不产生任何视觉变化。
  // iframe 画布：宽度要等画布文档 ready 才量得到（load 后 canvas 根已挂载）。
  useLayoutEffect(() => {
    if (baseWidthRef.current !== null) return;
    const el = getCanvas();
    if (!el) return;
    const width = Math.max(320, Math.round(el.getBoundingClientRect().width));
    baseWidthRef.current = width;
    setCanvasWidth(width);
  }, [frameReady, getCanvas]);

  /**
   * 选中但不触发"滚进视野"。
   *
   * 用在指针本来就点在节点上的场合（画布点选、拖放落点）：那里的节点必然看得见，
   * 再把它滚到视口顶部只会让画面莫名一跳。大纲里点行、层级面板跳级仍然会滚。
   */
  const selectQuietly = useCallback(
    (id: string | null) => {
      skipRevealRef.current = true;
      try {
        doc.selection.select(id);
      } finally {
        skipRevealRef.current = false;
      }
    },
    [doc],
  );

  // 文档或选区变化 → 整树重渲染（v1 明确不做细粒度，见 D14）
  useEffect(() => {
    const offDocument = doc.subscribe(refresh);
    const offSelection = doc.selection.subscribe(refresh);
    return () => {
      offDocument();
      offSelection();
    };
  }, [doc, refresh]);

  useEffect(() => {
    const sync = () => setHistoryState({ canUndo: history.canUndo, canRedo: history.canRedo });
    sync();
    return history.subscribe(sync);
  }, [history]);

  /**
   * 选中变化 → 把节点滚进画布视野（引擎 `activeTracker.onChange → scrollToNode` 的同一件事）。
   *
   * 放在**订阅回调**里而不是 effect 里：回调是同步的，此时 DOM 还是上一帧的，
   * 先滚动、再让这次渲染去测量，框和工具条一次就画在对的位置，不会先错一帧再纠正。
   * 少了这一步，点大纲里视野外的节点只有状态栏变、画布原地不动 —— 看起来就是
   * "点了没选中"（框和工具条都在视口之外）。
   */
  useEffect(() => {
    let last = doc.selection.selectedId;

    /**
     * 滚到位。元素可能还没挂上：拖入物料时 `select()` 发生在提交那一刻，
     * React 还没渲染出新节点。等一帧再试 —— 这一帧里框本来就在视口外，
     * 补上滚动不会有任何可感知的跳动。
     */
    const reveal = (id: string, retry = 1) => {
      const element = getCanvas()?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
      if (element) {
        revealNode(element);
        return;
      }
      if (retry > 0) requestAnimationFrame(() => reveal(id, retry - 1));
    };

    return doc.selection.subscribe(() => {
      const id = doc.selection.selectedId;
      if (!id || id === last) return;
      last = id;

      // 选中是一次"确认"动作，hover 到此为止：不清的话，从层级面板 / 大纲 / 面包屑
      // 点选后那条虚线框会停在原来的节点上，和新的选中框同时存在，看起来像选了两处
      // （选中大区块时尤其明显 —— 区块内残留一小块虚线与淡蓝底）。
      // hover 之后由画布的 pointerover 重新建立；也正因为这里清空，才不会出现
      // 「选中记录变了、虚线框还挂在旧位置」的一帧。
      if (doc.selection.hoverId) doc.selection.hover(null);

      if (skipRevealRef.current) return;
      reveal(id);
    });
  }, [doc]);

  const commit = useCallback(
    (command: Command) => {
      history.execute(command);
      onSchemaChange?.(doc.toSchema());
    },
    [history, doc, onSchemaChange],
  );

  /** 撤销/重做之后选中节点可能已经不存在了，把选区落回根节点 */
  const ensureSelection = useCallback(() => {
    const id = doc.selection.selectedId;
    if (id && !doc.getNode(id)) doc.selection.select(doc.root.id);
  }, [doc]);

  const undo = useCallback(() => {
    if (!history.undo()) return;
    ensureSelection();
    onSchemaChange?.(doc.toSchema());
  }, [history, ensureSelection, doc, onSchemaChange]);

  const redo = useCallback(() => {
    if (!history.redo()) return;
    ensureSelection();
    onSchemaChange?.(doc.toSchema());
  }, [history, ensureSelection, doc, onSchemaChange]);

  /**
   * 保存：把当前 schema 导出为 JSON 文件下载（引擎 demo 的「保存到本地」
   * 是写 localStorage，本地文件对单机 playground 更有用）。
   * 文件名用 doc.id —— playground 里就是页面 key。
   */
  const save = useCallback(() => {
    const schema = doc.toSchema();
    const blob = new Blob([JSON.stringify(schema, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onSchemaChange?.(schema);
  }, [doc, onSchemaChange]);

  // Ctrl/Cmd + S 已并入 handleKeyDown（画布 iframe 里也要能触发，见 §7.3 桥接）

  /**
   * 把某个节点滚进画布视野。
   *
   * **不做平滑滚动**：工具条是 `position: fixed` + 每帧重测矩形来跟随节点的，
   * 平滑滚动期间（尤其主线程被整树重渲染占住时）它会比画布慢半拍，看上去就是
   * 条和框"抖 / 闪"。引擎那边的工具条本来就在画布坐标系里，滚动时天然同步，
   * 没有这个问题 —— 所以这里直接跳到位。
   */
  const locate = useCallback((nodeId: string) => {
    const canvas = getCanvas();
    if (!canvas) return;
    const element = canvas.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
    element?.scrollIntoView({ block: 'center' });
  }, [getCanvas]);

  const dropContext = useMemo(
    () =>
      createDesignerDropContext({
        root: () => getCanvas(),
        document: doc,
        registry,
        rects: rectsRef.current!,
      }),
    [doc, registry, getCanvas],
  );

  // 拖拽引擎：全生命周期只建一次，document / registry 变化才重建
  useEffect(() => {
    const manager = createDragManager({
      // 画布未就绪时兜底回主文档：DragManager 会把监听同时挂到
      // 起拖事件的文档和画布文档上（跨 frame 拖拽两侧都要收事件）
      root: () => getCanvas() ?? globalThis.document.body,
      context: dropContext,
      threshold: 4,
      // 自动滚动后立刻失效缓存，否则本帧仍按滚动前的坐标算落点
      onScroll: () => rectsRef.current?.invalidate(),
    });
    dragRef.current = manager;

    const offStart = manager.on('dragstart', () => {
      const canvas = getCanvas();
      if (canvas) rectsRef.current?.prime(canvas);
      setDraggingSync(true);
    });

    const offEnd = manager.on('dragend', ({ payload, target }) => {
      setDraggingSync(false);
      if (!target || !target.valid) return;

      if (payload.type === 'material') {
        const meta = registry.getMeta(payload.componentName);
        const template = (meta?.defaultSchema ?? {
          componentName: payload.componentName,
        }) as Omit<NodeSchema, 'id'>;
        const command = new InsertNode(target.containerId, target.index, template);
        commit(command);
        selectQuietly(command.nodeId);
      } else {
        const [nodeId] = payload.ids;
        if (!nodeId) return;
        commit(
          new MoveNode(nodeId, {
            containerId: target.containerId,
            index: target.index,
          }),
        );
        selectQuietly(nodeId);
      }
    });

    // Esc / pointercancel / 窗口失焦都会走 cancel，没有这一条会一直藏着工具条
    const offCancel = manager.on('cancel', () => setDraggingSync(false));

    return () => {
      offStart();
      offEnd();
      offCancel();
      manager.dispose();
      dragRef.current = null;
    };
  }, [doc, registry, dropContext, commit, selectQuietly, setDraggingSync]);

  // 滚动 / 缩放会让矩形缓存失真（§6.3 D11）
  useEffect(() => {
    const invalidate = () => rectsRef.current?.invalidate();
    globalThis.document.addEventListener('scroll', invalidate, true);
    window.addEventListener('resize', invalidate);
    return () => {
      globalThis.document.removeEventListener('scroll', invalidate, true);
      window.removeEventListener('resize', invalidate);
    };
  }, []);

  // 选中 / hover 标记：只写 DOM 属性，不给每个物料加选中态 prop。
  // **视觉不靠它们**（框由 SelectionBorders 那层绝对定位的 div 画，见 §7.4.1），
  // 这里保留是为了调试、自动化测试，以及"hover 元素同时被选中时只画一个框"的判断。
  // 只在真的变化时才改属性 —— 多余的 setAttribute 会触发 RectCache 的
  // MutationObserver，白白让拖拽前的矩形缓存失效一次。
  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;

    const selectedId = doc.selection.selectedId;
    for (const el of canvas.querySelectorAll('[data-selected]')) {
      if (!selectedId || el.getAttribute('data-node-id') !== selectedId) {
        el.removeAttribute('data-selected');
      }
    }

    if (!selectedId) return;
    const target = canvas.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    if (target && !target.hasAttribute('data-selected')) {
      target.setAttribute('data-selected', '');
    }
  });

  // hover 标记（画布 hover / 面包屑 / 大纲树悬停 → 虚线框），与选中同一套直写策略
  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;

    const hoverId = doc.selection.hoverId;
    for (const el of canvas.querySelectorAll('[data-hovered]')) {
      if (!hoverId || el.getAttribute('data-node-id') !== hoverId) {
        el.removeAttribute('data-hovered');
      }
    }

    if (!hoverId) return;
    const target = canvas.querySelector(`[data-node-id="${CSS.escape(hoverId)}"]`);
    if (target && !target.hasAttribute('data-hovered')) {
      target.setAttribute('data-hovered', '');
    }
  });

  // 画布自身的 hover 联动：鼠标划过节点 → 虚线框（引擎的 border-detecting）。
  // 画布进了 iframe，React 合成事件到不了 frame 里 —— 这两个处理器由下面的
  // 桥接 effect 以原生监听挂在画布文档上。事件坐标是 iframe 视口坐标，
  // 与 nodeAt / 落点几何同一坐标系，不需要换算。
  // selection.hover 是幂等的（id 没变直接 return），所以这里高频调用也不会触发重渲染。
  const handleCanvasPointerOver = useCallback(
    (event: PointerEvent) => {
      if (draggingRef.current) return;
      const canvas = getCanvas();
      if (!canvas) return;
      const hit = nodeAt({ x: event.clientX, y: event.clientY }, canvas);
      doc.selection.hover(hit ? hit.id : null);
    },
    [doc, getCanvas],
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent) => {
      const canvas = getCanvas();
      if (!canvas) return;

      const hit = nodeAt({ x: event.clientX, y: event.clientY }, canvas);
      if (!hit) {
        doc.selection.select(null);
        return;
      }

      const node = doc.getNode(hit.id);
      if (!node) return;

      // 点画布：节点就在指针下面，不要再把它滚到视口顶部
      selectQuietly(node.id);

      // 根节点和锁定节点不允许拖动
      if (node.id === doc.root.id || node.locked) return;

      dragRef.current?.start({ type: 'node', ids: [node.id], source: 'canvas' }, event);
    },
    [doc, getCanvas, selectQuietly],
  );

  // 快捷键：Delete 删除、Ctrl/Cmd+Z 撤销、加 Shift 重做、Ctrl/Cmd+S 保存。
  // 提成独立的 handler：宿主文档和画布（iframe）文档**都要挂** ——
  // 焦点在画布里时键盘事件只进 iframe，宿主的监听收不到。
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // 正在输入时不劫持：否则在属性面板里按退格会删节点
      if (isEditable(event.target)) return;

      const meta = event.metaKey || event.ctrlKey;

      if (meta && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      const selectedId = doc.selection.selectedId;
      if (!selectedId || selectedId === doc.root.id) return;

      const node = doc.getNode(selectedId);
      if (!node || node.locked) return;

      event.preventDefault();
      const parentId = node.parent?.id ?? doc.root.id;
      commit(new RemoveNode(selectedId));
      doc.selection.select(parentId);
    },
    [doc, commit, undo, redo, save],
  );

  useEffect(() => {
    globalThis.document.addEventListener('keydown', handleKeyDown);
    return () => globalThis.document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  /**
   * iframe 画布桥接（DESIGN-v1 §7.3）：
   * - **schema 同步走 postMessage**：文档任何变化全量推给画布入口，
   *   画布文档里自己整树重渲染（与 D14 同粒度，消息天然全量）；
   * - **事件走同源直挂**：React 合成事件到不了 frame 里，画布侧的
   *   pointerdown / pointerover / keydown / scroll 直接挂在 iframe 文档上；
   *   拖拽的 move/up 由 DragManager 自己跨文档挂（见 manager.ts 的 docs 集合）。
   */
  useEffect(() => {
    const frame = frameRef.current;
    const frameDoc = frame?.contentDocument;
    const frameWin = frame?.contentWindow;
    if (!frame || !frameDoc || !frameWin) return;

    frameDoc.addEventListener('pointerdown', handleCanvasPointerDown);
    frameDoc.addEventListener('pointerover', handleCanvasPointerOver);
    // 指针离开 iframe：relatedTarget 跨不过 frame 边界（必为 null），
    // 对齐原来 canvasRoot 的 onPointerLeave —— 画布外不保留悬停框
    const onPointerOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      doc.selection.hover(null);
    };
    frameDoc.addEventListener('pointerout', onPointerOut);
    frameDoc.addEventListener('keydown', handleKeyDown);
    const invalidate = () => rectsRef.current?.invalidate();
    frameDoc.addEventListener('scroll', invalidate, true);

    const post = () => {
      frameWin.postMessage(
        { type: 'lc:schema', schema: doc.toSchema(), padding: canvasPadding },
        new URL(canvasUrl).origin,
      );
    };
    post();
    const offDoc = doc.subscribe(post);

    return () => {
      frameDoc.removeEventListener('pointerdown', handleCanvasPointerDown);
      frameDoc.removeEventListener('pointerover', handleCanvasPointerOver);
      frameDoc.removeEventListener('pointerout', onPointerOut);
      frameDoc.removeEventListener('keydown', handleKeyDown);
      frameDoc.removeEventListener('scroll', invalidate, true);
      offDoc();
    };
  }, [
    frameReady,
    doc,
    handleCanvasPointerDown,
    handleCanvasPointerOver,
    handleKeyDown,
    canvasUrl,
    canvasPadding,
  ]);

  // 左栏面板切换是纯 UI 状态，不进文档也不进历史。
  // **默认收起**：画布是第一主角，结构/tree 属于"要用再开"的面板（引擎默认展开
  // 是演示取向；真实项目里首屏留给画布更合理）。悬浮 / 固定两种装载仍由页头
  // 图钉切换，偏好落 localStorage。
  const [leftTab, setLeftTab] = useState('tree');
  const [pinned, setPinned] = useState(readPinned);
  const [paneOpen, setPaneOpen] = useState(false);

  /**
   * 数据源编辑表单的装载位置：**不是右栏属性面板**，而是贴在左栏面板右缘、
   * 压住画布左半边的浮层（对齐引擎 `plugin-datasource-pane` 的 detail：
   * `position: absolute; left: 300px; min-width: 600px`）。
   * null = 关着。
   */
  const [dsEditing, setDsEditing] = useState<{
    draft: DataSourceConfig;
    isNew: boolean;
  } | null>(null);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      writePinned(next);
      return next;
    });
    // 切装载方式意味着"我要用这个面板"，顺手把它打开
    setPaneOpen(true);
  }, []);

  const closePane = useCallback(() => {
    setPaneOpen(false);
    // 面板都收起来了，从它里面打开的编辑表单也一并收掉 —— 否则画布上会留一块
    // 没有来源的白板
    setDsEditing(null);
  }, []);

  // 面板内容只写一遍：固定时塞进左栏占位，悬浮时由外壳做成浮层
  const pane = (
    <div className={styles.leftPane}>
      {leftTab === 'materials' ? (
        <MaterialPanel
          registry={registry}
          pinned={pinned}
          onTogglePin={togglePin}
          onClose={closePane}
          onDragStart={(componentName, event) => {
            dragRef.current?.start({ type: 'material', componentName }, event.nativeEvent);
          }}
        />
      ) : leftTab === 'datasource' ? (
        <DataSourcePanel
          document={doc}
          pinned={pinned}
          onTogglePin={togglePin}
          onClose={closePane}
          onEdit={(draft, isNew) => setDsEditing({ draft, isNew })}
        />
      ) : (
        <TreePanel
          document={doc}
          onLocate={locate}
          onCommit={commit}
          pinned={pinned}
          onTogglePin={togglePin}
          onClose={closePane}
        />
      )}
    </div>
  );

  const left = (
    <div className={styles.left}>
      <ActivityRail
        // 收起时传 null：图标栏的高亮表达的是"这个面板正在显示"，
        // 面板都没开还亮着，就看不出点开的是哪个了
        active={paneOpen ? leftTab : null}
        onChange={(key) => {
          // 点当前这个图标 = 收起，点别的 = 切过去并打开 —— 照 lowcode 的 PanelDock，
          // 浮层面板靠图标栏开合，不靠"点画布"，否则点一下画布面板就没了。
          if (key === leftTab && paneOpen) {
            setPaneOpen(false);
            setDsEditing(null);
            return;
          }
          setLeftTab(key);
          setDsEditing(null);
          setPaneOpen(true);
        }}
        items={[
          { key: 'tree', label: '大纲树', icon: <OutlineTabIcon /> },
          { key: 'materials', label: '组件库', icon: <MaterialTabIcon /> },
          { key: 'datasource', label: '数据源', icon: <DataSourceTabIcon /> },
        ]}
      />
      {paneOpen && pinned ? pane : null}
    </div>
  );

  return (
    <>
      <DesignerShell
        toolbarLeft={
          /* 左区只有 logo（引擎 demo 的 logo 插件 + 场景名，场景名是标签不是切换器） */
          <span className={styles.brand}>
            <BrandMark />
            <span className={styles.brandName}>Lowcode Next</span>
          </span>
        }
        toolbarCenter={
          /* 中区：画布尺寸调整 —— 照引擎 demo 的 SimulatorResizePane：
           3 个设备档 + 宽度输入（实时显示实测宽度，回车提交） */
          <div className={styles.canvasSize}>
            <div className={styles.deviceGroup} role="group" aria-label="画布设备档位">
              {CANVAS_DEVICES.map(({ key, label, width, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={styles.deviceButton}
                  data-active={device === key || undefined}
                  title={label}
                  aria-label={label}
                  aria-pressed={device === key}
                  onClick={() => {
                    setDevice(key);
                    // 桌面档（width=null）回到进入时的基准宽度；其余档位是定宽
                    setCanvasWidth(width ?? baseWidthRef.current);
                    setDraft(null);
                  }}
                >
                  <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
              ))}
            </div>
            <label className={styles.widthInput}>
              <input
                className={styles.widthField}
                type="number"
                min={320}
                max={3840}
                step={1}
                value={draft ?? canvasWidth ?? ''}
                placeholder="请输入"
                title="输入设计宽度后按回车应用"
                aria-label="画布宽度"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Escape') {
                    setDraft(null);
                    return;
                  }
                  if (event.key !== 'Enter') return;
                  // 回车提交（引擎的 onPressEnter）；越界 / 非法直接弹回实测值
                  const parsed = Math.round(Number(draft));
                  if (Number.isFinite(parsed) && draft !== null && draft !== '') {
                    setCanvasWidth(Math.min(3840, Math.max(320, parsed)));
                  }
                  setDraft(null);
                }}
                onBlur={() => setDraft(null)}
              />
              <span className={styles.widthUnit}>px</span>
            </label>
          </div>
        }
        toolbarRight={
          /* 右区：撤销重做 + 保存 / 预览（对齐引擎 demo 的 topArea right） */
          <>
            <div className={styles.history}>
              <button
                type="button"
                className={styles.historyButton}
                disabled={!historyState.canUndo}
                title="撤销（Ctrl/Cmd + Z）"
                onClick={undo}
              >
                <Undo2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.historyButton}
                disabled={!historyState.canRedo}
                title="重做（Ctrl/Cmd + Shift + Z）"
                onClick={redo}
              >
                <Redo2 size={14} aria-hidden="true" />
              </button>
            </div>
            <button type="button" className={styles.toolbarButton} title="保存（Ctrl/Cmd + S）" onClick={save}>
              保存
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!onPreview}
              title={onPreview ? '在新窗口打开运行态预览' : '宿主未提供 onPreview'}
              onClick={onPreview}
            >
              预览
            </button>
          </>
        }
        left={left}
        leftOpen={paneOpen && pinned}
        floatPane={paneOpen && !pinned ? pane : null}
        canvasStyle={
          canvasWidth == null
            ? undefined
            : // 设计宽度：画布是一张固定宽度的"纸"，在 stage 里水平居中；
              // 可视窗口比纸窄（面板占位 / 窗口小）时出横向滚动，内容不重排
              { width: canvasWidth, marginInline: 'auto' }
        }
        canvas={
          <>
            {/* 画布文档（同源 iframe）：schema 经 postMessage 推入，画布自己渲染。
                内容、样式、滚动、@media 全部隔离在 frame 里，宿主只看到一张"纸"。 */}
            <iframe
              ref={frameRef}
              className={styles.canvasFrame}
              // 可访问名称用 aria-label 而不是 title：title 会被 TitleTooltip
              // 接管成气泡，悬停画布就弹一个「画布」，纯噪音
              aria-label="画布"
              src={canvasUrl}
              onLoad={() => setFrameReady((value) => value + 1)}
            />
            {/* 编辑覆盖层：选中/悬停边框 + 浮动工具条，画在宿主文档里、盖在 iframe 上。
                整层 pointer-events: none，点击穿透到 iframe；工具条自己恢复。 */}
            <div ref={overlayRef} className={styles.canvasOverlay}>
              <SelectionBorders
                document={doc}
                overlayRef={overlayRef}
                getCanvas={getCanvas}
                getFrame={getFrame}
                frameReady={frameReady}
              />
              <FloatToolbar
                document={doc}
                onCommit={commit}
                getCanvas={getCanvas}
                getFrame={getFrame}
                onLocate={locate}
                hidden={dragging}
              />
            </div>
          </>
        }
        right={
          rightPanel ?? (
            <PropertyPanel
              document={doc}
              onCommit={commit}
              onHoverNode={(id) => doc.selection.hover(id)}
              onLocateNode={locate}
            />
          )
        }
        detailPane={
          dsEditing ? (
            /* 数据源编辑表单：贴在数据源面板右缘的浮层，**不接管右栏属性面板**
             （引擎 datasource-pane 的 detail 也是这块装载） */
            <DataSourceForm
              origin={dsEditing.draft}
              isNew={dsEditing.isNew}
              existingIds={doc.dataSource.map((item) => item.id)}
              onConfirm={(next) => {
                const list = [...doc.dataSource];
                const index = list.findIndex((item) => item.id === dsEditing.draft.id);
                if (index >= 0) list[index] = next;
                else list.push(next);
                doc.setDataSource(list);
                setDsEditing(null);
              }}
              onCancel={() => setDsEditing(null)}
            />
          ) : null
        }
      />
      {/* 挂在根上：接管整棵树里的 title，统一换成深色小气泡 */}
      <TitleTooltip />
    </>
  );
}

/**
 * 顶栏 logo：品牌蓝圆角块 + 叠层图形，配字标。
 * 只做标识，不带交互 —— 引擎 demo 左区就是 logo 图 + 场景名（标签，不是切换器）。
 */
function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className={styles.brandMark} aria-hidden="true">
      <defs>
        <linearGradient id="lc-next-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a8bff" />
          <stop offset="1" stopColor="#006cff" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#lc-next-mark)" />
      <path d="M12 5.4 18.6 9 12 12.6 5.4 9 12 5.4Z" fill="#fff" />
      <path
        d="M6.6 12.2 12 15.1l5.4-2.9"
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
    </svg>
  );
}

function isEditable(target: EventTarget | null): boolean {
  // 不能用 instanceof HTMLElement：画布在 iframe 里，那边 realm 的构造函数
  // 和宿主的不是同一个，画布内输入框的按键会被误判
  if (!(target instanceof globalThis.HTMLElement) && typeof (target as Element)?.closest !== 'function') {
    return false;
  }
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

const PIN_KEY = 'lowcode-next:left-fixed';

function readPinned(): boolean {
  try {
    // 默认悬浮 —— lowcode 的大纲面板 `let isInFloatArea = true`，只有点过图钉
    // 存了偏好才会变成占位。新用户看到的第一眼和引擎一致。
    return globalThis.localStorage?.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

function writePinned(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(PIN_KEY, value ? '1' : '0');
  } catch {
    /* 隐私模式下写不了，忽略即可 —— 装载方式只是偏好，不该影响编辑 */
  }
}
