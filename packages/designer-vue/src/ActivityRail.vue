<script setup lang="ts">
import type { ActivityItem } from './types';
import styles from '@lowcode-next/designer-ui/ActivityRail.module.css';

/**
 * 最左侧图标栏（lowcode-engine 的 `leftArea`）。
 *
 * 尺寸与高亮照 `editor-skeleton/src/layouts/workbench.less`：栏宽 48、每项 46×46、
 * 图标 20、顶部留 12；**激活只染图标色，不铺底色、不挂指示条**。
 *
 * 高亮跟着「面板是否展开」走：面板收起时一个入口都不亮 —— 否则默认收起的状态下
 * 大纲那个图标一直是品牌蓝，"点开了哪个"就无从判断。
 */
withDefaults(defineProps<{ items: ActivityItem[]; active: string | null }>(), { active: null });

defineEmits<{ change: [key: string] }>();
</script>

<template>
  <nav :class="styles.rail" aria-label="面板导航">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      :class="styles.item"
      :data-active="item.key === active || undefined"
      :title="item.label"
      :aria-label="item.label"
      :aria-pressed="item.key === active"
      @click="$emit('change', item.key)"
    >
      <component :is="item.icon" />
    </button>
  </nav>
</template>
