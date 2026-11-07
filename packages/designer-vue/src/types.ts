import type { Component } from 'vue';

/**
 * 视图层共用的类型（只放数据类型，不放实现）。
 *
 * `<script setup>` 里不能 `export`，所以把 `ActivityItem` 单独放在 `.ts`
 * 里，`ActivityRail.vue` 与 `Designer.vue` 各自 import —— 避免出现
 * "从 .vue 里导出接口"这种只有某些工具链认得的写法。
 */
export interface ActivityItem {
  key: string;
  label: string;
  icon: Component;
}
