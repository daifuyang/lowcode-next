import { createMetaRegistry } from '@lowcode-next/materials';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import { builtinVueMaterialPackage, mergeVueBindings } from '@lowcode-next/materials-vue';
import { createDocument } from '@lowcode-next/model';
import type { DocumentImpl } from '@lowcode-next/model';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import type { VueRendererInput } from '@lowcode-next/renderer-vue';

/**
 * 物料装配 —— **想加自己的物料包，只改这个文件**（与 React 版对等）。
 *
 * 与 `playground-react/src/materials.ts` 的差别只有一处：实现来自
 * `@lowcode-next/materials-vue`，所以画布渲染出来的是 Vue 组件树。
 * 整条链路（消息通道、IR 求值、选中框、拖拽命中）完全一样 —— 它们只看
 * `PageSchema` 与 DOM。
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

/** 装配成功：编辑器需要的一切 */
export interface DesignerReady {
  ok: true;
  registry: MaterialMetaRegistry;
  document: DocumentImpl;
}

/** 装配失败：schema 没过校验 */
export interface DesignerFailed {
  ok: false;
  message: string;
}

export type DesignerBoot = DesignerReady | DesignerFailed;

/**
 * 一步建好编辑器 —— **业务方要用的就是这一个函数**。
 *
 * 替调用方做完四件必须按序做的事：造物料注册表 → 校验 schema → 建文档 → 交回来。
 * 不返回 renderer：编辑态宿主不渲染，画布是另一个 iframe 自己装的。
 */
export function createDesigner(schema: PageSchema, key = 'page'): DesignerBoot {
  const { registry } = createVueEditorMaterials();
  try {
    return { ok: true, registry, document: createDocument(parsePageSchema(schema), registry, key) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
