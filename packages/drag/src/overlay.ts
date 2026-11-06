import type { DragPayload, DropTarget, Point } from './types';

const Z_INDEX = '2147483000';

/**
 * 拖拽视觉层（DESIGN-v1 §6.6 / D13）。
 *
 * 独立于 React 的 DOM 层，全程直接写 style，不经过框架 state ——
 * 每次 pointermove 都调度 React 重渲染是低代码拖拽卡顿的常见根因。
 */
export class Overlay {
  private readonly doc: Document;
  private root: HTMLElement;
  private line: HTMLElement;
  private cover: HTMLElement;
  private ghost: HTMLElement | null = null;
  private ghostOffset: Point = { x: 0, y: 0 };

  constructor(doc: Document = document) {
    this.doc = doc;
    this.root = doc.createElement('div');
    this.root.setAttribute('data-lowcode-overlay', '');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: Z_INDEX,
      contain: 'strict',
    });

    this.cover = doc.createElement('div');
    Object.assign(this.cover.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      boxSizing: 'border-box',
      border: '1px solid #006cff',
      background: 'rgba(0, 108, 255, 0.06)',
      borderRadius: '3px',
      display: 'none',
      willChange: 'transform, width, height',
    });

    this.line = doc.createElement('div');
    Object.assign(this.line.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      background: '#006cff',
      borderRadius: '1px',
      boxShadow: '0 0 0 1px rgba(0, 108, 255, 0.25)',
      display: 'none',
      willChange: 'transform, width, height',
    });

    this.root.append(this.cover, this.line);
    doc.body.appendChild(this.root);
  }

  /** dragstart 时调用：node 克隆影像，material 降级为标签 chip */
  setGhost(payload: DragPayload, source: Element | null, point: Point): void {
    this.clearGhost();

    const ghost = this.doc.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      margin: '0',
      opacity: '0.72',
      pointerEvents: 'none',
      willChange: 'transform',
      filter: 'drop-shadow(0 8px 20px rgba(15, 23, 42, 0.18))',
      maxWidth: '320px',
    });

    if (payload.type === 'node' && source) {
      // 大子树整棵克隆会明显拖慢起拖，超过阈值只保留外框
      const deep = source.querySelectorAll('*').length <= 80;
      const cloned = source.cloneNode(deep) as HTMLElement;
      cloned.querySelectorAll('[data-node-id]').forEach((el) => {
        el.removeAttribute('data-node-id');
      });
      cloned.removeAttribute('data-node-id');
      cloned.style.margin = '0';
      cloned.style.pointerEvents = 'none';

      if (!deep) {
        const rect = source.getBoundingClientRect();
        Object.assign(cloned.style, {
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          boxSizing: 'border-box',
          background: 'rgba(238, 242, 255, 0.9)',
          border: '1px dashed #006cff',
        });
      }

      ghost.appendChild(cloned);

      const rect = source.getBoundingClientRect();
      this.ghostOffset = { x: point.x - rect.x, y: point.y - rect.y };
    } else {
      const rect = source?.getBoundingClientRect();
      this.ghostOffset = rect ? { x: point.x - rect.x, y: point.y - rect.y } : { x: 12, y: 12 };
      ghost.textContent = payload.type === 'material' ? payload.componentName : '节点';
      Object.assign(ghost.style, {
        padding: '6px 10px',
        borderRadius: '6px',
        background: '#1f2329',
        color: '#fff',
        fontSize: '12px',
        lineHeight: '18px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      });
    }

    this.ghost = ghost;
    this.root.appendChild(ghost);
    this.moveGhost(point);
  }

  moveGhost(point: Point): void {
    if (!this.ghost) return;
    const x = point.x - this.ghostOffset.x;
    const y = point.y - this.ghostOffset.y;
    this.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  update(target: DropTarget | null): void {
    if (!target) {
      this.hideIndicator();
      return;
    }

    const color = target.valid ? '#006cff' : '#ef4444';
    const accent = target.valid ? 'rgba(0, 108, 255, 0.06)' : 'rgba(239, 68, 68, 0.07)';

    if (target.position === 'inside') {
      this.place(this.cover, target.rect);
      this.cover.style.display = 'block';
      this.cover.style.borderColor = color;
      this.cover.style.background = accent;
      this.line.style.display = 'none';
      return;
    }

    this.cover.style.display = 'none';
    this.place(this.line, target.rect);
    this.line.style.display = 'block';
    this.line.style.background = color;
  }

  hide(): void {
    this.hideIndicator();
    this.clearGhost();
  }

  dispose(): void {
    this.clearGhost();
    this.root.remove();
  }

  private hideIndicator(): void {
    this.line.style.display = 'none';
    this.cover.style.display = 'none';
  }

  private place(el: HTMLElement, rect: { x: number; y: number; width: number; height: number }): void {
    el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
    el.style.width = `${Math.max(rect.width, 1)}px`;
    el.style.height = `${Math.max(rect.height, 1)}px`;
  }

  private clearGhost(): void {
    this.ghost?.remove();
    this.ghost = null;
  }
}
