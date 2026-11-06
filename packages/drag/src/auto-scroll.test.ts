import { describe, expect, it } from 'vitest';
import { AutoScroller } from './auto-scroll';
import type { Point } from './types';

/** 用普通对象冒充滚动容器，只提供 AutoScroller 真正读写的三个成员 */
function fakeContainer(rect: { x: number; y: number; width: number; height: number }) {
  return {
    scrollTop: 100,
    scrollLeft: 100,
    getBoundingClientRect: () => ({ ...rect, top: rect.y, left: rect.x, right: rect.x + rect.width, bottom: rect.y + rect.height }),
  } as unknown as HTMLElement & { scrollTop: number; scrollLeft: number };
}

const viewport = { x: 0, y: 0, width: 600, height: 400 };

describe('AutoScroller', () => {
  it('指针在容器中央不滚动', () => {
    const container = fakeContainer(viewport);
    const scroller = new AutoScroller();

    expect(scroller.update({ x: 300, y: 200 }, [container])).toBe(false);
    expect(container.scrollTop).toBe(100);
  });

  it('靠近下边缘向下滚', () => {
    const container = fakeContainer(viewport);
    const scroller = new AutoScroller();

    expect(scroller.update({ x: 300, y: 390 }, [container])).toBe(true);
    expect(container.scrollTop).toBeGreaterThan(100);
  });

  it('靠近上边缘向上滚', () => {
    const container = fakeContainer(viewport);
    const scroller = new AutoScroller();

    expect(scroller.update({ x: 300, y: 10 }, [container])).toBe(true);
    expect(container.scrollTop).toBeLessThan(100);
  });

  it('靠近右边缘向右滚', () => {
    const container = fakeContainer(viewport);
    const scroller = new AutoScroller();

    expect(scroller.update({ x: 595, y: 200 }, [container])).toBe(true);
    expect(container.scrollLeft).toBeGreaterThan(100);
  });

  it('指针在容器外完全不处理', () => {
    const container = fakeContainer(viewport);
    const scroller = new AutoScroller();

    expect(scroller.update({ x: 900, y: 900 }, [container])).toBe(false);
    expect(container.scrollTop).toBe(100);
  });

  it('越贴边滚得越快', () => {
    const near = fakeContainer(viewport);
    const far = fakeContainer(viewport);
    const scroller = new AutoScroller();

    scroller.update({ x: 300, y: 370 }, [far]);
    scroller.update({ x: 300, y: 399 }, [near]);

    expect(near.scrollTop - 100).toBeGreaterThan(far.scrollTop - 100);
  });

  it('单帧位移不超过 maxSpeed', () => {
    const container = fakeContainer(viewport);
    const scroller = new AutoScroller({ maxSpeed: 12 });
    const point: Point = { x: 300, y: 399 };

    scroller.update(point, [container]);
    expect(container.scrollTop - 100).toBeLessThanOrEqual(12);
  });
});
