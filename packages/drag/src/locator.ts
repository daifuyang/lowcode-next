import { containsPoint, overlapLength } from './geometry';
import type { LocateInput, LocateResult, Rect } from './types';

/**
 * 纯几何定位：给定容器、有序子节点矩形和指针位置，回答"插到第几个"。
 *
 * 这里没有任何 DOM 调用，也没有任何模型概念（见 DESIGN-v1 §6.4 / D9）。
 * 主轴（横排还是竖排）由调用方从 CSS 判定后传进来 —— 只靠矩形推断在网格里
 * 必然失败（相邻行不重叠，见 inferAxis）；传 'auto' 时才退回几何推断。
 * 下钻与合法性判断不在这里做 —— 那是 DropContext 的职责（D12）。
 */
export function locate(input: LocateInput): LocateResult {
  const { point, container, children } = input;
  const axis = input.axis && input.axis !== 'auto' ? input.axis : inferAxis(children);
  const edge = input.edgeThreshold ?? 8;
  const count = children.length;

  // 规则 1：空容器 → 直接 inside
  if (count === 0) {
    return {
      index: 0,
      position: 'inside',
      axis,
      rect: container,
      containerRect: container,
    };
  }

  // 规则 2：命中某个子节点 → 判定插到它前面还是后面（引擎 host.ts 的 isNearAfter）
  const hit = children.findIndex((rect) => containsPoint(rect, point));
  if (hit >= 0) return towards(hit, children[hit]!);

  // 规则 3：贴着容器主轴边缘 → 强制首位 / 末尾
  if (axis === 'y') {
    if (point.y <= container.y + edge) return make(0, 'before');
    if (point.y >= container.y + container.height - edge) return make(count, 'after');
  } else {
    if (point.x <= container.x + edge) return make(0, 'before');
    if (point.x >= container.x + container.width - edge) return make(count, 'after');
  }

  // 规则 4：都不命中 → 取欧氏距离最近的子节点（引擎 distanceToRect）。
  // 只比主轴坐标的话，网格里指针落在两行之间时上下两行的卡片距离会打平，
  // 结果随机偏到上一行 —— 必须算二维距离。
  let nearest = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const distance = distanceToRect(point, children[i]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = i;
    }
  }
  return towards(nearest, children[nearest]!);

  function towards(index: number, rect: Rect): LocateResult {
    const isAfter = isNearAfter(point, rect, axis);
    return isAfter ? make(index + 1, 'after') : make(index, 'before');
  }

  function make(index: number, position: 'before' | 'after'): LocateResult {
    return {
      index,
      position,
      axis,
      rect: indicatorRect(index, position, axis, children),
      containerRect: container,
    };
  }
}

/**
 * 规则 5：由子节点矩形推断主轴。
 * 相邻子节点在垂直方向重叠超过一半 → 认为同一行，主轴为 x。
 * 只作 axis='auto' 时的兜底；正常拖拽由 DropContext 按 CSS 给轴。
 */
export function inferAxis(children: Rect[]): 'x' | 'y' {
  if (children.length < 2) return 'y';

  let horizontalPairs = 0;
  for (let i = 1; i < children.length; i += 1) {
    const prev = children[i - 1]!;
    const current = children[i]!;
    const minHeight = Math.min(prev.height, current.height);
    if (minHeight <= 0) continue;
    if (overlapLength(prev, current, 'y') / minHeight > 0.5) {
      horizontalPairs += 1;
    }
  }
  return horizontalPairs === children.length - 1 ? 'x' : 'y';
}

/**
 * 插入线贴着**目标旁边那个子节点**画，和引擎 `insertion.tsx` 一致：
 * 插到它前面就画它的上/左沿，插到它后面就画它的下/右沿，长度取它的高/宽。
 * 不拉满容器 —— 网格里拉满会画穿两行，看不出到底插在哪一格；
 * 也不锚到"下一个节点"的起始边 —— 元素之间有间距时线会跑到间距另一头去。
 */
function indicatorRect(
  index: number,
  position: 'before' | 'after',
  axis: 'x' | 'y',
  children: Rect[],
): Rect {
  // 引擎 insertion.less：4px 品牌色线，居中压在元素边上
  const thickness = 4;
  const count = children.length;
  // before → 插到 children[index] 前面；after → 插到 children[index - 1] 后面
  const anchorIndex = position === 'before' ? index : index - 1;
  const anchor = children[Math.min(Math.max(anchorIndex, 0), count - 1)]!;

  if (axis === 'y') {
    const y = position === 'before' ? anchor.y : bottomOf(anchor);
    return { x: anchor.x, y: y - thickness / 2, width: anchor.width, height: thickness };
  }
  const x = position === 'before' ? anchor.x : rightOf(anchor);
  return { x: x - thickness / 2, y: anchor.y, width: thickness, height: anchor.height };
}

/**
 * 插到前面还是后面 —— 直接照引擎 `isNearAfter`：
 * 横向比较"到左上角的曼哈顿距离"和"到右下角的曼哈顿距离"，纵向只比上下边距离。
 */
function isNearAfter(point: { x: number; y: number }, rect: Rect, axis: 'x' | 'y'): boolean {
  if (axis === 'x') {
    const toStart = Math.abs(point.x - rect.x) + Math.abs(point.y - rect.y);
    const toEnd = Math.abs(point.x - rightOf(rect)) + Math.abs(point.y - bottomOf(rect));
    return toStart > toEnd;
  }
  return Math.abs(point.y - rect.y) > Math.abs(point.y - bottomOf(rect));
}

/** 指针到矩形的欧氏距离，落在矩形内为 0（引擎 distanceToRect） */
function distanceToRect(point: { x: number; y: number }, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - rightOf(rect));
  const dy = Math.max(rect.y - point.y, 0, point.y - bottomOf(rect));
  return Math.hypot(dx, dy);
}

function bottomOf(rect: Rect): number {
  return rect.y + rect.height;
}

function rightOf(rect: Rect): number {
  return rect.x + rect.width;
}
