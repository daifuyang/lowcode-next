<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { passthrough, styleOf } from '@lowcode-next/materials';

/**
 * 通用块级容器（Div）的 Vue 实现（§12.17）—— 与 `materials-react` 的 `Div` 对等。
 *
 * **props 一律从 `$attrs` 读，不用 `defineProps` 声明。** 理由与 `Page.vue` 同：
 * schema 的 props 是开放的（`Record<string, unknown>`），逐个声明会漏、会与 meta
 * 不同步；声明过的 prop 不再进 `$attrs`，`passthrough()` 就过滤不到，业务 props
 * 会原样落到 DOM 上。
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
  <div class="lc-div" :style="style" v-bind="rootAttrs">
    <slot />
  </div>
</template>
