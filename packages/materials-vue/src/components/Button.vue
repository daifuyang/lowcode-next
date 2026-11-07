<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { BUTTON_SIZES, BUTTON_VARIANTS, bool, cx, passthrough, pick, styleOf } from '@lowcode-next/materials';

/**
 * Button 的 Vue 实现 —— 与 `materials-react` 的 `Button` 对等。
 *
 * 两个容易漏的细节，都照 React 版抄：
 * 1. 显式 `type="button"`：表单里不写会默认成为 submit，点一下整页跳转；
 * 2. `size !== 'md'` 才加尺寸类：md 是基准值，类名写在 CSS 的默认规则里，
 *    多写一个 `lc-btn--md` 只会让优先级混乱。
 */
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const p = computed(() => attrs as Record<string, unknown>);

const variant = computed(() => pick(p.value.variant, BUTTON_VARIANTS, 'default'));
const size = computed(() => pick(p.value.size, BUTTON_SIZES, 'md'));

const cls = computed(() =>
  cx(
    'lc-btn',
    `lc-btn--${variant.value}`,
    size.value !== 'md' && `lc-btn--${size.value}`,
    bool(p.value.block) && 'lc-btn--block',
  ),
);

const style = computed(() => styleOf(p.value.style));
const rootAttrs = computed(() => passthrough(p.value));
</script>

<template>
  <button type="button" :class="cls" :style="style" v-bind="rootAttrs">
    <slot />
  </button>
</template>
