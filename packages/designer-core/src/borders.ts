import type { Rect } from '@lowcode-next/drag';

import { frameOrigin, nearestScroller, rectToHost } from './dom';

/**
 * 选中 / 悬停框的几何（DESIGN-v1 §12.13.2）。
 *
 * 这段逻辑原来是 `SelectionBorders.tsx` 的 effect 主体：量 iframe 里的节点矩形、
 * 换算到宿主坐标、扣掉浮层遮挡、贴裁剪边收 1px。**它是规则，不是视图** ——
 * React 版与 Vue 版必须算出**逐像素相同**的框，所以放在 core 里只写一份。
 *
 * 视图层只负责三件事：什么时候跑（effect / watch + 观察者）、把结果写进 DOM、
 * 渲染边框元素。任何「怎么算」的改动都改这里。
 */

export interface BorderBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionBoxes {
  selected: BorderBox | null;
  hovered: BorderBox | null;
}

export interface SelectionBoxInput {
  /** 边框层的定位原点（宿主文档里盖在 iframe 上的 overlay 容器） */
  overlay: HTMLElement;
  /** 画布根元素（iframe 文档里的 `[data-lc-canvas]`） */
  canvas: HTMLElement;
  /** 画布 iframe：跨 frame 坐标换算用 */
  frame: HTMLIFrameElement | null;
  /** 页面根节点 id（判断"悬停的是页面自己"） */
  rootId: string;
  selectedId: string | null;
  hoveredId: string | null;
  /**
   * 画布容器（宿主里的 `.canvas`，`overflow: hidden`）。贴边的框线往里收 1px，
   * 否则描边落在合成层最后一像素上会被 GPU 栅格化切掉（见下方 fitInsideClip）。
   */
  clip?: HTMLElement | null;
  /** 浮层选择器：这些元素压在画布上，画"可视区"框时要把它们的横向范围扣掉 */
  overlaySelector?: string;
}

/** 在画布文档里按 `data-node-id` 反查元素（不认框架，§5.4 / D8） */
export function findNodeElement(canvas: HTMLElement, id: string | null): HTMLElement | null {
  if (!id) return null;
  const element = canvas.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
  // **不能写 `el instanceof HTMLElement`**：元素属于 iframe 的 realm，那里面的
  // HTMLElement 构造函数和宿主的不是同一个，instanceof 恒为 false —— 框就永远画不出来。
  return (element as HTMLElement | null) ?? null;
}

export function computeSelectionBoxes(input: SelectionBoxInput): SelectionBoxes {
  const { overlay, canvas, frame, rootId, selectedId, hoveredId } = input;
  const overlaySelector = input.overlaySelector ?? '[data-lc-overlay]';

  const overlayRect = overlay.getBoundingClientRect();
  const measure = (element: HTMLElement | null): BorderBox | null => {
    // 0×0 说明元素刚被视图层换掉、还没挂上去（或 display:none），当作没选中，
    // 否则会留下一个"有 data-border 但看不见"的空框
    if (!element || !element.isConnected) return null;
    // 节点在 iframe 文档里量出来的是 frame 视口坐标，先换算到宿主视口，
    // 再减 overlay 原点得到层内坐标
    const rect = rectToHost(element.getBoundingClientRect(), frame);
    if (rect.width === 0 && rect.height === 0) return null;
    return {
      x: rect.x - overlayRect.left,
      y: rect.y - overlayRect.top,
      w: rect.width,
      h: rect.height,
    };
  };

  // **每次都重新查一次 DOM**：换选中时会重跑，但「选中没变、元素被重建」的情况
  // （属性面板改样式触发组件重挂、撤销后整棵子树重渲染）不会重跑 —— 抓死的元素
  // 引用这时已经脱离文档，量出来是 0×0，表现就是"有时候选中框没了"。
  const selectedEl = findNodeElement(canvas, selectedId);
  const hoveredEl = findNodeElement(canvas, hoveredId);
  const selected = measure(selectedEl);
  // 选中元素同时也是 hover 元素时只画选中框，避免两条线叠在一起
  let hovered = hoveredEl && hoveredEl !== selectedEl ? measure(hoveredEl) : null;

  // 悬停的节点包含根节点（就是「页面」自己）时，真实矩形是一整幅页面的巨框：
  // 上下边在视口之外、左边被浮动面板盖住，只剩一条右侧竖线 —— 等于没画。
  // 对齐引擎 border-detecting 的 `current.contains(focusNode)` 分支：这种节点
  // 直接画**可视区**的虚线框。引擎无条件画满视口；这里和真实矩形取交集 ——
  // 页面比视口矮时仍然画它自己的框。
  if (hovered) {
    const rootEl = findNodeElement(canvas, rootId);
    if (rootEl && hoveredEl!.contains(rootEl)) {
      // 画布滚动发生在 iframe 文档里（html 是滚动容器），可视区矩形要先换算到
      // 宿主坐标才能与浮动面板（宿主元素）比较
      const scroller = nearestScroller(canvas);
      const viewRaw = scroller?.getBoundingClientRect();
      const view = viewRaw ? rectToHost(viewRaw, frame) : null;
      if (view) {
        // 浮动面板压在画布左缘上，框画在它底下等于没画（引擎的悬浮 dock 同样
        // 有这个重叠）。把 `[data-lc-overlay]` 占掉的横向区域从可视区里扣掉。
        let viewLeft = view.x;
        let viewRight = view.x + view.width;
        for (const el of globalThis.document.querySelectorAll(overlaySelector)) {
          const or = el.getBoundingClientRect();
          if (or.bottom <= view.y || or.top >= view.y + view.height) continue;
          if (or.left <= viewLeft && or.right > viewLeft) {
            viewLeft = Math.min(or.right, viewRight);
          } else if (or.right >= viewRight && or.left < viewRight) {
            viewRight = Math.max(or.left, viewLeft);
          }
        }
        const left = Math.max(hovered.x, viewLeft - overlayRect.left);
        const top = Math.max(hovered.y, view.y - overlayRect.top);
        const right = Math.min(hovered.x + hovered.w, viewRight - overlayRect.left);
        const bottom = Math.min(hovered.y + hovered.h, view.y + view.height - overlayRect.top);
        if (right > left && bottom > top) {
          hovered = { x: left, y: top, w: right - left, h: bottom - top };
        }
      }
    }
  }

  const clipRect = input.clip?.getBoundingClientRect();
  const fitInsideClip = (box: BorderBox): BorderBox => {
    if (!clipRect) return box;
    const clipLeft = clipRect.left - overlayRect.left;
    const clipRight = clipRect.right - overlayRect.left;
    const clipTop = clipRect.top - overlayRect.top;
    const clipBottom = clipRect.bottom - overlayRect.top;
    let { x, y, w, h } = box;
    if (Math.abs(x - clipLeft) < 0.75) {
      x += 1;
      w -= 1;
    }
    if (Math.abs(x + w - clipRight) < 0.75) w -= 1;
    if (Math.abs(y - clipTop) < 0.75) {
      y += 1;
      h -= 1;
    }
    if (Math.abs(y + h - clipBottom) < 0.75) h -= 1;
    return { x, y, w, h };
  };

  return {
    selected: selected ? fitInsideClip(selected) : null,
    hovered: hovered ? fitInsideClip(hovered) : null,
  };
}

export interface FloatAnchor {
  /** 画布可视矩形（宿主坐标）：工具条只在这个范围内落位 */
  canvasView: Rect | null;
  /** 选中节点的矩形（宿主坐标）；节点不在文档里时为 null */
  anchor: Rect | null;
}

/**
 * 浮动工具条的锚点测量。
 *
 * 抽出来的理由和选中框一样：工具条的位置（以及"滚出视野就整体不画"）
 * 必须是两版一致的规则；视图只需要把 `placeFloatBar` / `placePopup` 的结果
 * 写进 style。
 */
export function measureFloatAnchor(input: {
  canvas: HTMLElement | null;
  frame: HTMLIFrameElement | null;
  rootId: string;
  selectedId: string | null;
}): FloatAnchor {
  const { canvas, frame, rootId, selectedId } = input;

  // 画布可视区 = iframe 自己的视口（画布滚动发生在 iframe 文档里），
  // 矩形在 frame 坐标系里量的，先换算成宿主坐标再参与落位
  const viewRaw = canvas ? nearestScroller(canvas)?.getBoundingClientRect() : null;
  const view = viewRaw ? rectToHost(viewRaw, frame) : null;
  const canvasView: Rect | null = view
    ? { x: view.x, y: view.y, width: view.width, height: view.height }
    : null;

  if (!canvas || !selectedId || selectedId === rootId) return { canvasView, anchor: null };
  const element = findNodeElement(canvas, selectedId);
  if (!element) return { canvasView, anchor: null };

  const rect = rectToHost(element.getBoundingClientRect(), frame);
  return { canvasView, anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
}

/** iframe 视口原点：跨 frame 定位（fixed 层）也会用到，转出去省得调用方再找 dom */
export { frameOrigin };
