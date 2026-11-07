import { builtinMaterialPackage, createMetaRegistry } from '@lowcode-next/materials';
import { builtinReactMaterialPackage, mergeReactBindings } from '@lowcode-next/materials-react';
import type { ReactRendererInput } from '@lowcode-next/renderer';

/**
 * 编辑态/运行态共用的 React 物料装配（DESIGN-v1 §12.4）。
 *
 * 拆包之后这个函数就是「把描述与实现配起来」的唯一一处：
 *
 * ```text
 * @lowcode-next/materials        → registry （面板 / 属性面板 / 拖拽 / 求值器都用它）
 * @lowcode-next/materials-react  → bindings （只有 Driver 用）
 * ```
 *
 * 两者之间**只靠 componentName 相连**。Driver 拿到的是两个函数，不是注册表对象 ——
 * 这样它才能对「Vue 物料」一无所知。
 *
 * 想加业务物料包时只改这里：
 * ```ts
 * const registry = createMetaRegistry([builtinMaterialPackage, businessMeta]);
 * const bindings = mergeReactBindings([builtinReactMaterialPackage, businessReact]);
 * ```
 */
export function createReactEditorMaterials() {
  const registry = createMetaRegistry([builtinMaterialPackage]);
  const bindings = mergeReactBindings([builtinReactMaterialPackage]);

  const renderer: ReactRendererInput = {
    resolve: (componentName) => bindings[componentName] ?? null,
    getMeta: (componentName) => registry.getMeta(componentName),
  };

  return { registry, bindings, renderer };
}
