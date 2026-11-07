import { computed, createApp, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { createVueDriver } from '@lowcode-next/renderer-vue';
import { evaluate } from '@lowcode-next/renderer-core';
import type { PageSchema } from '@lowcode-next/protocol';
import '@lowcode-next/materials/styles.css';
import { createVueEditorMaterials } from './materials';
import { connectCanvasChannel, lockCanvasInteractions } from '@pg/canvas-channel';
import '@pg/canvas.css';

/**
 * Vue 版画布入口（DESIGN-v1 §7.3 / §12.4）。
 *
 * 与 `canvas.tsx` 一一对应，区别只在渲染方式：这里是 Vue 组件 + `@lowcode-next/renderer-vue`，
 * 那里是 React + `@lowcode-next/renderer`。
 *
 * **iframe 隔离保持不变** —— 这也是拆物料包的前提：物料 CSS 仍然污染不了编辑器，
 * 选中框、拖拽命中、坐标换算这些建立在「同源 iframe DOM」上的机制一行都不用改。
 *
 * 消息通道与交互锁走 `canvas-channel.ts`，两版画布共用同一份实现。
 */
const CanvasApp = defineComponent({
  name: 'CanvasApp',
  setup() {
    const materials = createVueEditorMaterials();
    const state = ref<{ schema: PageSchema; padding: number } | null>(null);

    const driver = createVueDriver(materials.renderer, { editorPlaceholder: true });

    let disconnect: (() => void) | null = null;
    let unlock: (() => void) | null = null;

    onMounted(() => {
      disconnect = connectCanvasChannel({
        onSchema: (schema, padding) => {
          state.value = { schema, padding };
        },
      });
      unlock = lockCanvasInteractions();
    });

    onBeforeUnmount(() => {
      disconnect?.();
      unlock?.();
    });

    const content = computed(() => {
      const current = state.value;
      if (!current) return null;
      const ir = evaluate(current.schema.componentsTree, {
        mode: 'edit',
        scope: {},
        resolver: materials.registry,
      });
      return driver.renderRoot(ir);
    });

    return () =>
      h(
        'div',
        {
          'data-lc-canvas': '',
          style: { padding: `${state.value?.padding ?? 0}px` },
        },
        content.value ? [content.value] : [],
      );
  },
});

createApp(CanvasApp).mount('#canvas-root');
