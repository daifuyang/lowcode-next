import { createApp, defineComponent, h } from 'vue';
import { createVueDriver } from '@lowcode-next/renderer-vue';
import { evaluate } from '@lowcode-next/renderer-core';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import '@lowcode-next/materials/styles.css';
import { createVueEditorMaterials } from './materials';
import { PREVIEW_KEY } from '@pg/preview-route';
import styles from '@pg/shell.module.css';

/**
 * Vue 版预览页入口（`preview.html` → `/preview`）。
 *
 * 与 React 版对等：都是**运行态渲染**（没有编辑态占位、没有 designer 外壳），
 * 区别只在用哪套物料 —— Vue 版用自己的，这样「编辑器里看到的」和「预览里看到的」
 * 由同一份实现产生。用 React 物料渲染 Vue 编辑器搭的页面，虽然共用 `lc-*` 样式，
 * 但 DOM 只要有一处不同（比如属性顺序、空文本节点），就会出现两套观感。
 *
 * schema 仍经 sessionStorage 从编辑器传过来 —— 同源新窗口共享。
 */
function readSchema(): PageSchema | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    return raw ? parsePageSchema(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const PreviewApp = defineComponent({
  name: 'PreviewApp',
  setup() {
    const materials = createVueEditorMaterials();
    const schema = readSchema();

    return () => {
      if (!schema) {
        return h('div', { class: styles.fatal }, [
          h('p', { class: styles.fatalTitle }, '预览数据不存在'),
          h(
            'pre',
            { class: styles.code },
            '请从编辑器的「预览」按钮进入（schema 经 sessionStorage 传递）。',
          ),
        ]);
      }

      // 运行态 driver：不注入空容器占位等编辑态元素
      const driver = createVueDriver(materials.renderer);
      const ir = evaluate(schema.componentsTree, {
        mode: 'runtime',
        scope: {},
        resolver: materials.registry,
      });

      return h('div', { class: styles.preview }, [
        h('div', { class: styles.previewBar }, [
          h('span', { class: styles.previewTitle }, `预览模式 · ${String(schema.meta?.title ?? '页面')}`),
          h(
            'button',
            { type: 'button', class: styles.previewClose, onClick: () => window.close() },
            '返回编辑',
          ),
        ]),
        h('div', { class: styles.previewStage }, [driver.renderRoot(ir)]),
      ]);
    };
  },
});

createApp(PreviewApp).mount('#root');
