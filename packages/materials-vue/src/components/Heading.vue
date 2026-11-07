<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import {
  HEADING_TONES,
  ALIGNS,
  WEIGHTS,
  WEIGHT_VALUE,
  bool,
  cx,
  num,
  passthrough,
  pick,
  styleOf,
} from '@lowcode-next/materials';

/**
 * Heading 的 Vue 实现 —— 与 `materials-react` 的 `Heading` 对等。
 *
 * 枚举校验用的 `HEADING_TONES` / `ALIGNS` / `WEIGHTS` 与 meta 里 `propOptions()`
 * 的是同一份常量（都在 `@lowcode-next/materials`），这是两套实现渲染一致的
 * 前提：面板里能选中的值，两边一定都认。
 *
 * 标签用 `<component :is>` 动态切换 h1~h4，与 React 的 `` `h${level}` as 'h1' ``
 * 等价；`Math.min(Math.max(..., 1), 4)` 的夹取顺序也照抄 —— 越界值必须落到
 * 边界层级，而不是退化成默认值。
 */
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const p = computed(() => attrs as Record<string, unknown>);

const level = computed(() => Math.min(Math.max(num(p.value.level, 1), 1), 4));
const tag = computed(() => `h${level.value}`);
const tone = computed(() => pick(p.value.tone, HEADING_TONES, 'default'));
const align = computed(() => pick(p.value.align, ALIGNS, 'left'));
const weight = computed(() => pick(p.value.weight, WEIGHTS, 'semibold'));

const cls = computed(() =>
  cx(
    'lc-heading',
    `lc-heading--${level.value}`,
    tone.value !== 'default' && `lc-heading--${tone.value}`,
    `lc-ta--${align.value}`,
    bool(p.value.mono) && 'lc-heading--mono',
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
