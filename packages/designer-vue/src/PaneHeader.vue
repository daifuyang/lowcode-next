<script setup lang="ts">
import { Pin, PinOff, X } from '@lucide/vue';

import styles from '@lowcode-next/designer-ui/PaneHeader.module.css';

/**
 * 左栏面板的统一页头：标题 + 面板工具 + 窗口动作（固定 / 关闭）。
 *
 * 与 React 版结构逐节点相同（DOM 一致是两版版式一致的前提）：
 * 标题吃掉剩余宽度，工具与窗口动作之间留 6px 间距，单个按钮 22 见方。
 *
 * 图钉图标照 lowcode 的语义：**画的是"点下去会变成什么"，不是当前状态**。
 */
withDefaults(defineProps<{ title: string; pinned?: boolean; pin?: boolean; closable?: boolean }>(), {
  pinned: false,
  pin: true,
  closable: true,
});

defineEmits<{ togglePin: []; close: [] }>();
</script>

<template>
  <header :class="styles.header">
    <span :class="styles.title" :title="title">{{ title }}</span>

    <span v-if="$slots.extra" :class="styles.extra">
      <slot name="extra" />
    </span>

    <span :class="styles.chrome">
      <button
        v-if="pin"
        type="button"
        :class="styles.iconBtn"
        :title="pinned ? '取消固定（改为悬浮，不占画布宽度）' : '固定面板（占位，不遮挡画布）'"
        :aria-label="pinned ? '取消固定' : '固定面板'"
        @click="$emit('togglePin')"
      >
        <PinOff v-if="pinned" :size="15" :stroke-width="1.8" aria-hidden="true" />
        <Pin v-else :size="15" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <button
        v-if="closable"
        type="button"
        :class="styles.iconBtn"
        title="关闭面板"
        aria-label="关闭面板"
        @click="$emit('close')"
      >
        <X :size="13" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </span>
  </header>
</template>
