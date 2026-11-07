import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react';
import type { Command, DocumentImpl } from '@lowcode-next/model';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import type { PageSchema } from '@lowcode-next/protocol';
import { CANVAS_DEVICES, DesignerSession } from '@lowcode-next/designer-core';
import type { CanvasDevice, SetterRegistry } from '@lowcode-next/designer-core';
import { ActivityRail, DataSourceTabIcon, MaterialTabIcon, OutlineTabIcon } from './ActivityRail';
import { prepareCanvasDocument } from './canvas-document';
import { DataSourceForm } from './DataSourceForm';
import { DataSourcePanel } from './DataSourcePanel';
import { DesignerShell } from './DesignerShell';
import { FloatToolbar } from './FloatToolbar';
import { MaterialPanel } from './MaterialPanel';
import { PropertyPanel } from './PropertyPanel';
import { SelectionBorders } from './SelectionBorders';
import { TitleTooltip } from './Tooltip';
import { TreePanel } from './TreePanel';
import styles from '@lowcode-next/designer-ui/Designer.module.css';

export interface DesignerProps {
  document: DocumentImpl;
  registry: MaterialMetaRegistry;
  /** 右区「预览」回调：宿主自己决定怎么开预览（引擎 demo 是开 preview.html）。缺省按钮置灰 */
  onPreview?: () => void;
  /** 覆盖右栏内容；缺省是内置属性面板 */
  rightPanel?: ReactNode;
  /** 画布内边距，默认 20；做整幅落地页时设 0，让区块自己贴边 */
  canvasPadding?: number;
  onSchemaChange?: (schema: PageSchema) => void;
  /**
   * setter 注册表（§12.12.6）。缺省用全局默认表，宿主直接
   * `registerSetter('color', Comp)` / `loadSetters(...)` 就能生效。
   * 传自己的实例可以隔离多个编辑器，或绑定 `flavor` 做实现族校验。
   */
  setters?: SetterRegistry;
  /**
   * 自渲染画布（§12.14）。给了它就不再用独立入口页：
   * iframe 文档由本组件现场写出，画布内容用 Portal 投进去，与编辑器同一棵 React tree。
   *
   * 入参是画布内边距，返回要渲染的内容；内部必须含一个 `[data-lc-canvas]` 根，
   * 选中框与拖拽命中都靠它定位。
   *
   * 好处：用户组件、Context、样式全部直接可用，没有跨 frame 消息通道，
   * 也不会把模块再执行一遍。代价是画布代码进主 bundle。
   *
   * **函数引用不必稳定**（内部用 ref 取最新值），但内容要跟得上文档变化 ——
   * 每次 `emit` 会重渲染本组件，直接读 `document` 即可。
   */
  renderCanvas?: (padding: number) => ReactNode;
}

/** 设备档位 → 图标（core 的 `CANVAS_DEVICES` 只描述数据，不认框架与图标） */
const DEVICE_ICONS = {
  default: Monitor,
  tablet: Tablet,
  phone: Smartphone,
} as const satisfies Record<CanvasDevice, unknown>;

/**
 * 设计器组装（DESIGN-v1 §7.1 / §12.13.4）。
 *
 * 这个文件现在**只剩视图**：状态与写操作都在 `DesignerSession`（零框架）里。
 * 三条数据流照旧，只是执行者换成了 session：
 * - 高频拖拽：pointer → DragManager → DropContext → Overlay，**不碰渲染**
 * - 低频提交：pointerup → Command → History → Document.apply → 整树重渲染（D14）
 * - 选中：pointerdown → Selection → 高亮 + 大纲 + 属性面板 + 路径条
 *
 * 视图只做两件事：订阅快照、把手势翻译成命令。`designer-vue` 换成 Vue 的模板，
 * 但调用的是同一批 session 方法 —— 两版之间不存在「各自实现一遍」的规则。
 */
export function Designer({
  document: doc,
  registry,
  onPreview,
  rightPanel,
  canvasPadding = 20,
  onSchemaChange,
  setters,
  renderCanvas,
}: DesignerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  /** 画布宿主节点（iframe 的 body）。portal 模式之外恒为 null */
  const [canvasHost, setCanvasHost] = useState<HTMLElement | null>(null);

  // 函数引用每次渲染都会变，不能让 effect 依赖它 —— 否则每帧重建文档、画布闪白
  const renderCanvasRef = useRef(renderCanvas);
  renderCanvasRef.current = renderCanvas;
  const portalMode = renderCanvas != null;

  const session = useMemo(
    () =>
      new DesignerSession({
        document: doc,
        materials: registry,
        canvasPadding,
        onSchemaChange,
        canvasMode: portalMode ? 'portal' : 'frame',
      }),
    // 只在文档 / 物料注册表 / 画布装载方式换掉时重建；其余 props 由下面的 update() 同步
    [doc, registry, portalMode],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    // portal 模式：文档必须由宿主先写出来，否则 iframe 里没有 body 可投
    const handle = renderCanvasRef.current ? prepareCanvasDocument(frame) : null;
    setCanvasHost(handle?.doc.body ?? null);

    session.attachFrame(frame);
    session.start();
    return () => {
      session.dispose();
      handle?.dispose();
    };
  }, [session]);

  /**
   * 画布首帧后通知 session。
   *
   * 独立入口页靠 iframe 的 `load` 通知就绪；portal 的内容是 React commit 之后
   * 才进 DOM 的，那一刻 load 早已发过 —— 不补这一次，`getCanvas()` 一直是 null，
   * 设计宽度量不到、选中框与拖拽全都失效。
   */
  useEffect(() => {
    if (canvasHost) session.markCanvasReady();
  }, [canvasHost, session]);

  // 宿主可能每次渲染都给新的内联回调：同步进 session，避免它捕获旧闭包
  useEffect(() => {
    session.update({ canvasPadding, onSchemaChange });
  });

  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { device, canvasWidth, canvasDraft, frameReady, dragging, history, ui, dataSourceEditing } =
    snap;
  const { leftTab, pinned, paneOpen } = ui;

  const commit = useCallback((command: Command) => session.commit(command), [session]);
  const locate = useCallback((nodeId: string) => session.locate(nodeId), [session]);

  // 面板内容只写一遍：固定时塞进左栏占位，悬浮时由外壳做成浮层
  const pane = (
    <div className={styles.leftPane}>
      {leftTab === 'materials' ? (
        <MaterialPanel
          registry={registry}
          pinned={pinned}
          onTogglePin={session.togglePin}
          onClose={session.closePane}
          onDragStart={(componentName, event) => {
            session.startMaterialDrag(componentName, event.nativeEvent);
          }}
        />
      ) : leftTab === 'datasource' ? (
        <DataSourcePanel
          document={doc}
          pinned={pinned}
          onTogglePin={session.togglePin}
          onClose={session.closePane}
          onEdit={(draft, isNew) => session.editDataSource(draft, isNew)}
        />
      ) : (
        <TreePanel
          document={doc}
          onLocate={locate}
          onCommit={commit}
          pinned={pinned}
          onTogglePin={session.togglePin}
          onClose={session.closePane}
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
        onChange={(key) => session.toggleLeftTab(key)}
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
              {CANVAS_DEVICES.map(({ key, label }) => {
                const Icon = DEVICE_ICONS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={styles.deviceButton}
                    data-active={device === key || undefined}
                    title={label}
                    aria-label={label}
                    aria-pressed={device === key}
                    onClick={() => session.setDevice(key)}
                  >
                    <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <label className={styles.widthInput}>
              <input
                className={styles.widthField}
                type="number"
                min={320}
                max={3840}
                step={1}
                value={canvasDraft ?? canvasWidth ?? ''}
                placeholder="请输入"
                title="输入设计宽度后按回车应用"
                aria-label="画布宽度"
                onChange={(event) => session.setCanvasDraft(event.target.value)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Escape') {
                    session.setCanvasDraft(null);
                    return;
                  }
                  if (event.key !== 'Enter') return;
                  // 回车提交（引擎的 onPressEnter）；越界 / 非法直接弹回实测值
                  session.commitCanvasDraft();
                }}
                onBlur={() => session.setCanvasDraft(null)}
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
                disabled={!history.canUndo}
                title="撤销（Ctrl/Cmd + Z）"
                onClick={() => session.undo()}
              >
                <Undo2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.historyButton}
                disabled={!history.canRedo}
                title="重做（Ctrl/Cmd + Shift + Z）"
                onClick={() => session.redo()}
              >
                <Redo2 size={14} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className={styles.toolbarButton}
              title="保存（Ctrl/Cmd + S）"
              onClick={() => session.save()}
            >
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
            {/* 画布文档（同源 iframe）：内容、样式、滚动、@media 全部隔离在 frame 里，
                宿主只看到一张"纸"。两种装载方式共用这一个元素，区别只在内容从哪来：
                - frame 模式：src 指向独立入口页，schema 经 postMessage 推入
                - portal 模式：不设 src，文档由 prepareCanvasDocument 现场写出，
                  内容从下面的 createPortal 进来（同一棵 React tree） */}
            <iframe
              ref={frameRef}
              className={styles.canvasFrame}
              // 可访问名称用 aria-label 而不是 title：title 会被 TitleTooltip
              // 接管成气泡，悬停画布就弹一个「画布」，纯噪音
              aria-label="画布"
              src={portalMode ? undefined : session.canvasSource}
            />
            {canvasHost
              ? createPortal(renderCanvasRef.current!(canvasPadding), canvasHost)
              : null}
            {/* 编辑覆盖层：选中/悬停边框 + 浮动工具条，画在宿主文档里、盖在 iframe 上。
                整层 pointer-events: none，点击穿透到 iframe；工具条自己恢复。 */}
            <div ref={overlayRef} className={styles.canvasOverlay}>
              <SelectionBorders
                document={doc}
                overlayRef={overlayRef}
                getCanvas={session.getCanvas}
                getFrame={session.getFrame}
                frameReady={frameReady}
              />
              <FloatToolbar
                document={doc}
                onCommit={commit}
                getCanvas={session.getCanvas}
                getFrame={session.getFrame}
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
              onHoverNode={(id) => session.hover(id)}
              onLocateNode={locate}
              setters={setters}
            />
          )
        }
        detailPane={
          dataSourceEditing ? (
            /* 数据源编辑表单：贴在数据源面板右缘的浮层，**不接管右栏属性面板**
             （引擎 datasource-pane 的 detail 也是这块装载） */
            <DataSourceForm
              origin={dataSourceEditing.draft}
              isNew={dataSourceEditing.isNew}
              existingIds={doc.dataSource.map((item) => item.id)}
              onConfirm={(next) => session.applyDataSource(next)}
              onCancel={() => session.closeDataSourceEditor()}
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
