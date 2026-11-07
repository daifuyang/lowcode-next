import '@pg/styles.css';

import { mountDesigner } from '@lowcode-next/designer-vue';
import { pickPage } from '@pg/pages';
import { openPreview } from '@pg/preview-route';
import { loadSavedSchema } from '@pg/schema-store';
import { createDesigner } from './materials';

/**
 * 编辑器入口 —— 与 `apps/playground-react/src/main.tsx` 同形，差别只有装的是哪个设计器。
 *
 * 没有分支、没有动态 `import()`：这里不存在「另一套编辑器」可以选；画布与预览
 * 也各自是独立 HTML 入口，不在这里分流。
 *
 * **默认页是「最小示例」而不是组件示例页**：Vue 侧目前只实现了 Page / Typography /
 * Button 三个物料，打开 landing 会大面积落到「未注册物料」兜底块。想对照时用
 * `?page=landing`，那一片红框就是缺口清单。
 */

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

const page = pickPage('sample');
// 启动时优先读回保存过的 schema（React 侧「保存」按 doc.id 落 localStorage；
// Vue 设计器目前是只读骨架、没有保存按钮，所以这里只接了读回）
const booted = createDesigner(loadSavedSchema(page.key) ?? page.schema, page.key);

if (!booted.ok) {
  // Vue 版没有 React 那样的错误外壳：挂载前就失败，直接写进容器
  container.textContent = `schema 校验失败：${booted.message}`;
} else {
  mountDesigner(container, {
    document: booted.document,
    registry: booted.registry,
    canvasPadding: page.padding,
    preview: () => openPreview(booted.document.toSchema()),
  });
}
