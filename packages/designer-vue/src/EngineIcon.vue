<script setup lang="ts">
import { computed } from 'vue';

import { ICON_PATHS } from '@lowcode-next/designer-ui/icon-paths';

/**
 * lowcode-engine 样式面板图标的 **Vue 渲染件**（DESIGN-v1 §7.14 / §12.13.2）。
 *
 * 图形数据在 `designer-ui/icon-paths`（两边读同一份），这里只负责把它渲染成
 * `<svg>`：图标是数据，不是组件，所以换框架不需要重画。
 */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 });

const paths = computed(() => ICON_PATHS[props.name] ?? null);
</script>

<template>
  <svg
    v-if="paths"
    :width="size"
    :height="size"
    viewBox="0 0 1024 1024"
    fill="currentColor"
    aria-hidden="true"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>
