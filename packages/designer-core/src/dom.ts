import type { Point } from '@lowcode-next/drag';

/**
 * 跨 frame 坐标换算（DESIGN-v1 §7.3 iframe 画布）。
 *
 * 每个 document 的 `getBoundingClientRect` 都以**自己的视口**为原点：iframe 里
 * 节点的矩形是 frame 视口坐标，宿主里 overlay / stage 的矩形是宿主视口坐标。
 * 两套坐标混用前必须过这里 —— iframe 视口原点 = iframe 元素在宿主里的位置
 * （border box）+ clientLeft/Top（iframe 的 1px 边框）。
 */

/** iframe 视口原点在宿主视口里的位置 */
export function frameOrigin(frame: HTMLIFrameElement | null): Point {
  if (!frame) return { x: 0, y: 0 };
  const rect = frame.getBoundingClientRect();
  return { x: rect.left + frame.clientLeft, y: rect.top + frame.clientTop };
}

/** 把 iframe 文档里量到的矩形换算成宿主视口坐标 */
export function rectToHost(
  rect: DOMRect,
  frame: HTMLIFrameElement | null,
): { x: number; y: number; width: number; height: number } {
  const origin = frameOrigin(frame);
  return { x: rect.left + origin.x, y: rect.top + origin.y, width: rect.width, height: rect.height };
}

/** 把宿主视口坐标换算成 iframe 文档的视口坐标 */
export function pointToFrame(point: Point, frame: HTMLIFrameElement | null): Point {
  const origin = frameOrigin(frame);
  return { x: point.x - origin.x, y: point.y - origin.y };
}

/**
 * 节点反查（DESIGN-v1 §5.4 / D8）。
 *
 * 只依赖 DOM 属性，不碰框架内部 —— 这也是 React 19 移除 findDOMNode
 * 之后唯一正确的做法。
 */
export function nodeAt(
  point: Point,
  root: HTMLElement,
): { id: string; element: Element } | null {
  const element = root.ownerDocument.elementFromPoint(point.x, point.y);
  const hit = element?.closest('[data-node-id]');
  if (!hit || !root.contains(hit)) return null;

  const id = hit.getAttribute('data-node-id');
  return id ? { id, element: hit } : null;
}

/** 滚动到位后节点上沿离视口上沿的距离，别贴得太死 */
const REVEAL_MARGIN = 12;

/**
 * 把节点滚进画布可视区 —— 对齐引擎的 `activeTracker.onChange → simulator.scrollToNode`。
 *
 * 引擎在**每次 active 变化**时都会调它，所以在大纲里点一个视野外的节点，
 * 画布会跟过去。少了这一步，点完只有状态栏变了、画布原地不动，看起来就是
 * "点了没选中"（框和工具条都在视口之外）。
 *
 * 判据比引擎略严一点：引擎只在"完全出界"时才滚，于是节点露个十几像素也会被判为
 * 可见 —— 点了之后画布上只剩一条边，和没选中没区别。这里改成**看得见一半以上就不动**，
 * 不到一半就滚；比视口还高的节点（整页、大地块）按视口高度算，避免选中整页时被拽走。
 */
export function revealNode(element: HTMLElement): void {
  const scroller = nearestScroller(element);
  if (!scroller) return;

  const view = scroller.getBoundingClientRect();
  const rect = element.getBoundingClientRect();

  const visibleH = Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top);
  const visibleW = Math.min(rect.right, view.right) - Math.max(rect.left, view.left);

  const enoughVertical = visibleH >= Math.min(rect.height, view.height) * 0.5;
  const enoughHorizontal = visibleW >= Math.min(rect.width, view.width) * 0.5;

  if (!enoughVertical) scroller.scrollTop += rect.top - view.top - REVEAL_MARGIN;
  if (!enoughHorizontal) scroller.scrollLeft += rect.left - view.left - REVEAL_MARGIN;
}

/**
 * CSS 过渡 / 动画期间按帧回调（滚到底自动停）。
 *
 * **为什么需要它**：物料的 hover 动效会连续移动节点矩形 ——
 * `.lc-feature:hover { transform: translateY(-2px); transition: transform .18s }`。
 * 这类位移不产生 scroll、不产生 resize、也不改 class / style 属性，所以选中框和
 * 工具条的三个触发器（ResizeObserver / MutationObserver / scroll）一个都不会响：
 * 鼠标移到选中的卡片上，卡片上浮 2px，框和工具条却钉在原处 ——
 * 看起来就是"框没跟上""背景错位"，而且工具条自己量出来的矩形也跟着旧了 2px，
 * 层级面板会在鼠标下跳一格，点击于是落空。
 *
 * 只在真的发生过渡时开 rAF：`transitionend` 之后再采 `duration` 毫秒就停，
 * 平时一帧都不会多。
 */
export function followTransitions(host: HTMLElement, run: () => void, duration = 260): () => void {
  let frame = 0;
  let until = 0;

  const tick = () => {
    run();
    frame = performance.now() < until ? requestAnimationFrame(tick) : 0;
  };

  const start = () => {
    until = performance.now() + duration;
    if (frame) return;
    frame = requestAnimationFrame(tick);
  };

  // transitionrun/start 覆盖动效开始，end/cancel 保证最后那一帧一定采到终点位置
  const events = [
    'transitionrun',
    'transitionstart',
    'transitionend',
    'transitioncancel',
    'animationstart',
    'animationend',
  ] as const;
  for (const type of events) host.addEventListener(type, start, true);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    for (const type of events) host.removeEventListener(type, start, true);
  };
}

/** 最近的可滚动祖先（iframe 画布里是文档根 `html`；宿主侧是 `.canvasStage`） */
export function nearestScroller(element: HTMLElement): HTMLElement | null {
  // getComputedStyle 必须取元素自己 realm 的：跨 frame 传宿主的函数可能不被接受
  const styleOf = (el: Element): CSSStyleDeclaration =>
    (el.ownerDocument.defaultView ?? globalThis.window).getComputedStyle(el);
  let current = element.parentElement;
  while (current) {
    const { overflowY, overflowX } = styleOf(current);
    const scrollableY = /(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight;
    const scrollableX = /(auto|scroll)/.test(overflowX) && current.scrollWidth > current.clientWidth;
    if (scrollableY || scrollableX) return current;
    current = current.parentElement;
  }
  return null;
}
