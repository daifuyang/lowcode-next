import { containsPoint } from './geometry';
import type { Point } from './types';

export interface AutoScrollOptions {
  /** 触发边缘宽度，默认 48 */
  edge?: number;
  /** 单帧最大位移，默认 20 */
  maxSpeed?: number;
}

/**
 * 边缘自动滚动（DESIGN-v1 §6.7）。
 *
 * 没有它，画布一旦超过一屏，视口外的区域就永远拖不到 —— 这不是体验问题，是功能缺失。
 * 速度用二次曲线：越靠边越快，靠近边界时保底 1px，避免"贴边了却不动"。
 */
export class AutoScroller {
  private readonly edge: number;
  private readonly maxSpeed: number;

  constructor(options: AutoScrollOptions = {}) {
    this.edge = options.edge ?? 48;
    this.maxSpeed = options.maxSpeed ?? 20;
  }

  /** 返回是否真的发生了滚动（调用方据此决定要不要重算几何） */
  update(point: Point, containers: HTMLElement[]): boolean {
    let scrolled = false;

    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (!containsPoint(rect, point)) continue;

      const deltaY = speedOf(point.y, rect.y, rect.y + rect.height, this.edge, this.maxSpeed);
      const deltaX = speedOf(point.x, rect.x, rect.x + rect.width, this.edge, this.maxSpeed);
      if (deltaY === 0 && deltaX === 0) continue;

      const previousTop = container.scrollTop;
      const previousLeft = container.scrollLeft;
      if (deltaY !== 0) container.scrollTop = previousTop + deltaY;
      if (deltaX !== 0) container.scrollLeft = previousLeft + deltaX;

      if (container.scrollTop !== previousTop || container.scrollLeft !== previousLeft) {
        scrolled = true;
      }
    }

    return scrolled;
  }
}

/** 指针在某条轴上距两端边缘的位移速度；0 表示不该滚 */
function speedOf(
  position: number,
  start: number,
  end: number,
  edge: number,
  maxSpeed: number,
): number {
  const distanceFromStart = position - start;
  const distanceFromEnd = end - position;

  if (distanceFromStart >= 0 && distanceFromStart < edge) {
    return -ramp(distanceFromStart, edge, maxSpeed);
  }
  if (distanceFromEnd >= 0 && distanceFromEnd < edge) {
    return ramp(distanceFromEnd, edge, maxSpeed);
  }
  return 0;
}

function ramp(distance: number, edge: number, maxSpeed: number): number {
  const ratio = 1 - distance / edge;
  return Math.max(1, Math.round(maxSpeed * ratio * ratio));
}

/**
 * 找出指针位置相关的可滚动祖先。
 *
 * 只收真正能滚的（overflow auto/scroll 且 scrollHeight 超出），
 * 否则每帧对一堆静态容器调 scrollTop 是在白烧帧预算。
 */
export function findScrollableAncestors(
  source: Element | null,
  doc: Document,
): HTMLElement[] {
  const output: HTMLElement[] = [];

  let current = source?.parentElement ?? null;
  while (current) {
    if (isScrollable(current)) output.push(current);
    current = current.parentElement;
  }

  const scrollingElement = doc.scrollingElement;
  // 不能用 instanceof HTMLElement：doc 可能是 iframe 的文档，那个 realm 的
  // HTMLElement 和宿主的不是同一个构造函数，instanceof 恒为 false
  if (scrollingElement && isScrollable(scrollingElement as HTMLElement)) {
    output.push(scrollingElement as HTMLElement);
  }

  return output;
}

function isScrollable(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;

  const style = view.getComputedStyle(element);
  const scrollableY = /(auto|scroll|overlay)/.test(style.overflowY);
  const scrollableX = /(auto|scroll|overlay)/.test(style.overflowX);

  return (
    (scrollableY && element.scrollHeight > element.clientHeight) ||
    (scrollableX && element.scrollWidth > element.clientWidth)
  );
}
