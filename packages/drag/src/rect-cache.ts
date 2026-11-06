import { toRect } from './geometry';
import type { Rect } from './types';

/**
 * 矩形缓存（DESIGN-v1 §6.3 / D11）。
 *
 * 低代码引擎普遍在每次 pointermove 对所有子节点调 getBoundingClientRect，
 * 那是强制同步布局。这里改成 dragstart 采集一次 + 失效后整批重建。
 *
 * 失效来源有四路：滚动、resize、ResizeObserver、MutationObserver。
 * 少了后两个，图片/字体加载完成、内容撑开、节点增删都会让落点默默偏移，
 * 而且没有任何报错——这类偏差最难排查。
 */
export class RectCache {
  private map = new Map<string, Rect>();
  private root: HTMLElement | null = null;
  private dirty = false;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  prime(root: HTMLElement): void {
    this.root = root;
    this.observe(root);
    this.rebuild();
  }

  /** 命中缓存；脏了先整批重建一次，避免逐个 get 触发 N 次强制布局 */
  get(id: string): Rect | null {
    if (this.dirty) this.rebuild();

    const cached = this.map.get(id);
    if (cached) return cached;

    const element = this.elementOf(id);
    if (!element) return null;

    const rect = toRect(element.getBoundingClientRect());
    this.map.set(id, rect);
    return rect;
  }

  /** 只标脏，真正重建推迟到下一次 get（拖拽中可能连续触发多次失效） */
  invalidate(): void {
    this.dirty = true;
  }

  dispose(): void {
    this.disconnect();
    this.map.clear();
    this.root = null;
  }

  private rebuild(): void {
    this.dirty = false;
    this.map.clear();
    if (this.root) this.collect(this.root);
  }

  private collect(root: HTMLElement): void {
    for (const element of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
      const id = element.dataset.nodeId;
      if (id) this.map.set(id, toRect(element.getBoundingClientRect()));
    }
  }

  private elementOf(id: string): HTMLElement | null {
    if (!this.root) return null;
    return this.root.querySelector<HTMLElement>(`[data-node-id="${escapeAttr(id)}"]`);
  }

  private observe(root: HTMLElement): void {
    this.disconnect();

    const view = root.ownerDocument.defaultView;
    const ResizeObserverCtor = view?.ResizeObserver;
    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => this.invalidate());
      this.resizeObserver.observe(root);
    }

    const MutationObserverCtor = view?.MutationObserver;
    if (MutationObserverCtor) {
      this.mutationObserver = new MutationObserverCtor(() => this.invalidate());
      this.mutationObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
  }

  private disconnect(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
