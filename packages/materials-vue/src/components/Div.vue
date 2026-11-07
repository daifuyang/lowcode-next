<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { passthrough, styleOf } from '@lowcode-next/materials';

/**
 * Div 的 Vue 实现 —— 与 `materials-react` 的 `Div` 对等。
 *
 * **props 一律从 `$attrs` 读，不用 `defineProps` 声明。**
 * 理由：schema 里的 props 是开放的（`Record<string, unknown>`），
 * 每个物料声明一遍会漏、会与 meta 不同步；而且声明过的 prop 不再进 `$attrs`，
 * 想统一走 `passthrough()` 过滤就做不到了 —— 业务 props 就会原样落到 DOM 上
 * （`level="2"`、`tone="default"` 这种非法属性），React 侧会警告、Vue 侧会静默渲染。
 *
 * `inheritAttrs: false` + 显式 `v-bind="rootAttrs"` 是契约第 1 条的 Vue 写法：
 * 根元素唯一，且 `data-node-id` / `data-edit-flags` 通过 `passthrough()` 落到它身上。
 */
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const p = computed(() => attrs as Record<string, unknown>);
const rootAttrs = computed(() => passthrough(p.value));
const style = computed(() => styleOf(p.value.style));
</script>

<template>
  <div class="lc-card" :style="style" v-bind="rootAttrs">
    <slot />
  </div>
</template>
