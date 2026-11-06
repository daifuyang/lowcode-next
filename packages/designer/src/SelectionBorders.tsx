import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { DocumentImpl } from '@lowcode-next/model';
import { followTransitions, nearestScroller, rectToHost } from './dom';
import styles from './SelectionBorders.module.css';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionBordersProps {
  document: DocumentImpl;
  /**
   * 边框层的定位原点（宿主文档里的 overlay 容器，盖在 iframe 画布上）。
   * 框的坐标相对它计算。
   */
  overlayRef: RefObject<HTMLDivElement | null>;
  /** 画布根元素（iframe 文档里），节点从这里反查 */
  getCanvas: () => HTMLElement | null;
  /** 画布 iframe 元素：跨 frame 坐标换算用 */
  getFrame: () => HTMLIFrameElement | null;
  /**
   * 画布 iframe 的加载计数。canvas 根要等 load 才查得到 —— 初次挂载时 effect
   * 会因拿不到画布而早退，**这个计数变化时必须重挂**，否则选中/悬停框永远出不来。
   */
  frameReady: number;
}

/**
 * 画布的选中 / 悬停边框（对齐 lowcode 的 `bem-tools/border-selecting.tsx`）。
 *
 * **为什么不用 outline**：outline 画在元素的外侧，而画布容器 `.canvas` 为了裁圆角
 * 是 `overflow: hidden`。页面根节点、导航栏顶部这些贴着画布边缘的节点，框线会被
 * 整条切掉 —— 表现就是"点了，状态栏也显示已选，但画布上什么都没有"。
 *
 * lowcode 的做法是画一层独立的边框元素：
 *
 * ```
 * .lc-borders { position: absolute; pointer-events: none; z-index: 1;
 *               border: 1px solid; box-sizing: border-box; }
 * .lc-borders-detecting { border-style: dashed; background: rgba(0,121,242,.04); }
 * .lc-borders-selecting { z-index: 2; border-width: 2px; }
 * ```
 *
 * 边框画在自己盒子**内部**（`box-sizing: border-box`），尺寸又等于目标元素，
 * 所以祖先怎么裁都裁不到它，也不会被目标元素的子节点盖住。
 *
 * 悬停包含根节点的容器（「页面」自己）时引擎也不画真实矩形，改画**可视区**的框
 * （border-detecting.tsx 的 `current.contains(focusNode)` 分支）—— 整页高的巨框
 * 上下边都在视口外，肉眼只剩一条竖线，等于没画。这里照搬该分支，并与真实矩形
 * 取交集：页面比视口矮时仍然画它自己的框。
 *
 * 尺寸走 `transform: translate3d() + width/height`，与引擎一致 —— 只动合成层，
 * 每帧不触发重排。
 */
export function SelectionBorders({ document: doc, overlayRef, getCanvas, getFrame, frameReady }: SelectionBordersProps) {
  const selectedId = doc.selection.selectedId;
  const hoveredId = doc.selection.hoverId;

  const [selected, setSelected] = useState<Box | null>(null);
  const [hovered, setHovered] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const host = overlayRef.current;
    const canvas = getCanvas();
    if (!host || !canvas) {
      setSelected(null);
      setHovered(null);
      return;
    }
    const frame = getFrame();

    const query = (id: string | null): HTMLElement | null => {
      if (!id) return null;
      const el = canvas.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
      // **不能写 `el instanceof HTMLElement`**：元素属于 iframe 的 realm，那里面的
      // HTMLElement 构造函数和宿主的不是同一个，instanceof 恒为 false ——
      // 框就永远画不出来。同源 frame 里直接用即可。
      return (el as HTMLElement) ?? null;
    };

    // 只读布局，不写 DOM：rAF 里量、比较、值不变就不 setState，避免自触发循环
    const sync = () => {
      const overlayRect = host.getBoundingClientRect();
      const measure = (el: HTMLElement | null): Box | null => {
        // 0×0 说明元素刚被 React 换掉、还没挂上去（或 display:none），当作没选中，
        // 否则会留下一个"有 data-border 但看不见"的空框
        if (!el || !el.isConnected) return null;
        // 节点在 iframe 文档里量出来的是 frame 视口坐标，先换算到宿主视口，
        // 再减 overlay 原点得到层内坐标
        const rect = rectToHost(el.getBoundingClientRect(), frame);
        if (rect.width === 0 && rect.height === 0) return null;
        return {
          x: rect.x - overlayRect.left,
          y: rect.y - overlayRect.top,
          w: rect.width,
          h: rect.height,
        };
      };

      // **每次都重新查一次 DOM**：换选中时 effect 会重跑，但「选中没变、元素被重建」
      // 的情况（属性面板改样式触发组件重挂、撤销后整棵子树重渲染）不会重跑 effect。
      // 抓死的元素引用这时已经脱离文档，量出来是 0×0 —— 表现就是"有时候选中框没了"。
      const selectedEl = query(selectedId);
      const hoveredEl = query(hoveredId);
      const nextSelected = measure(selectedEl);
      // 选中元素同时也是 hover 元素时只画选中框，避免两条线叠在一起
      let nextHovered = hoveredEl && hoveredEl !== selectedEl ? measure(hoveredEl) : null;

      // 悬停的节点包含根节点（就是「页面」自己）时，真实矩形是一整幅页面的巨框：
      // 上下边在视口之外、左边被浮动面板盖住，只剩一条右侧竖线 —— 等于没画。
      // 对齐引擎 border-detecting 的 `current.contains(focusNode)` 分支：这种节点
      // 直接画**可视区**的虚线框，滚动时框永远贴着画布可视边缘，一眼能认出"悬停的是页面"。
      // 引擎无条件画满视口；这里和真实矩形取交集 —— 页面比视口矮时仍然画它自己的框。
      if (nextHovered) {
        const rootEl = query(doc.root.id);
        if (rootEl && hoveredEl!.contains(rootEl)) {
          // 画布滚动发生在 iframe 文档里（html 是滚动容器），可视区矩形要先换算到
          // 宿主坐标才能与浮动面板（宿主元素）比较
          const scroller = nearestScroller(canvas);
          const viewRaw = scroller?.getBoundingClientRect();
          const view = viewRaw ? rectToHost(viewRaw, frame) : null;
          if (view) {
            // 浮动面板压在画布左缘上，框画在它底下等于没画（引擎的悬浮 dock 同样
            // 有这个重叠）。把 `[data-lc-overlay]` 占掉的横向区域从可视区里扣掉，
            // 框贴着"真正看得见的画布"画。
            let viewLeft = view.x;
            let viewRight = view.x + view.width;
            for (const overlay of globalThis.document.querySelectorAll('[data-lc-overlay]')) {
              const or = overlay.getBoundingClientRect();
              if (or.bottom <= view.y || or.top >= view.y + view.height) continue;
              if (or.left <= viewLeft && or.right > viewLeft) {
                viewLeft = Math.min(or.right, viewRight);
              } else if (or.right >= viewRight && or.left < viewRight) {
                viewRight = Math.max(or.left, viewLeft);
              }
            }
            const left = Math.max(nextHovered.x, viewLeft - overlayRect.left);
            const top = Math.max(nextHovered.y, view.y - overlayRect.top);
            const right = Math.min(nextHovered.x + nextHovered.w, viewRight - overlayRect.left);
            const bottom = Math.min(nextHovered.y + nextHovered.h, view.y + view.height - overlayRect.top);
            if (right > left && bottom > top) {
              nextHovered = { x: left, y: top, w: right - left, h: bottom - top };
            }
          }
        }
      }

      // **贴画布裁剪边的框线往里收 1px。**
      // 描边画在盒子内部（border-box），框贴着 `.canvas`（overflow: hidden）边缘时，
      // 那条线正好落在合成层的最后一像素上 —— 真 Chrome 的 GPU 栅格化会把它整条
      // 切掉（实测：左边那条在、右边那条消失，取决于图层设备尺寸的小数部分；
      // 无头 / 软件渲染不复现，所以自动化测试测不出来）。收 1px 肉眼无感，
      // 但描边有了整像素的容身之处。只收「贴边」的边，画布中间的框保持像素对齐。
      const clipRect = host.parentElement?.getBoundingClientRect();
      const fitInsideClip = (box: Box): Box => {
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

      const fittedSelected = nextSelected ? fitInsideClip(nextSelected) : null;
      const fittedHovered = nextHovered ? fitInsideClip(nextHovered) : null;
      setSelected((prev) => (sameBox(prev, fittedSelected) ? prev : fittedSelected));
      setHovered((prev) => (sameBox(prev, fittedHovered) ? prev : fittedHovered));
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };

    // 先**同步**量一次：换选中/悬停要在这一帧就画对。
    // 留到 rAF 会慢一帧，而工具条是同步定位的，两者错开就是"框追着工具条跑"的闪。
    // 后续的位置变化（滚动、结构变更）仍然走 rAF 合并。
    sync();

    const selectedEl = query(selectedId);
    const hoveredEl = query(hoveredId);

    // 尺寸变化：容器被挤压、元素自己变高（换行、图片加载）
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    resize.observe(canvas);
    if (selectedEl) resize.observe(selectedEl);
    if (hoveredEl && hoveredEl !== selectedEl) resize.observe(hoveredEl);

    // 结构 / 类名变化：拖拽重排、属性面板改样式都会改变位置
    const mutate = new MutationObserver((records) => {
      // 自己这层的 style 变化不算 —— 否则 sync → setState → 改 style → 再 sync
      const outside = records.some((record) => {
        const target = record.target;
        return !(target instanceof Element && target.closest(`.${styles.borders}`));
      });
      if (outside) schedule();
    });
    mutate.observe(canvas, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    // 画布滚动有两层：宿主的 stage（横向）+ iframe 文档自己的滚动条。
    // scroll 不冒泡，只能捕获；frame 内的滚动宿主文档收不到，必须单独挂。
    const canvasDoc = canvas.ownerDocument;
    globalThis.addEventListener('resize', schedule);
    globalThis.addEventListener('scroll', schedule, true);
    canvasDoc.addEventListener('scroll', schedule, true);

    // 物料自己的 hover 动效会让节点连续位移（.lc-feature:hover 上浮 2px）。
    // 那既不是 scroll 也不是 resize，更不改属性 —— 上面三个触发器全哑，
    // 框就会停在动效开始的位置，和节点差 2px（"背景没跟上"就是这么来的）。
    const stopFollow = followTransitions(canvas, sync);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      stopFollow();
      resize.disconnect();
      mutate.disconnect();
      globalThis.removeEventListener('resize', schedule);
      globalThis.removeEventListener('scroll', schedule, true);
      canvasDoc.removeEventListener('scroll', schedule, true);
    };
  }, [doc, overlayRef, getCanvas, getFrame, frameReady, selectedId, hoveredId]);

  if (!selected && !hovered) return null;

  return (
    <div className={styles.borders} aria-hidden="true">
      {hovered ? (
        <div
          className={`${styles.border} ${styles.detecting}`}
          style={boxStyle(hovered)}
          data-border="detecting"
        />
      ) : null}
      {selected ? (
        <div
          className={`${styles.border} ${styles.selecting}`}
          style={boxStyle(selected)}
          data-border="selecting"
        />
      ) : null}
    </div>
  );
}

function boxStyle(box: Box) {
  return {
    width: box.w,
    height: box.h,
    transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
  };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
