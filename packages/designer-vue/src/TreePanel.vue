<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DocumentImpl, NodeImpl } from '@lowcode-next/model';
import { ChevronsDownUp, ChevronsUpDown, Search, X } from '@lucide/vue';
import {
  collapsedByDefault,
  flattenVisible,
  keepPaths,
  nodeLabel,
  nodeText,
  stepRow,
} from '@lowcode-next/designer-core';

import PaneHeader from './PaneHeader.vue';
import TreeNode from './TreeNode.vue';
import styles from '@lowcode-next/designer-ui/TreePanel.module.css';

/**
 * 大纲树（Vue 版，M-L3-3 只读骨架）。
 *
 * 交互与 React 版一致的部分：单击选中、双击展 / 收整棵子树、↑↓←→ / Home / End
 * 导航、Enter 定位、搜索裁剪 + 命中高亮、选中行自动滚进可视区、页头「全部收起」。
 *
 * **去掉**的部分：行内四个动作（隐藏 / 锁定 / 重命名 / 删除）与拖拽排序 ——
 * 它们都要构造 Command。只读骨架的判据是「无可写入口」，不是「按钮先摆着」。
 *
 * 折叠状态是纯 UI 状态，不进文档、不进历史，与 React 版同一套默认值
 * （`collapsedByDefault`，来自 core）。
 */
const props = withDefaults(
  defineProps<{
    document: DocumentImpl;
    selectedId: string | null;
    hoverId: string | null;
    /** 文档 revision：结构变化时驱动整棵树重渲染 */
    revision: number;
    pinned?: boolean;
  }>(),
  { pinned: false, selectedId: null, hoverId: null },
);

const emit = defineEmits<{
  togglePin: [];
  close: [];
  locate: [id: string];
  'select-node': [id: string];
  'hover-node': [id: string | null];
}>();

const collapsed = ref<ReadonlySet<string>>(collapsedByDefault(props.document.root));
const keyword = ref('');
const treeEl = ref<HTMLDivElement | null>(null);

// 换文档（切页面 / 重新加载 schema）时回到默认折叠态。
// 同一次会话里不动 —— 否则编辑一次就把用户手动展开的层级全收了。
watch(
  () => props.document,
  (next) => {
    collapsed.value = collapsedByDefault(next.root);
    keyword.value = '';
  },
);

const query = computed(() => keyword.value.trim().toLowerCase());

const keep = computed<ReadonlySet<string> | null>(() => {
  if (!query.value) return null;
  return keepPaths(props.document.root, (id) => {
    const node = props.document.getNode(id);
    if (!node) return false;
    const haystack = `${nodeLabel(node)} ${node.componentName} ${nodeText(node)}`.toLowerCase();
    return haystack.includes(query.value);
  });
});

const filtering = computed(() => keep.value !== null);
const noMatch = computed(() => filtering.value && keep.value!.size === 0);

function toggle(id: string) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function expand(id: string) {
  if (!collapsed.value.has(id)) return;
  const next = new Set(collapsed.value);
  next.delete(id);
  collapsed.value = next;
}

function collapse(id: string) {
  if (collapsed.value.has(id)) return;
  const next = new Set(collapsed.value);
  next.add(id);
  collapsed.value = next;
}

/** 双击的语义照引擎：展 / 收**整棵子树**，而不是只切一层 */
function toggleDeep(node: NodeImpl) {
  // 搜索态整棵树是强制展开的，折叠会让人以为搜漏了
  if (filtering.value) return;
  const expanded = !collapsed.value.has(node.id);
  const next = new Set(collapsed.value);
  const ids: string[] = [node.id];
  const walk = (current: NodeImpl) => {
    for (const child of current.children) {
      const childNode = child as NodeImpl;
      ids.push(childNode.id);
      walk(childNode);
    }
  };
  walk(node);
  for (const id of ids) {
    if (expanded) next.add(id);
    else next.delete(id);
  }
  collapsed.value = next;
}

const allCollapsed = computed(() => collapsed.value.size > 0);

function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : collapsedByDefault(props.document.root);
}

// 选中变化时把祖先全部展开，否则从画布选中的节点在树里是隐藏的
watch(
  () => props.selectedId,
  (id) => {
    if (!id) return;
    const node = props.document.getNode(id);
    if (!node) return;
    const next = new Set(collapsed.value);
    let current = node.parent;
    while (current) {
      next.delete(current.id);
      current = current.parent;
    }
    collapsed.value = next;
  },
);

/**
 * 标准树组件的键盘操作：↑↓ 在可见行之间移动，← 收起 / 回父级，
 * → 展开 / 进第一个孩子，Home / End 到首尾，Enter 定位到画布。
 */
function onKeyDown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('button')) return;

  const ids = flattenVisible(
    props.document.root,
    (id) => !filtering.value && collapsed.value.has(id),
    keep.value ?? undefined,
  );
  const node = props.selectedId ? props.document.getNode(props.selectedId) : null;
  const hasChildren = !!node && node.children.length > 0;

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault();
      const next = stepRow(ids, props.selectedId, event.key === 'ArrowDown' ? 1 : -1);
      if (next) emit('select-node', next);
      return;
    }
    case 'Home':
    case 'End': {
      event.preventDefault();
      const next = ids[event.key === 'Home' ? 0 : ids.length - 1];
      if (next) emit('select-node', next);
      return;
    }
    case 'ArrowRight': {
      if (!node) return;
      event.preventDefault();
      if (hasChildren && collapsed.value.has(node.id)) expand(node.id);
      else if (hasChildren) emit('select-node', node.children[0]!.id);
      return;
    }
    case 'ArrowLeft': {
      if (!node) return;
      event.preventDefault();
      if (hasChildren && !collapsed.value.has(node.id)) collapse(node.id);
      else if (node.parent) emit('select-node', node.parent.id);
      return;
    }
    case 'Enter': {
      if (!props.selectedId) return;
      event.preventDefault();
      emit('locate', props.selectedId);
      return;
    }
    default:
      return;
  }
}
</script>

<template>
  <div :class="styles.root">
    <PaneHeader title="页面结构" :pinned="pinned" @toggle-pin="$emit('togglePin')" @close="$emit('close')">
      <!-- 搜索态整棵树是展开的，这个按钮先收起来 -->
      <template v-if="!filtering" #extra>
        <button
          type="button"
          :class="styles.toolBtn"
          :title="allCollapsed ? '全部展开' : '全部收起'"
          :aria-label="allCollapsed ? '全部展开' : '全部收起'"
          @click="toggleAll"
        >
          <ChevronsDownUp v-if="allCollapsed" :size="14" :stroke-width="1.9" aria-hidden="true" />
          <ChevronsUpDown v-else :size="14" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </template>
    </PaneHeader>

    <div :class="styles.searchWrap">
      <span :class="styles.searchIcon" aria-hidden="true">
        <Search :size="13" :stroke-width="2" aria-hidden="true" />
      </span>
      <input
        v-model="keyword"
        :class="styles.search"
        placeholder="搜索节点"
        spellcheck="false"
        aria-label="搜索节点"
        @keydown.stop
      />
      <button
        v-if="keyword"
        type="button"
        :class="styles.searchClear"
        title="清空"
        aria-label="清空搜索"
        @click="keyword = ''"
      >
        <X :size="10" :stroke-width="2.2" aria-hidden="true" />
      </button>
    </div>

    <p v-if="noMatch" :class="styles.empty">
      没有匹配的节点
      <span :class="styles.emptyHint">试试组件名，或点 × 清空</span>
    </p>
    <div
      v-else
      ref="treeEl"
      :class="styles.tree"
      role="tree"
      aria-label="节点大纲"
      tabindex="0"
      :data-revision="revision"
      @keydown="onKeyDown"
    >
      <!-- 定宽层：宽度取整棵树最宽的那行，于是横向滚动时每一行都同宽，
           底色能一直铺到最右侧 -->
      <div :class="styles.treeInner" role="presentation">
        <TreeNode
          :node="document.root"
          :depth="0"
          :collapsed="collapsed"
          :filtering="filtering"
          :keep="keep"
          :query="query"
          :selected-id="selectedId"
          :hover-id="hoverId"
          :revision="revision"
          @toggle="toggle"
          @toggle-deep="toggleDeep"
          @select="$emit('select-node', $event)"
          @hover="$emit('hover-node', $event)"
        />
      </div>
    </div>
  </div>
</template>
