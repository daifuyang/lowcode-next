import { createMetaRegistry } from '@lowcode-next/materials';
import { builtinVueMaterialPackage, mergeVueBindings } from '@lowcode-next/materials-vue';
import type { VueRendererInput } from '@lowcode-next/renderer-vue';

/**
 * 编辑态 Vue 物料装配（DESIGN-v1 §12.4）—— 与 `materials-react.ts` 对等。
 *
 * 差别只有一处：这份用的是 `@lowcode-next/materials-vue` 的组件，所以画布渲染出来
 * 的是 Vue 组件树，不是 React。整条链路（消息通道、IR 求值、选中框、拖拽命中）
 * 完全一样 —— 它们只看 `PageSchema` 与 DOM。
 *
 * 目前 Vue 侧只实现了 3 个物料（Div / Heading / Button），`registry` 里也只有这 3 个
 * 描述，所以物料面板会诚实地只列 3 项。补齐实现时改的是 `materials-vue` 的
 * `vueMaterialNames`，这里不用动。
 */
export function createVueEditorMaterials() {
  const registry = createMetaRegistry([builtinVueMaterialPackage.meta]);
  const bindings = mergeVueBindings([builtinVueMaterialPackage]);

  const renderer: VueRendererInput = {
    resolve: (componentName) => bindings[componentName] ?? null,
    getMeta: (componentName) => registry.getMeta(componentName),
  };

  return { registry, bindings, renderer };
}
