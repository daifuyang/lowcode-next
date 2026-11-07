<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { CSSProperties, Component } from 'vue';
import { LayoutGrid, ListTree, Monitor, Smartphone, Tablet } from '@lucide/vue';
import type { DocumentImpl } from '@lowcode-next/model';
import type { MaterialRegistry } from '@lowcode-next/renderer';
import { CANVAS_DEVICES, DesignerSession } from '@lowcode-next/designer-core';
import type { CanvasDevice } from '@lowcode-next/designer-core';

import ActivityRail from './ActivityRail.vue';
import BrandMark from './BrandMark.vue';
import DesignerShell from './DesignerShell.vue';
import FloatToolbar from './FloatToolbar.vue';
import LeftPane from './LeftPane.vue';
import SelectionBorders from './SelectionBorders.vue';
import type { ActivityItem } from './types';
import styles from '@lowcode-next/designer-ui/Designer.module.css';

/**
 * 设计器组装（Vue 版，M-L3-3 **只读骨架**）。
 *
 * 与 React 版的关系（DESIGN-v1 §12.13.4）：**状态与写操作都在 `DesignerSession`**，
 * 这个文件只做两件事 —— 订阅快照、把手势翻译成 session 方法。
 * 唯一的差别是这里不提供任何写入口：不接 `onSchemaChange`、不构造 `Command`、
 * 物料不拖、大纲行没有隐藏/锁定/重命名/删除、工具条只留标题与祖先链。
 *
 * 骨架要验证的判据：**同一 schema 下选中 / 悬停 / 滚动 / 框位置与 React 版一致**。
 * 所以 iframe 画布、选中框、浮动工具条、大纲与物料面板一个不少 —— 它们才是
 * "位置一致"的载体。
 */
const props = withDefaults(
  defineProps<{
    document: DocumentImpl;
    registry: MaterialRegistry;
    /** 画布内边距，默认 20；做整幅落地页时设 0，让区块自己贴边 */
    canvasPadding?: number;
    /**
     * 右区「预览」回调。React 版这个 prop 叫 `onPreview`；Vue 模板里按约定
     * 写成 `preview`，避免 `on*` 与事件监听器的命名撞车。
     */
    preview?: () => void;
  }>(),
  { canvasPadding: 20, preview: undefined },
);

/** 设备档位 → 图标（core 的 `CANVAS_DEVICES` 只描述数据，不认框架与图标） */
const DEVICE_ICONS: Record<CanvasDevice, Component> = {
  default: Monitor,
  tablet: Tablet,
  phone: Smartphone,
};

/** 面板入口图标统一取 lucide（48px 栏里 20px 图标，线宽 1.7） */
const railItems: ActivityItem[] = [
  { key: 'tree', label: '大纲树', icon: ListTree },
  { key: 'materials', label: '组件库', icon: LayoutGrid },
  // 数据源面板属 M-L3-5；入口先不放，避免点开一个空面板
];

const frameEl = ref<HTMLIFrameElement | null>(null);
const overlayEl = ref<HTMLDivElement | null>(null);

// 构造纯状态（§12.13.3）：副作用统一在 onMounted 之后
const session = new DesignerSession({
  document: props.document,
  materials: props.registry,
  canvasPadding: props.canvasPadding,
});

/**
 * 订阅快照：`shallowRef` + 一次性换引用。
 *
 * 不用 `reactive` / `ref` 深包装：session 返回的是**引用稳定**的不可变快照，
 * 深代理只会让"没变化"也触发 watcher（React 侧的 `useSyncExternalStore`
 * 是同一个约束，见 §12.13.4）。
 */
const snap = shallowRef(session.getSnapshot());
const off = session.subscribe(() => {
  snap.value = session.getSnapshot();
});

onMounted(() => {
  if (frameEl.value) session.attachFrame(frameEl.value);
  session.start();
});

onBeforeUnmount(() => {
  off();
  session.dispose();
});

// 宿主可能每次渲染都给新的内联回调：同步进 session，避免它捕获旧闭包
watch(
  () => props.canvasPadding,
  () => session.update({ canvasPadding: props.canvasPadding }),
);

// 收起时传 null：图标栏的高亮表达的是"这个面板正在显示"
const railActive = computed(() => (snap.value.ui.paneOpen ? snap.value.ui.leftTab : null));

const canvasStyle = computed<CSSProperties | undefined>(() =>
  snap.value.canvasWidth == null
    ? undefined
    : // 设计宽度：画布是一张固定宽度的"纸"，在 stage 里水平居中
      { width: `${snap.value.canvasWidth}px`, marginInline: 'auto' },
);

function onWidthInput(event: Event) {
  session.setCanvasDraft((event.target as HTMLInputElement).value);
}

function onWidthKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    session.setCanvasDraft(null);
    return;
  }
  if (event.key !== 'Enter') return;
  // 回车提交（引擎的 onPressEnter）；越界 / 非法直接弹回实测值
  session.commitCanvasDraft();
}
</script>

<template>
  <DesignerShell :left-open="snap.ui.paneOpen && snap.ui.pinned" :canvas-style="canvasStyle">
    <template #toolbar-left>
      <!-- 左区只有 logo（引擎 demo 的 logo 插件 + 场景名，场景名是标签不是切换器） -->
      <span :class="styles.brand">
        <BrandMark :class-name="styles.brandMark" />
        <span :class="styles.brandName">Lowcode Next</span>
      </span>
    </template>

    <template #toolbar-center>
      <!-- 中区：画布尺寸调整 —— 3 个设备档 + 宽度输入（实时显示实测宽度，回车提交） -->
      <div :class="styles.canvasSize">
        <div :class="styles.deviceGroup" role="group" aria-label="画布设备档位">
          <button
            v-for="entry in CANVAS_DEVICES"
            :key="entry.key"
            type="button"
            :class="styles.deviceButton"
            :data-active="snap.device === entry.key || undefined"
            :title="entry.label"
            :aria-label="entry.label"
            :aria-pressed="snap.device === entry.key"
            @click="session.setDevice(entry.key)"
          >
            <component
              :is="DEVICE_ICONS[entry.key]"
              :size="16"
              :stroke-width="1.7"
              aria-hidden="true"
            />
          </button>
        </div>
        <label :class="styles.widthInput">
          <input
            :class="styles.widthField"
            type="number"
            :min="320"
            :max="3840"
            :step="1"
            :value="snap.canvasDraft ?? snap.canvasWidth ?? ''"
            placeholder="请输入"
            title="输入设计宽度后按回车应用"
            aria-label="画布宽度"
            @input="onWidthInput"
            @keydown="onWidthKeydown"
            @blur="session.setCanvasDraft(null)"
          />
          <span :class="styles.widthUnit">px</span>
        </label>
      </div>
    </template>

    <template #toolbar-right>
      <!-- 只读骨架没有撤销 / 重做 / 保存：它们背后是历史栈与 schema 导出 -->
      <button
        type="button"
        :class="styles.primaryButton"
        :disabled="!preview"
        :title="preview ? '在新窗口打开运行态预览' : '宿主未提供 preview'"
        @click="preview?.()"
      >
        预览
      </button>
    </template>

    <template #left>
      <div :class="styles.left">
        <ActivityRail
          :items="railItems"
          :active="railActive"
          @change="session.toggleLeftTab($event)"
        />
        <LeftPane
          v-if="snap.ui.paneOpen && snap.ui.pinned"
          :document="document"
          :registry="registry"
          :left-tab="snap.ui.leftTab"
          :pinned="snap.ui.pinned"
          :selected-id="snap.selectable.selectedId"
          :hover-id="snap.selectable.hoverId"
          :revision="snap.revision"
          @toggle-pin="session.togglePin()"
          @close="session.closePane()"
          @locate="session.locate($event)"
          @select-node="session.select($event)"
          @hover-node="session.hover($event)"
        />
      </div>
    </template>

    <template v-if="snap.ui.paneOpen && !snap.ui.pinned" #float-pane>
      <LeftPane
        :document="document"
        :registry="registry"
        :left-tab="snap.ui.leftTab"
        :pinned="snap.ui.pinned"
        :selected-id="snap.selectable.selectedId"
        :hover-id="snap.selectable.hoverId"
        :revision="snap.revision"
        @toggle-pin="session.togglePin()"
        @close="session.closePane()"
        @locate="session.locate($event)"
        @select-node="session.select($event)"
        @hover-node="session.hover($event)"
      />
    </template>

    <template #canvas>
      <!-- 画布文档（同源 iframe）：schema 经 postMessage 推入，画布自己渲染。
           内容、样式、滚动、@media 全部隔离在 frame 里，宿主只看到一张"纸"。 -->
      <iframe
        ref="frameEl"
        :class="styles.canvasFrame"
        aria-label="画布"
        :src="session.canvasSource"
      />
      <!-- 编辑覆盖层：选中/悬停边框 + 浮动工具条，画在宿主文档里、盖在 iframe 上。
           整层 pointer-events: none，点击穿透到 iframe；工具条自己恢复。 -->
      <div ref="overlayEl" :class="styles.canvasOverlay">
        <SelectionBorders
          :root-id="document.root.id"
          :selected-id="snap.selectable.selectedId"
          :hovered-id="snap.selectable.hoverId"
          :frame-ready="snap.frameReady"
          :revision="snap.revision"
          :get-canvas="session.getCanvas"
          :get-frame="session.getFrame"
          :get-overlay="() => overlayEl"
        />
        <FloatToolbar
          :document="document"
          :selected-id="snap.selectable.selectedId"
          :revision="snap.revision"
          :get-canvas="session.getCanvas"
          :get-frame="session.getFrame"
          :hidden="snap.dragging"
          @locate="session.locate($event)"
        />
      </div>
    </template>

    <template #right>
      <!-- 属性 / 样式面板属 M-L3-4。这里明确写出"只读骨架"，而不是留一块空白
           让人以为是渲染失败。 -->
      <div :style="{ padding: '16px 14px', fontSize: '12px', lineHeight: '1.7', color: 'rgba(31, 56, 88, 0.55)' }">
        <p :style="{ margin: 0, fontWeight: 600, color: 'rgba(0, 0, 0, 0.8)' }">只读预览</p>
        <p :style="{ margin: '8px 0 0' }">
          这是 Vue 版编辑器骨架（M-L3-3）：选中、悬停、滚动、大纲与物料都走同一个
          <code>DesignerSession</code>，但没有任何写入口。
        </p>
        <p :style="{ margin: '8px 0 0' }">属性 / 样式面板在 M-L3-4，数据源与拖拽在 M-L3-5。</p>
      </div>
    </template>
  </DesignerShell>
</template>
