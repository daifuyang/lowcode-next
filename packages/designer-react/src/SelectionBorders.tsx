import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DocumentImpl } from '@lowcode-next/model';
import { computeSelectionBoxes, findNodeElement, followTransitions } from '@lowcode-next/designer-core';
import type { BorderBox } from '@lowcode-next/designer-core';
import styles from '@lowcode-next/designer-ui/SelectionBorders.module.css';

/**
 * 画布的选中 / 悬停边框（对齐 lowcode 的 `bem-tools/border-selecting.tsx`）。
 *
 * **为什么不用 outline**：outline 画在元素的外侧，而画布容器 `.canvas` 为了裁圆角
 * 是 `overflow: hidden`。页面根节点、导航栏顶部这些贴着画布边缘的节点，框线会被
 * 整条切掉 —— 表现就是"点了，状态栏也显示已选，但画布上什么都没有"。
 *
 * lowcode 的做法是画一层独立的边框元素（`box-sizing: border-box`，画在自己盒子内部），
 * 于是祖先怎么裁都裁不到它，也不会被目标元素的子节点盖住。尺寸走
 * `transform: translate3d() + width/height`，只动合成层，每帧不触发重排。
 *
 * **几何计算不在这个文件**：量矩形、换算坐标、扣浮层遮挡、贴边收 1px 全是
 * `@lowcode-next/designer-core` 的 `computeSelectionBoxes()` —— Vue 版调同一个函数，
 * 所以两版框位置不可能漂。这里只负责「什么时候跑」和「把结果写进 DOM」。
 */

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

export function SelectionBorders({
  document: doc,
  overlayRef,
  getCanvas,
  getFrame,
  frameReady,
}: SelectionBordersProps) {
  const selectedId = doc.selection.selectedId;
  const hoveredId = doc.selection.hoverId;

  const [selected, setSelected] = useState<BorderBox | null>(null);
  const [hovered, setHovered] = useState<BorderBox | null>(null);
  // 滚动时要能绕过 React 直接改 style（见下面 onScroll 的说明）
  const selectedElRef = useRef<HTMLDivElement | null>(null);
  const hoveredElRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = overlayRef.current;
    const canvas = getCanvas();
    if (!host || !canvas) {
      setSelected(null);
      setHovered(null);
      return;
    }
    const frame = getFrame();

    // 只读布局，不写 DOM：rAF 里量、比较、值不变就不 setState，避免自触发循环
    const sync = () => {
      const boxes = computeSelectionBoxes({
        overlay: host,
        canvas,
        frame,
        rootId: doc.root.id,
        selectedId,
        hoveredId,
        // 画布容器（`.canvas`，overflow: hidden）：贴边的框线往里收 1px
        clip: host.parentElement,
      });

      // 先直接写 DOM，再同步 state。滚动路径靠这一步做到「同一帧」：
      // 只走 setState 的话，React 的渲染/提交要排到本帧绘制之后，框就慢内容一帧。
      // state 仍要更新，否则下次任何一次重渲染都会用旧值把这里写的 style 盖回去。
      writeBox(selectedElRef.current, boxes.selected);
      writeBox(hoveredElRef.current, boxes.hovered);
      setSelected((prev) => (sameBox(prev, boxes.selected) ? prev : boxes.selected));
      setHovered((prev) => (sameBox(prev, boxes.hovered) ? prev : boxes.hovered));
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

    const selectedEl = findNodeElement(canvas, selectedId);
    const hoveredEl = findNodeElement(canvas, hoveredId);

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
    //
    // **滚动必须同步跟进，不能过 rAF**：内容在 iframe 的合成层里已经滚完并绘制，
    // 而边框层画在宿主文档里。原来的 scroll → rAF → sync 链路要等下一帧才写
    // transform，实测每帧滚 10px 时框恒差 10px（整整慢一帧）；滚轮步长忽大忽小
    // （惯性）时这个差值来回变，肉眼就是"虚线框抖得厉害"。
    const canvasDoc = canvas.ownerDocument;
    const onScroll = () => sync();
    globalThis.addEventListener('resize', schedule);
    globalThis.addEventListener('scroll', onScroll, true);
    canvasDoc.addEventListener('scroll', onScroll, true);

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
      globalThis.removeEventListener('scroll', onScroll, true);
      canvasDoc.removeEventListener('scroll', onScroll, true);
    };
  }, [doc, overlayRef, getCanvas, getFrame, frameReady, selectedId, hoveredId]);

  if (!selected && !hovered) return null;

  return (
    <div className={styles.borders} aria-hidden="true">
      {hovered ? (
        <div
          ref={hoveredElRef}
          className={`${styles.border} ${styles.detecting}`}
          style={boxStyle(hovered)}
          data-border="detecting"
        />
      ) : null}
      {selected ? (
        <div
          ref={selectedElRef}
          className={`${styles.border} ${styles.selecting}`}
          style={boxStyle(selected)}
          data-border="selecting"
        />
      ) : null}
    </div>
  );
}

/** 不经过 React 直接把量到的矩形写进边框层（滚动同帧同步用） */
function writeBox(el: HTMLDivElement | null, box: BorderBox | null) {
  if (!el || !box) return;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
  el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
}

function boxStyle(box: BorderBox) {
  return {
    width: box.w,
    height: box.h,
    transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
  };
}

function sameBox(a: BorderBox | null, b: BorderBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
