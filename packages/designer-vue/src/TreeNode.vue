<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type { NodeImpl } from '@lowcode-next/model';
import { ChevronRight } from '@lucide/vue';
import { INDENT, nodeLabel, nodeText, rowBox } from '@lowcode-next/designer-core';

import MatIcon from './MatIcon.vue';
import styles from '@lowcode-next/designer-ui/TreePanel.module.css';

/**
 * 大纲树的一行（Vue 版，递归组件）。
 *
 * DOM 结构与 React 版逐节点相同（`treeitem` → caret / icon / label / actions，
 * 子列表包在 `branch` 里），所以缩进、竖向参考线、整行底色都直接复用同一份
 * CSS Module —— 不需要为 Vue 再调一遍视觉。
 *
 * 只读骨架去掉了行内动作（隐藏 / 锁定 / 重命名 / 删除）与拖拽落点：它们都会
 * 构造 Command 进历史栈，属于写操作。展开折叠、搜索高亮、选中滚动都保留。
 */
defineOptions({ name: 'TreeNode' });

const props = defineProps<{
  node: NodeImpl;
  depth: number;
  collapsed: ReadonlySet<string>;
  /** 搜索态：整棵树按命中结果裁剪，且强制展开 */
  filtering: boolean;
  keep: ReadonlySet<string> | null;
  /** 搜索词（小写），用来给命中的字加底色 */
  query: string;
  selectedId: string | null;
  hoverId: string | null;
  /** 文档 revision：结构变化时父级换新值，驱动整棵子树重渲染 */
  revision: number;
}>();

const emit = defineEmits<{
  toggle: [id: string];
  toggleDeep: [node: NodeImpl];
  select: [id: string];
  hover: [id: string | null];
}>();

const rowEl = ref<HTMLDivElement | null>(null);

const isSelected = computed(() => props.node.id === props.selectedId);
const isHovered = computed(() => props.node.id === props.hoverId);
const hasParent = computed(() => Boolean(props.node.parent));
// 搜索态一律展开：命中项藏在折叠里等于搜不到
const expanded = computed(() => props.filtering || !props.collapsed.has(props.node.id));
const children = computed(() =>
  props.keep
    ? props.node.children.filter((child) => props.keep!.has(child.id))
    : props.node.children,
);
const hasChildren = computed(() => children.value.length > 0);

const text = computed(() => nodeText(props.node));
const title = computed(() => nodeLabel(props.node));

const rowStyle = computed(
  () =>
    ({
      ...rowBox(props.depth),
      // 行盒要从「树的左边界」量到「树的内容宽度」，所以宽度要补回缩进量
      '--row-indent': `${props.depth * INDENT}px`,
    }) as CSSProperties,
);

/** 搜索高亮：命中片段单独包 `<mark>`，一眼能看出"为什么这行被留下来" */
const parts = computed(() => {
  const source = title.value;
  const query = props.query;
  if (!query) return [{ text: source, hit: false }];
  const lower = source.toLowerCase();
  if (!lower.includes(query)) return [{ text: source, hit: false }];

  const out: Array<{ text: string; hit: boolean }> = [];
  let from = 0;
  let at = lower.indexOf(query, from);
  while (at !== -1) {
    if (at > from) out.push({ text: source.slice(from, at), hit: false });
    out.push({ text: source.slice(at, at + query.length), hit: true });
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < source.length) out.push({ text: source.slice(from), hit: false });
  return out;
});

// 选中行滚进可视区：树比面板长，选中深层节点后不滚动会"点了没反应"
watch(isSelected, (value) => {
  if (value) rowEl.value?.scrollIntoView({ block: 'nearest' });
});
</script>

<template>
  <div
    ref="rowEl"
    role="treeitem"
    :aria-level="depth + 1"
    :aria-selected="isSelected"
    :aria-expanded="hasChildren ? expanded : undefined"
    :class="styles.row"
    :style="rowStyle"
    :data-selected="isSelected || undefined"
    :data-detecting="isHovered || undefined"
    :data-hidden="node.hidden || undefined"
    :data-locked="node.locked || undefined"
    :data-tree-row="depth"
    :data-tree-id="node.id"
    :title="text ? `${title} · ${node.id}\n${text}` : `${title} · ${node.id}`"
    @click="emit('select', node.id)"
    @dblclick="emit('toggleDeep', node)"
    @mouseenter="emit('hover', node.id)"
    @mouseleave="emit('hover', null)"
  >
    <button
      v-if="hasChildren"
      type="button"
      :class="styles.caret"
      :data-open="expanded || undefined"
      :aria-label="expanded ? `收起 ${title}` : `展开 ${title}`"
      @click.stop="emit('toggle', node.id)"
    >
      <ChevronRight :size="12" :stroke-width="2.2" aria-hidden="true" />
    </button>
    <span v-else :class="styles.caretEmpty" />

    <span :class="styles.icon">
      <MatIcon :name="hasParent ? node.componentName : 'Page'" :size="16" />
    </span>

    <span :class="styles.label">
      <span :class="styles.name">
        <template v-for="(part, index) in parts" :key="index">
          <mark v-if="part.hit" :class="styles.hit">{{ part.text }}</mark>
          <template v-else>{{ part.text }}</template>
        </template>
      </span>
    </span>

    <!-- 空的动作容器保留：CSS 里它是固定宽度的右槽，去掉会让标题区变宽，
         与 React 版的行内边距对不上 -->
    <span :class="styles.actions" />
  </div>

  <div
    v-if="expanded && hasChildren"
    :class="styles.branch"
    role="group"
    :data-selected="isSelected || undefined"
    :data-branch="depth"
  >
    <TreeNode
      v-for="child in children"
      :key="child.id"
      :node="child as NodeImpl"
      :depth="depth + 1"
      :collapsed="collapsed"
      :filtering="filtering"
      :keep="keep"
      :query="query"
      :selected-id="selectedId"
      :hover-id="hoverId"
      :revision="revision"
      @toggle="emit('toggle', $event)"
      @toggle-deep="emit('toggleDeep', $event)"
      @select="emit('select', $event)"
      @hover="emit('hover', $event)"
    />
  </div>
</template>
