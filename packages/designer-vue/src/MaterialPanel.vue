<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { ChevronRight, Search } from '@lucide/vue';

import MatIcon from './MatIcon.vue';
import PaneHeader from './PaneHeader.vue';
import styles from '@lowcode-next/designer-ui/MaterialPanel.module.css';

/**
 * 物料面板（Vue 版，M-L3-3 只读骨架）。
 *
 * 结构、分组、搜索与 React 版一致；**唯一的差别是卡片不起拖** —— 只读骨架的
 * 判据是「无可写入口」，拖入会构造 `InsertNode` 进历史栈，属于写操作。
 * 分组折叠、搜索自动展开全部分组这些行为照旧（纯 UI 状态）。
 */
const props = withDefaults(defineProps<{ registry: MaterialMetaRegistry; pinned?: boolean }>(), {
  pinned: false,
});

defineEmits<{ togglePin: []; close: [] }>();

interface Group {
  name: string;
  items: ComponentMeta[];
}

const keyword = ref('');
const collapsed = ref<ReadonlySet<string>>(new Set());

/**
 * 订阅注册表版本号：宿主在编辑过程中 `use()` 一个新物料包，面板立刻重算。
 *
 * 与 React 版（`useSyncExternalStore`）等价。没有这层订阅时，`list()` 结果变了
 * 面板也不会刷新 —— `computed` 只依赖 `props.registry` 这个对象，实例是不变的。
 */
const version = ref(props.registry.getVersion());
let stopWatching: (() => void) | null = null;

onMounted(() => {
  stopWatching = props.registry.subscribe(() => {
    version.value = props.registry.getVersion();
  });
});
onBeforeUnmount(() => {
  stopWatching?.();
});

const groups = computed<Group[]>(() => {
  // 读一次 version 建立依赖，物料增删后这里必须重算
  void version.value;
  const map = new Map<string, ComponentMeta[]>();
  for (const meta of props.registry.list()) {
    // hidden 物料（页面壳 Page）不进面板 —— 与 React 版 MaterialPanel 同一约定
    if (meta.configure.component.hidden) continue;
    const name = meta.group ?? '其他';
    const bucket = map.get(name);
    if (bucket) bucket.push(meta);
    else map.set(name, [meta]);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

const query = computed(() => keyword.value.trim().toLowerCase());

const filtered = computed<Group[]>(() => {
  if (!query.value) return groups.value;
  return groups.value
    .map((group) => ({
      name: group.name,
      items: group.items.filter(
        (meta) =>
          meta.title.toLowerCase().includes(query.value) ||
          meta.componentName.toLowerCase().includes(query.value),
      ),
    }))
    .filter((group) => group.items.length > 0);
});

function toggle(name: string) {
  const next = new Set(collapsed.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  collapsed.value = next;
}
</script>

<template>
  <div :class="styles.root">
    <PaneHeader title="组件库" :pinned="pinned" @toggle-pin="$emit('togglePin')" @close="$emit('close')" />

    <div :class="styles.searchWrap">
      <span :class="styles.searchIcon" aria-hidden="true">
        <Search :size="13" :stroke-width="2" />
      </span>
      <input
        v-model="keyword"
        :class="styles.search"
        placeholder="搜索组件"
        spellcheck="false"
      />
    </div>

    <p v-if="filtered.length === 0" :class="styles.empty">没有匹配的物料</p>
    <template v-else>
      <section v-for="group in filtered" :key="group.name" :class="styles.group">
        <button type="button" :class="styles.groupTitle" @click="toggle(group.name)">
          <!-- 搜索态强制展开：命中项藏在折叠分组里等于搜不到 -->
          <span :class="styles.groupCaret" :data-open="!query && collapsed.has(group.name) ? undefined : true">
            <ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
          </span>
          <span :class="styles.groupName">{{ group.name }}</span>
          <span :class="styles.groupCount">{{ group.items.length }}</span>
        </button>
        <ul v-if="query || !collapsed.has(group.name)" :class="styles.grid">
          <li
            v-for="meta in group.items"
            :key="meta.componentName"
            :class="styles.card"
            :data-material="meta.componentName"
            :title="`${meta.title} · ${meta.componentName}`"
          >
            <span :class="styles.cardIcon">
              <MatIcon :name="meta.componentName" :size="24" />
            </span>
            <span :class="styles.cardName">{{ meta.title }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
