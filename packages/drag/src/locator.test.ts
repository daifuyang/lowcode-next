import { describe, expect, it } from 'vitest';
import { inferAxis, locate } from './locator';
import type { Rect } from './types';

const container: Rect = { x: 0, y: 0, width: 300, height: 300 };

/** 竖向排列：三个 300×50 的行 */
const vertical: Rect[] = [
  { x: 0, y: 0, width: 300, height: 50 },
  { x: 0, y: 50, width: 300, height: 50 },
  { x: 0, y: 100, width: 300, height: 50 },
];

/** 横向排列：三个 100×40 的列 */
const horizontal: Rect[] = [
  { x: 0, y: 0, width: 100, height: 40 },
  { x: 100, y: 0, width: 100, height: 40 },
  { x: 200, y: 0, width: 100, height: 40 },
];

describe('locate', () => {
  it('空容器返回 inside', () => {
    const result = locate({ point: { x: 150, y: 150 }, container, children: [] });
    expect(result.position).toBe('inside');
    expect(result.index).toBe(0);
    expect(result.rect).toEqual(container);
  });

  it('命中子节点上半部分 → 插到它前面', () => {
    const result = locate({ point: { x: 150, y: 60 }, container, children: vertical });
    expect(result.index).toBe(1);
    expect(result.position).toBe('before');
    expect(result.axis).toBe('y');
  });

  it('命中子节点下半部分 → 插到它后面', () => {
    const result = locate({ point: { x: 150, y: 90 }, container, children: vertical });
    expect(result.index).toBe(2);
    expect(result.position).toBe('after');
  });

  it('靠近容器上边缘 → 强制首位', () => {
    const result = locate({ point: { x: 150, y: 3 }, container, children: vertical });
    expect(result.index).toBe(0);
    expect(result.position).toBe('before');
  });

  it('靠近容器下边缘 → 强制末尾', () => {
    const result = locate({ point: { x: 150, y: 298 }, container, children: vertical });
    expect(result.index).toBe(3);
    expect(result.position).toBe('after');
  });

  it('指针落在所有子节点之外 → 取主轴最近的一个', () => {
    // y=200 在最后一个子节点下方 100px 处
    const result = locate({ point: { x: 150, y: 200 }, container, children: vertical });
    expect(result.index).toBe(3);
    expect(result.position).toBe('after');
  });

  it('横向排列时主轴推断为 x', () => {
    const result = locate({ point: { x: 160, y: 20 }, container, children: horizontal });
    expect(result.axis).toBe('x');
    expect(result.index).toBe(2);
    expect(result.position).toBe('after');
  });

  it('竖向排列的指示线是横线', () => {
    const result = locate({ point: { x: 150, y: 90 }, container, children: vertical });
    expect(result.rect.width).toBe(300);
    expect(result.rect.height).toBe(4);
  });

  it('横向排列的指示线是竖线', () => {
    const result = locate({ point: { x: 160, y: 20 }, container, children: horizontal });
    expect(result.rect.width).toBe(4);
    // 竖线只跨目标那个子节点的高度（引擎 insertion.tsx：nearRect.height），
    // 不拉满容器 —— 网格里拉满会画穿两行，看不出插在哪一格
    expect(result.rect.height).toBe(40);
  });

  it('单子节点也按中点判定', () => {
    const single = [{ x: 0, y: 0, width: 300, height: 100 }];
    expect(locate({ point: { x: 10, y: 20 }, container, children: single }).position).toBe(
      'before',
    );
    expect(locate({ point: { x: 10, y: 80 }, container, children: single }).position).toBe(
      'after',
    );
  });
});

describe('inferAxis', () => {
  it('少于两个子节点默认纵向', () => {
    expect(inferAxis([])).toBe('y');
    expect(inferAxis([vertical[0]!])).toBe('y');
  });

  it('同一行 → x', () => {
    expect(inferAxis(horizontal)).toBe('x');
  });

  it('纵向堆叠 → y', () => {
    expect(inferAxis(vertical)).toBe('y');
  });

  it('混排（部分同行）→ 保守选 y', () => {
    const mixed: Rect[] = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 100, y: 0, width: 100, height: 40 },
      { x: 0, y: 40, width: 100, height: 40 },
    ];
    expect(inferAxis(mixed)).toBe('y');
  });
});
