import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

/** 悬停多久才出提示：比浏览器原生 title（约 1s）快，又不会被划过的指针触发 */
const SHOW_DELAY = 300;
/** 气泡与目标元素之间的空隙，正好放箭头 */
const GAP = 8;
/** 气泡与视口边缘的最小留白 */
const MARGIN = 8;

interface ActiveTip {
  text: string;
  /** 目标元素：滚动 / 尺寸变化时拿它重新量位置 */
  anchor: HTMLElement;
  rect: DOMRect;
}

interface Placement {
  left: number;
  top: number;
  side: 'top' | 'bottom';
  /** 箭头相对气泡左缘的位置（clamp 后气泡不居中于目标，箭头要单独对齐目标中心） */
  arrowX: number;
}

/**
 * 把整个设计器里的 `title` 属性接管成自绘 tooltip。
 *
 * 原生 title 有两个问题：延迟约 1s、样式跟着系统走（Windows 上是带阴影的黄色
 * 方块），和这里的灰白界面完全不搭。引擎用的是 `@alifd/next` 的深色 Balloon，
 * 这里照它的形态自绘：深色半透明底、12px 白字、圆角 4、带小箭头。
 *
 * **不逐个改调用点**，而是在根上挂一个监听：指针进入带 `title` 的元素时把 title
 * 摘下来暂存（否则原生提示还会跟着弹），换成自己的气泡；离开时原样放回去。
 * 于是全项目 40 多处 `title=` 一次性升级，也不需要每个按钮包一层组件。
 */
export function TitleTooltip() {
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  /** 当前被接管了 title 的元素 */
  const anchorRef = useRef<HTMLElement | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 把暂存的 title 还回去（下次悬停还能再接管） */
  const restoreTitle = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const text = anchor.dataset.lcTipTitle;
    if (text) anchor.setAttribute('title', text);
    delete anchor.dataset.lcTipTitle;
    anchorRef.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    restoreTitle();
    setTip(null);
    setPlace(null);
  }, [clearTimer, restoreTitle]);

  /** 接管一个新目标的 title；顺带把上一个还回去 */
  const attach = useCallback(
    (anchor: HTMLElement) => {
      if (anchorRef.current === anchor) return;
      restoreTitle();
      setTip(null);
      setPlace(null);
      const text = anchor.getAttribute('title');
      if (!text || !text.trim()) return;
      anchor.dataset.lcTipTitle = text;
      anchor.removeAttribute('title');
      anchorRef.current = anchor;
    },
    [restoreTitle],
  );

  useEffect(() => {
    const reveal = (anchor: HTMLElement) => {
      const text = anchor.dataset.lcTipTitle;
      if (!text || !anchor.isConnected) return;
      setTip({ text, anchor, rect: anchor.getBoundingClientRect() });
    };

    const findAnchor = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      // 气泡本身也是 DOM 节点，指针划过它不算"换了目标"
      if (target.closest('[data-lc-tip]')) return null;
      return target.closest<HTMLElement>('[title]');
    };

    const onPointerOver = (event: PointerEvent) => {
      // 拖拽途中（按着键划过一堆按钮）不弹提示
      if (event.buttons !== 0) return;
      const anchor = findAnchor(event.target);
      if (!anchor || anchor === anchorRef.current) return;
      clearTimer();
      attach(anchor);
      if (!anchorRef.current) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        reveal(anchor);
      }, SHOW_DELAY);
    };

    const onPointerOut = (event: PointerEvent) => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      // 在目标内部挪动（图标 → 文字）不算离开
      const to = event.relatedTarget as Node | null;
      if (to && anchor.contains(to)) return;
      hide();
    };

    // 键盘 Tab 到按钮上时也提示（此时 title 已被摘掉，原生提示不会出来）
    const onFocusIn = (event: FocusEvent) => {
      const anchor = findAnchor(event.target);
      if (!anchor || anchor === anchorRef.current) return;
      clearTimer();
      attach(anchor);
      if (anchorRef.current) reveal(anchor);
    };

    const onFocusOut = (event: FocusEvent) => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const to = event.relatedTarget as Node | null;
      if (to && anchor.contains(to)) return;
      hide();
    };

    /** 滚动 / 缩放时气泡跟着目标走；目标已经不在文档里就直接收掉 */
    const reposition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      if (!anchor.isConnected) {
        hide();
        return;
      }
      setTip((prev) => (prev ? { ...prev, rect: anchor.getBoundingClientRect() } : prev));
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    // 点下去就收：提示属于"看着它"的场合，不属于"操作它"的场合
    document.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      // 卸载时只做 DOM 侧的收尾（把 title 还回去），不用再 setState
      clearTimer();
      restoreTitle();
    };
  }, [attach, clearTimer, hide, restoreTitle]);

  // 量出气泡尺寸再定位：默认贴下方，下面放不下且上面有地方就翻上去；
  // 水平居中于目标、clamp 进视口，箭头单独指回目标中心。
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!tip || !bubble) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const { rect } = tip;

    let side: Placement['side'] = 'bottom';
    let top = rect.bottom + GAP;
    if (top + height > vh - MARGIN) {
      if (rect.top - GAP - height >= MARGIN) {
        side = 'top';
        top = rect.top - GAP - height;
      } else {
        top = Math.max(MARGIN, vh - MARGIN - height);
      }
    }

    const centerX = rect.left + rect.width / 2;
    const left = Math.max(MARGIN, Math.min(centerX - width / 2, vw - width - MARGIN));
    setPlace({
      left,
      top,
      side,
      arrowX: Math.max(6, Math.min(centerX - left, width - 6)),
    });
  }, [tip]);

  if (!tip) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className={styles.bubble}
      data-lc-tip="bubble"
      data-side={place?.side ?? 'bottom'}
      role="tooltip"
      style={
        {
          left: place?.left ?? 0,
          top: place?.top ?? 0,
          // 首帧还没量到尺寸，先藏着，避免在左上角闪一下
          visibility: place ? 'visible' : 'hidden',
          '--tip-arrow-x': `${place?.arrowX ?? 12}px`,
        } as CSSProperties
      }
    >
      {tip.text}
    </div>,
    document.body,
  );
}
