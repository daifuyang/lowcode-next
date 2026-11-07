<script setup lang="ts">
import { computed } from 'vue';

import { GLYPHS, strokeFor } from './icons';

/**
 * 物料 / 节点图标（Vue 版）。
 *
 * `componentName` 是运行时字符串，而 lucide 是具名导出、按需 tree-shake ——
 * 中间必须有一张名字到组件的表（`icons.ts`）。未登记的物料回落到首字母徽章，
 * 保证新增物料不至于没有图标。与 React 版的 `MatIcon` 行为逐项一致。
 */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 });

const glyph = computed(() => GLYPHS[props.name] ?? null);
const stroke = computed(() => strokeFor(props.size));
const fallback = computed(() => (props.name[0] ?? '?').toUpperCase());
const fallbackStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: `${Math.round(props.size * 0.62)}px`,
  fontWeight: 600,
  lineHeight: 1,
}));
</script>

<template>
  <component
    :is="glyph"
    v-if="glyph"
    :size="size"
    :stroke-width="stroke"
    aria-hidden="true"
  />
  <span v-else :style="fallbackStyle">{{ fallback }}</span>
</template>
