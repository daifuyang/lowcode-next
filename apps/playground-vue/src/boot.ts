import { mountDesigner } from '@lowcode-next/designer-vue';
import type { DocumentImpl } from '@lowcode-next/model';
import { createDocument } from '@lowcode-next/model';
import { parsePageSchema, sampleSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';

import { createVueEditorMaterials } from './materials';
import { landingSchema } from '@pg/schemas/landing';
import { openPreview } from '@pg/preview-route';

/**
 * Vue 版编辑器装配（与 `playground-react/src/App.tsx` 一一对应）。
 *
 * 画布也走 Vue（`canvas.html` → `apps/shared/src/canvas-vue.ts`），物料来自
 * `@lowcode-next/materials-vue`。编辑器与画布之间只交换 `PageSchema` 与 DOM 契约，
 * 前者甚至不知道画布里渲染的是什么框架。
 *
 * **默认页是「最小示例」而不是落地页**：Vue 侧目前只实现了 Div / Heading / Button
 * 三个物料，打开落地页会大面积落到「未注册物料」兜底块。想要对照时用 `?page=landing`，
 * 那一片红框就是缺口清单。
 *
 * 这里不做自动装配：与 React 版一样，registry / document 显式构造后注入。
 */
export function boot() {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');

  const { registry } = createVueEditorMaterials();
  // 缺省 sample：Vue 物料未补齐前，落地页示例大部分渲染不出来（见上方注释）
  const page = new URLSearchParams(globalThis.location.search).get('page') === 'landing'
    ? 'landing'
    : 'sample';
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
