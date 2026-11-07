<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  computeSelectionBoxes,
  findNodeElement,
  followTransitions,
} from '@lowcode-next/designer-core';
import type { BorderBox, SelectionBoxes } from '@lowcode-next/designer-core';
import styles from '@lowcode-next/designer-ui/SelectionBorders.module.css';

/**
 * 画布的选中 / 悬停边框（Vue 版）。
 *
 * **几何计算一个字都不在这里**：量矩形、换算跨 frame 坐标、扣浮层遮挡、贴边收
 * 1px 全在 core 的 `computeSelectionBoxes()`。这里只做 React 版同类的事：
 * 决定何时重算（选中/悬停/revision/load）、装配观察者、把结果写进 DOM。
 *
 * 两版因此不可能"框位置差 1px" —— 差只会差在触发时机上，而触发条件是同一组：
 * 布局同步量一次 + resize/mutation/scroll/transition 四路跟进。
 */
const props = defineProps<{
  rootId: string;
  selectedId: string | null;
  hoveredId: string | null;
  /** iframe 加载计数：canvas 根要等 load 才查得到 */
  frameReady: number;
  /** 文档 revision：结构变化时也要重量 */
  revision: number;
  getCanvas: () => HTMLElement | null;
  getFrame: () => HTMLIFrameElement | null;
  getOverlay: () => HTMLElement | null;
}>();

const boxes = ref<SelectionBoxes>({ selected: null, hovered: null });
const selectedEl = ref<HTMLDivElement | null>(null);
const hoveredEl = ref<HTMLDivElement | null>(null);

let cleanup: (() => void) | null = null;

function writeBox(el: HTMLDivElement | null, box: BorderBox | null) {
  if (!el || !box) return;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
  el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
}

function same(a: BorderBox | null, b: BorderBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function teardown() {
  cleanup?.();
  cleanup = null;
}

function setup() {
  teardown();

  const overlay = props.getOverlay();
  const canvas = props.getCanvas();
  if (!overlay || !canvas) {
    boxes.value = { selected: null, hovered: null };
    return;
  }
  const frame = props.getFrame();

  // 只读布局，不写 DOM：rAF 里量、比较、值不变就不改 state，避免自触发循环
  const sync = () => {
    const next = computeSelectionBoxes({
      overlay,
      canvas,
      frame,
      rootId: props.rootId,
      selectedId: props.selectedId,
      hoveredId: props.hoveredId,
      clip: overlay.parentElement,
    });

    // 先直接写 DOM，再同步 state：滚动路径靠这一步做到「同一帧」，
    // 只走 state 的话渲染要排到本帧绘制之后，框就慢内容一帧。
    writeBox(selectedEl.value, next.selected);
    writeBox(hoveredEl.value, next.hovered);

    if (!same(boxes.value.selected, next.selected) || !same(boxes.value.hovered, next.hovered)) {
      boxes.value = next;
      // v-if 刚把边框元素挂上去时 ref 还是 null：等这一帧的 patch 完再写一次
      void nextTick(() => {
        writeBox(selectedEl.value, next.selected);
        writeBox(hoveredEl.value, next.hovered);
      });
    }
  };

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  };

  // 先同步量一次：换选中/悬停要在这一帧就画对（工具条是同步定位的）
  sync();

  const selectedNode = findNodeElement(canvas, props.selectedId);
  const hoveredNode = findNodeElement(canvas, props.hoveredId);

  const resize = new ResizeObserver(schedule);
  resize.observe(overlay);
  resize.observe(canvas);
  if (selectedNode) resize.observe(selectedNode);
  if (hoveredNode && hoveredNode !== selectedNode) resize.observe(hoveredNode);

  // 结构 / 类名变化：属性面板改样式、撤销后整棵子树重渲染都会改变位置
  const mutate = new MutationObserver((records) => {
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

  // 滚动两层：宿主 stage（横向）+ iframe 文档自己的滚动条。scroll 不冒泡只能捕获。
  // **滚动路径同步跟进**，理由与 React 版相同：过 rAF 会稳定慢一帧，肉眼就是框抖。
  const canvasDoc = canvas.ownerDocument;
  const onScroll = () => sync();
  globalThis.addEventListener('resize', schedule);
  globalThis.addEventListener('scroll', onScroll, true);
  canvasDoc.addEventListener('scroll', onScroll, true);

  // 物料 hover 动效（上浮 2px）只产生 transition，三个触发器全哑 —— 框会停在动效开始处
  const stopFollow = followTransitions(canvas, sync);

  cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    stopFollow();
    resize.disconnect();
    mutate.disconnect();
    globalThis.removeEventListener('resize', schedule);
    globalThis.removeEventListener('scroll', onScroll, true);
    canvasDoc.removeEventListener('scroll', onScroll, true);
  };
}

onMounted(() => setup());
onBeforeUnmount(() => teardown());

watch(
  () => [props.selectedId, props.hoveredId, props.frameReady, props.revision],
  () => setup(),
  // 父组件把新 DOM 提交之后再量
  { flush: 'post' },
);
</script>

<template>
  <div v-if="boxes.selected || boxes.hovered" :class="styles.borders" aria-hidden="true">
    <div
      v-if="boxes.hovered"
      ref="hoveredEl"
      :class="[styles.border, styles.detecting]"
      :style="{
        width: `${boxes.hovered.w}px`,
        height: `${boxes.hovered.h}px`,
        transform: `translate3d(${boxes.hovered.x}px, ${boxes.hovered.y}px, 0)`,
      }"
      data-border="detecting"
    />
    <div
      v-if="boxes.selected"
      ref="selectedEl"
      :class="[styles.border, styles.selecting]"
      :style="{
        width: `${boxes.selected.w}px`,
        height: `${boxes.selected.h}px`,
        transform: `translate3d(${boxes.selected.x}px, ${boxes.selected.y}px, 0)`,
      }"
      data-border="selecting"
    />
  </div>
</template>
