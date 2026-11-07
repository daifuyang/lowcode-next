import { mountDesigner } from '@lowcode-next/designer-vue';
import type { DocumentImpl } from '@lowcode-next/model';
import { createDocument } from '@lowcode-next/model';
import { builtinMaterials, createMaterialRegistry } from '@lowcode-next/renderer';
import { parsePageSchema, sampleSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';

import { landingSchema } from '@pg/schemas/landing';
import { openPreview } from '@pg/preview-route';

/**
 * Vue 版编辑器装配（与 `playground-react/src/App.tsx` 一一对应）。
 *
 * 画布**仍然是 React 渲染的**（`canvas.html` 走 renderer-react）—— 这正是
 * §12.13.6 组合矩阵里「Vue 编辑器 + React 画布」那一格：两者只交换
 * `PageSchema` 与 DOM 契约，没有 import 关系。
 *
 * 这里不做自动装配：与 React 版一样，registry / document 显式构造后注入。
 */
export function boot() {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');

  const registry = createMaterialRegistry(builtinMaterials);
  const page = new URLSearchParams(globalThis.location.search).get('page') === 'sample'
    ? 'sample'
    : 'landing';
  const source: PageSchema = page === 'sample' ? sampleSchema : landingSchema;

  let doc: DocumentImpl;
  try {
    doc = createDocument(parsePageSchema(source), registry, page);
  } catch (error) {
    container.textContent = `schema 校验失败：${(error as Error).message}`;
    return;
  }

  mountDesigner(container, {
    document: doc,
    registry,
    // 整幅落地页贴边，最小示例留 20px —— 与 React 版的 PAGES 表一致
    canvasPadding: page === 'sample' ? 20 : 0,
    preview: () => openPreview(doc.toSchema()),
  });
}
