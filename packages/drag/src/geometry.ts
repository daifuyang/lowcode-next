import type { Point, Rect } from './types';

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function isEmptyRect(rect: Rect): boolean {
  return rect.width <= 0 && rect.height <= 0;
}

/** 两个矩形在某一轴上的重叠长度 */
export function overlapLength(a: Rect, b: Rect, axis: 'x' | 'y'): number {
  if (axis === 'x') {
    return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  }
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** 点到矩形的最小距离（在矩形内为 0） */
export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** DOMRect → 纯 Rect，便于单测和缓存 */
export function toRect(domRect: DOMRect | { x: number; y: number; width: number; height: number }): Rect {
  return {
    x: domRect.x,
    y: domRect.y,
    width: domRect.width,
    height: domRect.height,
  };
}
