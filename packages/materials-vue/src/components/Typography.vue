<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import {
  TYPOGRAPHY_TAG,
  TYPOGRAPHY_TONES,
  TYPOGRAPHY_TYPES,
  ALIGNS,
  WEIGHTS,
  WEIGHT_VALUE,
  bool,
  cx,
  passthrough,
  pick,
  styleOf,
} from '@lowcode-next/materials';

/**
 * Typography 的 Vue 实现 —— 与 `materials-react` 的 `Typography` 对等。
 *
 * 原 Heading + Text 合并成一个组件：`type` 同时决定渲染标签（h1~h4/p/span）
 * 与默认字号档。标题默认半粗（继承原 Heading 的观感），正文/辅助文字默认常规
 * —— 与 React 版的取默认逻辑逐字一致，两边渲染差异必须为零。
 */
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const p = computed(() => attrs as Record<string, unknown>);

const type = computed(() => pick(p.value.type, TYPOGRAPHY_TYPES, 'body'));
const tag = computed(() => TYPOGRAPHY_TAG[type.value]);
const tone = computed(() => pick(p.value.tone, TYPOGRAPHY_TONES, 'default'));
const align = computed(() => pick(p.value.align, ALIGNS, 'left'));
const weight = computed(() =>
  pick(
    p.value.weight,
    WEIGHTS,
    type.value === 'body' || type.value === 'caption' ? 'normal' : 'semibold',
  ),
);

const cls = computed(() =>
  cx(
    'lc-typo',
    `lc-typo--${type.value}`,
    `lc-tone--${tone.value}`,
    `lc-ta--${align.value}`,
    bool(p.value.mono) && 'lc-mono',
  ),
);

const style = computed(() => ({
  fontWeight: WEIGHT_VALUE[weight.value],
  ...styleOf(p.value.style),
}));

const rootAttrs = computed(() => passthrough(p.value));
</script>

<template>
  <component :is="tag" :class="cls" :style="style" v-bind="rootAttrs">
    <slot />
  </component>
</template>
