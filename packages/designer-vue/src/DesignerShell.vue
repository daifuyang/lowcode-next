<script setup lang="ts">
import type { CSSProperties } from 'vue';

// 皮肤令牌的默认值：`:where(:root)` 声明，特异性 0，宿主写在任何位置的覆盖都能赢。
// 放在这里而不是 index.ts —— 只有真正渲染设计器外壳时才需要这些变量。
import '@lowcode-next/designer-ui/tokens.css';
import styles from '@lowcode-next/designer-ui/DesignerShell.module.css';

/**
 * 设计器外壳（Vue 版）：顶栏（左 / 中 / 右三区）+ 三栏 + 画布底栏。
 *
 * 与 React 版**同一份 CSS Module**，DOM 结构逐节点相同 —— 版式不需要"对齐"，
 * 因为 class hash 由文件路径与内容决定，两版拿到的是同一组名字（§12.13.4 D-L3-4）。
 *
 * 顶栏三区照引擎 `editor-skeleton/src/layouts/top-area.tsx`：左区自适应宽、
 * 中区 flex:1 居中、右区自适应宽 —— 布局不认识内容，按钮都由插槽传进来。
 */
withDefaults(
  defineProps<{ leftOpen?: boolean; canvasStyle?: CSSProperties }>(),
  { leftOpen: true, canvasStyle: undefined },
);

const railOnly = { '--left-width': 'var(--rail-width)' } as CSSProperties;
</script>

<template>
  <div :class="styles.root">
    <header :class="styles.toolbar">
      <div :class="styles.toolbarLeft"><slot name="toolbar-left" /></div>
      <div :class="styles.toolbarCenter"><slot name="toolbar-center" /></div>
      <div :class="styles.toolbarRight"><slot name="toolbar-right" /></div>
    </header>
    <!-- 收起时才覆盖 --left-width；展开用 CSS 里的 rail + dock-pane 默认值，
         宽度只在一处维护（DesignerShell.module.css 的 .body） -->
    <div :class="styles.body" :style="leftOpen ? undefined : railOnly">
      <aside :class="styles.panel"><slot name="left" /></aside>
      <!-- 悬浮面板：绝对定位在图标栏右侧，不参与栅格，所以画布拿满宽度。
           data-lc-overlay：它会压住画布左缘，选中框画「可视区」框时要把这块扣掉。 -->
      <div v-if="$slots['float-pane']" :class="styles.floatPane" data-lc-overlay="left-pane">
        <slot name="float-pane" />
      </div>
      <!-- 详情浮层：紧贴面板右缘往画布方向展开，同样压住画布左缘 -->
      <div v-if="$slots['detail-pane']" :class="styles.detailPane" data-lc-overlay="detail-pane">
        <slot name="detail-pane" />
      </div>
      <main :class="styles.canvasWrap">
        <div :class="styles.canvasStage">
          <div :class="styles.canvas" :style="canvasStyle">
            <slot name="canvas" />
          </div>
        </div>
        <div v-if="$slots.footer" :class="styles.footer"><slot name="footer" /></div>
      </main>
      <aside :class="styles.panelRight"><slot name="right" /></aside>
    </div>
  </div>
</template>
