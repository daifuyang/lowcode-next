import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Rect } from '@lowcode-next/drag';
import { InsertNode, RemoveNode, SetFlag } from '@lowcode-next/model';
import type { Command, DocumentImpl } from '@lowcode-next/model';
import { MatIcon } from './icons';
import { buildHierarchy, parentChain, PARENT_CHAIN_LIMIT } from './hierarchy';
import { cloneNodeSchema } from './clone';
import { nearestScroller, followTransitions, rectToHost } from './dom';
import { BAR_HEIGHT, anchorOnScreen, placeFloatBar, placePopup } from './float-bar';
import styles from './FloatToolbar.module.css';

export interface FloatToolbarProps {
  document: DocumentImpl;
  /** 结构/标记类写操作统一走宿主的提交通道（进历史栈） */
  onCommit: (command: Command) => void;
  /** 画布根元素（iframe 文档里）：选中节点的 DOM 从它下面反查 */
  getCanvas: () => HTMLElement | null;
  /** 画布 iframe 元素：节点矩形是 frame 视口坐标，要换算成宿主坐标再定位 */
  getFrame: () => HTMLIFrameElement | null;
  /** 点击层级里的某一层时把画布滚过去 */
  onLocate?: (nodeId: string) => void;
  /** 拖拽进行中整体隐藏 —— fixed 层会挡住 elementFromPoint 的命中 */
  hidden?: boolean;
}

/** 鼠标从工具条移到面板要跨过 3px 空隙，给个收起的宽限期 */
const CLOSE_DELAY = 120;

/**
 * 选中节点的工具条，照搬 lowcode-engine 的形态：
 *
 *   结构   `bem-tools/border-selecting.tsx` 的 `<div class="lc-borders-actions">`
 *          —— 动作按钮 + 末尾的 `NodeSelector`，`flex-direction: row-reverse`
 *   样式   `bem-tools/borders.less` + `node-selector/index.less`
 *   尺寸   条高 20、按钮 20×20、图标 16、圆角 3、上沿外 23px
 *   层级   标题显示当前节点；鼠标移上去浮出祖先链（父级 → 祖父 → …，最多 5 层），
 *          悬停某层在画布上高亮，点击即选中 —— 与引擎的 `getParentNodes` 一致。
 *          面板挂在工具条**下方**（引擎 Fusion Popup 的默认对齐），所以紧贴工具条的
 *          第一行就是最近的父级，顺序不需要再加工
 *
 * 三条实现约束沿用之前的结论：
 * 1. `position: fixed` + 屏幕坐标，不参与画布布局，不会被 overflow 裁掉；
 * 2. 拖拽中 `visibility: hidden`，否则会挡住 elementFromPoint 的命中；
 * 3. `pointerdown` 必须 stopPropagation，否则画布把它当成"点在空白处"清空选区。
 */
export function FloatToolbar({
  document: doc,
  onCommit,
  getCanvas,
  getFrame,
  onLocate,
  hidden,
}: FloatToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  /** 画布可视矩形：工具条只在这个范围内落位，不会飘到应用顶栏 / 侧栏上 */
  const [canvasRect, setCanvasRect] = useState<Rect | null>(null);
  const [barSize, setBarSize] = useState({ width: 0, height: 0 });
  const [popupSize, setPopupSize] = useState({ width: 0, height: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  const selectedId = doc.selection.selectedId;
  const node = selectedId ? doc.getNode(selectedId) : null;
  // 根节点没有父级、也删不掉/复制不了，给它挂条工具条只是噪音
  const visible = Boolean(node && node.id !== doc.root.id);

  /**
   * 面板是"为某个节点打开的"，所以开着与否直接由 `openId === selectedId` 推导。
   *
   * **不能只存一个 boolean**：选中变化若先于"关面板"的那次渲染提交
   * （选区是外部 store，`select()` 会同步通知），就会画出一帧"工具条已经跳到新节点、
   * 祖先列表还挂在旧位置"的画面 —— 点层级跳级时的那下闪烁就是这么来的。
   * 用 id 比较后，选中一变，同一次渲染里面板就没了，没有中间帧。
   */
  const open = openId !== null && openId === selectedId;

  /**
   * 收起面板。
   *
   * 已经收起就什么都不做：从祖先列表里选完一层后，面板随之关闭，鼠标随即
   * "离开工具条"（指针下面已经是画布），会再排一次 `scheduleClose`。这时如果
   * 还去 `hover(null)`，画布刚恢复的虚线框会在 120ms 后自己消失 —— 又是一下闪。
   */
  const closePopup = useCallback(() => {
    if (openId === null) return;
    setOpenId(null);
    doc.selection.hover(null);
  }, [doc, openId]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openPopup = useCallback(() => {
    cancelClose();
    setOpenId(selectedId);
  }, [cancelClose, selectedId]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      closePopup();
    }, CLOSE_DELAY);
  }, [cancelClose, closePopup]);

  useEffect(() => cancelClose, [cancelClose]);

  /** 量一次锚点矩形（屏幕坐标），没变化就不 setState，免得多余渲染 */
  const sync = useCallback(() => {
    const canvas = getCanvas();
    const frame = getFrame();

    // 画布可视区 = iframe 自己的视口（画布滚动发生在 iframe 文档里），
    // 矩形在 frame 坐标系里量的，先换算成宿主坐标再参与落位
    const viewRaw = canvas ? nearestScroller(canvas)?.getBoundingClientRect() : null;
    const view = viewRaw ? rectToHost(viewRaw, frame) : null;
    const nextCanvas: Rect | null = view
      ? { x: view.x, y: view.y, width: view.width, height: view.height }
      : null;
    setCanvasRect((current) =>
      current === nextCanvas || (current && nextCanvas && sameRect(current, nextCanvas))
        ? current
        : nextCanvas,
    );

    const id = doc.selection.selectedId;
    const target = id && id !== doc.root.id ? doc.getNode(id) : null;
    const element = canvas && target ? canvas.querySelector(nodeSelector(target.id)) : null;

    if (!element) {
      setAnchorRect((current) => (current ? null : current));
      return;
    }

    const rect = rectToHost(element.getBoundingClientRect(), frame);
    const next: Rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    setAnchorRect((current) => (current && sameRect(current, next) ? current : next));
  }, [doc, getCanvas, getFrame]);

  // 每次渲染后同步：结构变化（改属性、拖入、撤销）都会走到这里
  useLayoutEffect(() => {
    const { innerWidth, innerHeight } = window;
    setViewport((current) =>
      current.width === innerWidth && current.height === innerHeight
        ? current
        : { width: innerWidth, height: innerHeight },
    );
    sync();
  });

  // 滚动（任意滚动容器）/ 缩放：矩形会失真，按帧重新量
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      schedule();
    };

    // 滚动有两层：宿主文档（stage 横向 / 面板）+ iframe 文档自己的滚动条，
    // scroll 不冒泡只能捕获，frame 内的滚动必须单独挂。
    //
    // 和 SelectionBorders 一样：画布内容在 iframe 里滚动，工具条却画在宿主文档，
    // 过 rAF 会稳定慢一帧（每帧滚 10px 就恒差 10px，滚轮惯性下就是来回抖）。
    // 滚动路径同步量、同步 setState；resize / transition 仍走 rAF 合并。
    const onScroll = () => sync();
    globalThis.document.addEventListener('scroll', onScroll, true);
    const canvas = getCanvas();
    const canvasDoc = canvas?.ownerDocument;
    canvasDoc?.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    // 物料的 hover 动效（上浮 2px）只产生 transition，不产生 scroll / resize：
    // 不跟着采，工具条和层级面板会在动效期间停在旧位置，鼠标下的行跟着跳，点击就落空
    const stopFollow = canvas ? followTransitions(canvas, schedule) : null;

    return () => {
      if (frame) cancelAnimationFrame(frame);
      stopFollow?.();
      globalThis.document.removeEventListener('scroll', onScroll, true);
      canvasDoc?.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [sync, getCanvas, getFrame]);

  // 工具条与面板的宽度都随文案变化，定位必须用真实尺寸
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setBarSize((current) =>
      current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height },
    );
  });

  useLayoutEffect(() => {
    const element = popupRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPopupSize((current) =>
      current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height },
    );
  });

  // 面板开启时：点外面 / Esc 关闭
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as globalThis.Node)) closePopup();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopup();
    };

    globalThis.document.addEventListener('pointerdown', onPointerDown, true);
    globalThis.document.addEventListener('keydown', onKeyDown, true);
    return () => {
      globalThis.document.removeEventListener('pointerdown', onPointerDown, true);
      globalThis.document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, closePopup]);

  if (!visible || !node || !anchorRect) return null;
  // 节点滚出视野就整体不画：fixed 定位不判断的话会把条夹到视口边缘，浮在无关内容上
  if (!anchorOnScreen(anchorRect, viewport)) return null;

  const chain = buildHierarchy(node);
  const ancestors = parentChain(chain, PARENT_CHAIN_LIMIT);
  const title = node.meta?.title ?? node.componentName;
  const locked = node.locked;
  const parent = node.parent;

  const barStyle = placeFloatBar({
    anchor: anchorRect,
    size: barSize,
    viewport,
    bounds: canvasRect ?? undefined,
  });
  const popupStyle = placePopup({
    bar: {
      x: barStyle.left,
      y: barStyle.top,
      width: barSize.width,
      height: barSize.height || BAR_HEIGHT,
    },
    size: popupSize,
    viewport,
  });

  const measured = barSize.width > 0;

  const remove = () => {
    if (!parent || locked) return;
    const parentId = parent.id;
    onCommit(new RemoveNode(node.id));
    doc.selection.select(parentId);
  };

  const copy = () => {
    if (!parent) return;
    const clone = cloneNodeSchema(node.schema);
    onCommit(new InsertNode(parent.id, node.index() + 1, clone));
    doc.selection.select(clone.id);
  };

  const toggleLock = () => {
    onCommit(new SetFlag(node.id, { locked: !locked }));
  };

  const pick = (id: string) => {
    cancelClose();
    // 先关面板再选中：顺序反了的话，选中那次渲染里面板还开着（`open` 仍为真），
    // 会画出一帧"条已跳走、列表还在原处"的闪烁。`open` 由 openId===selectedId
    // 推导，所以即使这里不清，选中一变面板也会同帧消失，清一次只是为了语义明确。
    setOpenId(null);
    doc.selection.hover(null);
    doc.selection.select(id);
    onLocate?.(id);
  };

  return (
    <div
      ref={barRef}
      className={styles.actions}
      role="toolbar"
      aria-label="节点操作"
      data-side={barStyle.side}
      // 画布的 pointerover 会跳过这层：工具条是编辑 UI，不是画布内容
      data-lc-float="bar"
      style={{
        left: barStyle.left,
        top: barStyle.top,
        // 尺寸没量出来之前不显示，否则会先在错的位置闪一下；
        // 拖拽中同样要真隐藏 —— visibility 才会让出 elementFromPoint 的命中
        visibility: measured && !hidden ? 'visible' : 'hidden',
      }}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      // 画布在 iframe 里后，指针从画布进入工具条会先触发 iframe 的 pointerout
      // （relatedTarget 为 null，Designer 据此清 hover）—— 这里把选中节点的高亮
      // 补回来，"选中一个节点再移上去操作"的路上虚线框不会中途消失
      onMouseEnter={() => {
        const id = doc.selection.selectedId;
        if (id && id !== doc.root.id) doc.selection.hover(id);
      }}
      onMouseLeave={scheduleClose}
    >
      {/* DOM 顺序与引擎一致：动作在前、标题在后；row-reverse 让标题落在最左 */}
      <button
        type="button"
        className={styles.action}
        title="删除"
        aria-label="删除"
        disabled={!parent || locked}
        onClick={remove}
      >
        <ActionIcon name="remove" />
      </button>
      <button
        type="button"
        className={styles.action}
        title="复制"
        aria-label="复制"
        disabled={!parent}
        onClick={copy}
      >
        <ActionIcon name="copy" />
      </button>
      {node.isContainer() ? (
        <button
          type="button"
          className={styles.action}
          title={locked ? '解锁' : '锁定'}
          aria-label={locked ? '解锁' : '锁定'}
          onClick={toggleLock}
        >
          <ActionIcon name={locked ? 'unlock' : 'lock'} />
        </button>
      ) : null}

      <div className={styles.selector} onMouseEnter={openPopup}>
        <button
          type="button"
          className={styles.chip}
          aria-haspopup="menu"
          aria-expanded={open}
          // 不放 title：chip 的 tooltip 会把整条父级层级链（树）直接暴露在画板上，
          // 悬停就弹出一长串，先移除。可访问名称由内部 chipTitle 提供。
        >
          <MatIcon name={node.componentName} size={16} />
          <span className={styles.chipTitle}>{title}</span>
        </button>
      </div>

      {open && ancestors.length > 0 ? (
        <div
          ref={popupRef}
          className={styles.popup}
          role="menu"
          aria-label="父级"
          data-lc-float="popup"
          style={{
            left: popupStyle.left,
            top: popupStyle.top,
            visibility: popupSize.width > 0 ? 'visible' : 'hidden',
          }}
          onMouseEnter={cancelClose}
        >
          {ancestors.map((item) => (
            <div
              key={item.id}
              className={styles.popupRow}
              role="menuitem"
              // 不放 title：行的可见文本已是节点标题，tooltip 只会额外弹出
              // componentName/id 一类结构信息
              onMouseEnter={() => doc.selection.hover(item.id)}
              onMouseLeave={() => doc.selection.hover(null)}
              /* 按下即选中，**不用 click**。
                 面板里的行会因为工具条重新定位而整体位移 1~2px（选中节点的矩形在动效期间
                 是连续变化的）；用 click 时"按下在某行、抬起已滑到下一行或行间空隙"就
                 什么都不发生，连点几次都像没反应。按下那一刻的判定才是用户的真实意图。
                 preventDefault 顺手吃掉随后的 click，避免穿透到画布。 */
              onPointerDown={(event) => {
                // 右键 / 中键不当作跳级（click 本来就不为它们触发，这里补上同样的约束）
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                pick(item.id);
              }}
            >
              <div className={styles.popupRowContent}>
                <MatIcon name={item.componentName} size={16} />
                <span className={styles.popupRowTitle}>{item.title}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 动作图标：直接取 lowcode-engine packages/designer/src/icons 的 path   */
/* ------------------------------------------------------------------ */

type ActionIconName = 'remove' | 'copy' | 'lock' | 'unlock';

const ACTION_PATHS: Record<ActionIconName, string> = {
  remove:
    'M224 256v639.84A64 64 0 0 0 287.84 960h448.32A64 64 0 0 0 800 895.84V256h64a32 32 0 1 0 0-64H160a32 32 0 1 0 0 64h64zM384 96c0-17.664 14.496-32 31.904-32h192.192C625.696 64 640 78.208 640 96c0 17.664-14.496 32-31.904 32H415.904A31.872 31.872 0 0 1 384 96z m-96 191.744C288 270.208 302.4 256 320.224 256h383.552C721.6 256 736 270.56 736 287.744v576.512C736 881.792 721.6 896 703.776 896H320.224A32.224 32.224 0 0 1 288 864.256V287.744zM352 352c0-17.696 14.208-32.032 32-32.032 17.664 0 32 14.24 32 32v448c0 17.664-14.208 32-32 32-17.664 0-32-14.24-32-32V352z m128 0c0-17.696 14.208-32.032 32-32.032 17.664 0 32 14.24 32 32v448c0 17.664-14.208 32-32 32-17.664 0-32-14.24-32-32V352z m128 0c0-17.696 14.208-32.032 32-32.032 17.664 0 32 14.24 32 32v448c0 17.664-14.208 32-32 32-17.664 0-32-14.24-32-32V352z',
  copy:
    'M192 256.16C192 220.736 220.704 192 256.16 192h639.68C931.264 192 960 220.704 960 256.16v639.68A64.16 64.16 0 0 1 895.84 960H256.16A64.16 64.16 0 0 1 192 895.84V256.16z m64 31.584v576.512a32 32 0 0 0 31.744 31.744h576.512a32 32 0 0 0 31.744-31.744V287.744A32 32 0 0 0 864.256 256H287.744A32 32 0 0 0 256 287.744zM288 192v64h64V192H288z m128 0v64h64V192h-64z m128 0v64h64V192h-64z m128 0v64h64V192h-64z m128 0v64h64V192h-64z m96 96v64h64V288h-64z m0 128v64h64v-64h-64z m0 128v64h64v-64h-64z m0 128v64h64v-64h-64z m0 128v64h64v-64h-64z m-96 96v64h64v-64h-64z m-128 0v64h64v-64h-64z m-128 0v64h64v-64h-64z m-128 0v64h64v-64h-64z m-128 0v64h64v-64H288z m-96-96v64h64v-64H192z m0-128v64h64v-64H192z m0-128v64h64v-64H192z m0-128v64h64v-64H192z m0-128v64h64V288H192z m160 416c0-17.664 14.592-32 32.064-32h319.872a31.968 31.968 0 1 1 0 64h-319.872A31.968 31.968 0 0 1 352 704z m0-128c0-17.664 14.4-32 32.224-32h383.552c17.792 0 32.224 14.208 32.224 32 0 17.664-14.4 32-32.224 32H384.224A32.032 32.032 0 0 1 352 576z m0-128c0-17.664 14.4-32 32.224-32h383.552c17.792 0 32.224 14.208 32.224 32 0 17.664-14.4 32-32.224 32H384.224A32.032 32.032 0 0 1 352 448z m512 47.936V192h-64V159.968A31.776 31.776 0 0 0 768.032 128H160A31.776 31.776 0 0 0 128 159.968V768c0 17.92 14.304 31.968 31.968 31.968H192v64h303.936H128.128A63.968 63.968 0 0 1 64 799.872V128.128C64 92.704 92.48 64 128.128 64h671.744C835.296 64 864 92.48 864 128.128v367.808z',
  lock: 'M704 480v-160c0-105.6-86.4-192-192-192s-192 86.4-192 192v160H160v416h704V480h-160z m-320-160c0-70.4 57.6-128 128-128s128 57.6 128 128v160h-256v-160z m416 512H224v-288h576v288zM480 768h64v-160h-64z',
  unlock:
    'M384 480v-160c0-70.4 57.6-128 128-128s128 57.6 128 128v64h64v-64c0-105.6-86.4-192-192-192s-192 86.4-192 192v160H160v416h704V480H384z m416 352H224v-288h576v288zM416 736h192v-64h-192z',
};

function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg width={16} height={16} viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
      <path d={ACTION_PATHS[name]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

function nodeSelector(id: string): string {
  return `[data-node-id="${CSS.escape(id)}"]`;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
