<script setup lang="ts">
import type { DocumentImpl } from '@lowcode-next/model';
import type { MaterialRegistry } from '@lowcode-next/renderer';

import MaterialPanel from './MaterialPanel.vue';
import TreePanel from './TreePanel.vue';
import styles from '@lowcode-next/designer-ui/Designer.module.css';

/**
 * 左栏面板内容（Vue 版）。
 *
 * 固定（占位）与悬浮（浮层）两种装载方式下**内容完全一样**，区别只在外壳怎么摆
 * （`DesignerShell` 的 `left` slot vs `float-pane` slot）。React 版把这段 JSX
 * 提成变量只写一次，Vue 里对应的是这个小组件 —— 两处复用同一份，避免"固定态
 * 和大纲态长得不一样"这种只在一种装载方式下出现的 bug。
 */
withDefaults(
  defineProps<{
    document: DocumentImpl;
    registry: MaterialRegistry;
    leftTab: string;
    pinned?: boolean;
    selectedId: string | null;
    hoverId: string | null;
    revision: number;
  }>(),
  { pinned: false, selectedId: null, hoverId: null },
);

defineEmits<{
  togglePin: [];
  close: [];
  locate: [id: string];
  selectNode: [id: string];
  hoverNode: [id: string | null];
}>();
</script>

<template>
  <div :class="styles.leftPane">
    <MaterialPanel
      v-if="leftTab === 'materials'"
      :registry="registry"
      :pinned="pinned"
      @toggle-pin="$emit('togglePin')"
      @close="$emit('close')"
    />
    <!-- 数据源面板属 M-L3-5：只读骨架不提供入口，落到 else 分支的永远是大纲 -->
    <TreePanel
      v-else
      :document="document"
      :selected-id="selectedId"
      :hover-id="hoverId"
      :revision="revision"
      :pinned="pinned"
      @toggle-pin="$emit('togglePin')"
      @close="$emit('close')"
      @locate="$emit('locate', $event)"
      @select-node="$emit('selectNode', $event)"
      @hover-node="$emit('hoverNode', $event)"
    />
  </div>
</template>
