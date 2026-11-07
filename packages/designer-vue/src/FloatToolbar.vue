<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DocumentImpl } from '@lowcode-next/model';
import {
  BAR_HEIGHT,
  anchorOnScreen,
  buildHierarchy,
  followTransitions,
  measureFloatAnchor,
  parentChain,
  PARENT_CHAIN_LIMIT,
  placeFloatBar,
  placePopup,
} from '@lowcode-next/designer-core';

import MatIcon from './MatIcon.vue';
import styles from '@lowcode-next/designer-ui/FloatToolbar.module.css';

/**
 * 选中节点的浮动工具条（Vue 版，M-L3-3 只读骨架）。
 *
 * 形态与定位照搬 lowcode-engine（条高 20、按钮 20×20、上沿外 23px、
 * `flex-direction: row-reverse`），定位计算复用 core 的 `placeFloatBar` /
 * `placePopup` / `measureFloatAnchor` —— 与 React 版同一套坐标规则。
 *
 * **只读骨架只保留标题 chip 与祖先链**：删除 / 复制 / 锁定三个动作都会构造
 * Command 进历史栈，属 M-L3-4/M-L3-5 的范围。祖先链本身是纯导航
 * （hover + 选中 + 定位），保留它才能验证"框与工具条同帧跟随"。
 */
const props = defineProps<{
  document: DocumentImpl;
  selectedId: string | null;
  /** 文档 revision：结构变化也要重量 */
  revision: number;
  getCanvas: () => HTMLElement | null;
  getFrame: () => HTMLIFrameElement | null;
  /** 拖拽进行中整体隐藏 —— fixed 层会挡住 elementFromPoint 的命中 */
  hidden?: boolean;
}>();

const emit = defineEmits<{ locate: [id: string] }>();

/** 鼠标从工具条移到面板要跨过 3px 空隙，给个收起的宽限期 */
const CLOSE_DELAY = 120;

const barEl = ref<HTMLDivElement | null>(null);
const popupEl = ref<HTMLDivElement | null>(null);

const anchorRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);
const canvasRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);
const barSize = ref({ width: 0, height: 0 });
const popupSize = ref({ width: 0, height: 0 });
const openId = ref<string | null>(null);
const viewport = ref({
  width: typeof window === 'undefined' ? 0 : window.innerWidth,
  height: typeof window === 'undefined' ? 0 : window.innerHeight,
});

let closeTimer: number | null = null;
let cleanup: (() => void) | null = null;
/** 面板开启期间挂在 document 上的"点外面 / Esc"监听 */
let offOpen: (() => void) | null = null;

const node = computed(() =>
  props.selectedId ? props.document.getNode(props.selectedId) : null,
);
// 根节点没有父级、也没有可操作项，给它挂条工具条只是噪音
const visible = computed(() => Boolean(node.value && node.value.id !== props.document.root.id));

/**
 * 面板是"为某个节点打开的"，开着与否直接由 `openId === selectedId` 推导 ——
 * 不能只存 boolean：选中变化若先于"关面板"提交，会画出一帧"条已跳走、
 * 祖先列表还挂在旧位置"的画面。
 */
const open = computed(() => openId.value !== null && openId.value === props.selectedId);

const title = computed(() => node.value?.meta?.title ?? node.value?.componentName ?? '');

const ancestors = computed(() => {
  if (!node.value) return [];
  return parentChain(buildHierarchy(node.value), PARENT_CHAIN_LIMIT);
});

const barStyle = computed(() => {
  if (!anchorRect.value) return null;
  return placeFloatBar({
    anchor: anchorRect.value,
    size: barSize.value,
    viewport: viewport.value,
    bounds: canvasRect.value ?? undefined,
  });
});

const popupStyle = computed(() => {
  if (!barStyle.value) return null;
  return placePopup({
    bar: {
      x: barStyle.value.left,
      y: barStyle.value.top,
      width: barSize.value.width,
      height: barSize.value.height || BAR_HEIGHT,
    },
    size: popupSize.value,
    viewport: viewport.value,
  });
});

const shown = computed(
  () =>
    !props.hidden &&
    visible.value &&
    anchorRect.value !== null &&
    barStyle.value !== null &&
    anchorOnScreen(anchorRect.value, viewport.value),
);

const measured = computed(() => barSize.value.width > 0);

function sync() {
  const { canvasView, anchor } = measureFloatAnchor({
    canvas: props.getCanvas(),
    frame: props.getFrame(),
    rootId: props.document.root.id,
    selectedId: props.selectedId,
  });
  canvasRect.value = canvasView;
  anchorRect.value = anchor;
}

function cancelClose() {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function closePopup() {
  if (openId.value === null) return;
  openId.value = null;
  props.document.selection.hover(null);
}

function openPopup() {
  cancelClose();
  openId.value = props.selectedId;
}

function scheduleClose() {
  cancelClose();
  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    closePopup();
  }, CLOSE_DELAY);
}

function pick(id: string) {
  cancelClose();
  openId.value = null;
  props.document.selection.hover(null);
  props.document.selection.select(id);
  emit('locate', id);
}

function dispose() {
  cleanup?.();
  cleanup = null;
  cancelClose();
}

function setup() {
  dispose();

  const onScroll = () => sync();
  const onResize = () => {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
    sync();
  };

  globalThis.document.addEventListener('scroll', onScroll, true);
  const canvas = props.getCanvas();
  const canvasDoc = canvas?.ownerDocument;
  canvasDoc?.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  // 物料的 hover 动效只产生 transition：不跟着采，工具条会停在旧位置，
  // 鼠标下的行跟着跳，点击就落空
  const stopFollow = canvas ? followTransitions(canvas, sync) : null;

  sync();

  cleanup = () => {
    stopFollow?.();
    globalThis.document.removeEventListener('scroll', onScroll, true);
    canvasDoc?.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
  };
}

onMounted(() => setup());
onBeforeUnmount(() => dispose());

watch(
  () => [props.selectedId, props.revision],
  () => {
    // 选中变化：打开中的面板同帧失效（由 open 的 id 比较兜住），其余重量一次
    setup();
  },
  { flush: 'post' },
);

// 工具条与面板的宽度都随文案变化，定位必须用真实尺寸
watch(
  barEl,
  (el, _prev, onCleanup) => {
    if (!el) {
      barSize.value = { width: 0, height: 0 };
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width !== barSize.value.width || rect.height !== barSize.value.height) {
        barSize.value = { width: rect.width, height: rect.height };
      }
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
    const rect = el.getBoundingClientRect();
    barSize.value = { width: rect.width, height: rect.height };
  },
  { flush: 'post' },
);

watch(
  popupEl,
  (el, _prev, onCleanup) => {
    if (!el) {
      popupSize.value = { width: 0, height: 0 };
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width !== popupSize.value.width || rect.height !== popupSize.value.height) {
        popupSize.value = { width: rect.width, height: rect.height };
      }
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
    const rect = el.getBoundingClientRect();
    popupSize.value = { width: rect.width, height: rect.height };
  },
  { flush: 'post' },
);

// 面板开启时：点外面 / Esc 关闭
watch(open, (value) => {
  offOpen?.();
  offOpen = null;
  if (!value) return;
  const onPointerDown = (event: PointerEvent) => {
    if (!barEl.value?.contains(event.target as Node)) closePopup();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePopup();
  };
  globalThis.document.addEventListener('pointerdown', onPointerDown, true);
  globalThis.document.addEventListener('keydown', onKeyDown, true);
  offOpen = () => {
    globalThis.document.removeEventListener('pointerdown', onPointerDown, true);
    globalThis.document.removeEventListener('keydown', onKeyDown, true);
  };
});

onBeforeUnmount(() => offOpen?.());
</script>

<template>
  <div
    v-if="shown && barStyle"
    ref="barEl"
    :class="styles.actions"
    role="toolbar"
    aria-label="节点操作"
    :data-side="barStyle.side"
    data-lc-float="bar"
    :style="{
      left: `${barStyle.left}px`,
      top: `${barStyle.top}px`,
      // 尺寸没量出来之前不显示，否则会先在错的位置闪一下；
      // 拖拽中同样要真隐藏 —— visibility 才会让出 elementFromPoint 的命中
      visibility: measured ? 'visible' : 'hidden',
    }"
    @pointerdown.stop
    @click.stop
    @mouseenter="selectedId && selectedId !== document.root.id && document.selection.hover(selectedId)"
    @mouseleave="scheduleClose"
  >
    <div :class="styles.selector" @mouseenter="openPopup">
      <button
        type="button"
        :class="styles.chip"
        aria-haspopup="menu"
        :aria-expanded="open"
      >
        <MatIcon :name="node?.componentName ?? ''" :size="16" />
        <span :class="styles.chipTitle">{{ title }}</span>
      </button>
    </div>

    <div
      v-if="open && ancestors.length > 0"
      ref="popupEl"
      :class="styles.popup"
      role="menu"
      aria-label="父级"
      data-lc-float="popup"
      :style="{
        left: `${popupStyle?.left ?? 0}px`,
        top: `${popupStyle?.top ?? 0}px`,
        visibility: popupSize.width > 0 ? 'visible' : 'hidden',
      }"
      @mouseenter="cancelClose"
    >
      <div
        v-for="item in ancestors"
        :key="item.id"
        :class="styles.popupRow"
        role="menuitem"
        @mouseenter="document.selection.hover(item.id)"
        @mouseleave="document.selection.hover(null)"
        @pointerdown="
          (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            pick(item.id);
          }
        "
      >
        <div :class="styles.popupRowContent">
          <MatIcon :name="item.componentName" :size="16" />
          <span :class="styles.popupRowTitle">{{ item.title }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
