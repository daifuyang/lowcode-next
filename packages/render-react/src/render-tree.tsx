import type { ReactNode } from 'react';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import type { ReactBindings } from '@lowcode-next/materials-react';
import { createReactDriver, evaluate } from '@lowcode-next/renderer';
import type { RenderMode } from '@lowcode-next/renderer';

/**
 * 渲染内核（§12.14）—— 两个形态共用的那一段。
 *
 * 入参只有 schema 树 + 物料，**不接 document**：`evaluate` 本来就不需要文档模型
 * （`renderer-core/src/index.ts:53` 只要 `componentsTree` + `resolver`）。
 * 编辑态那份「文档变了要重渲染」的订阅，是它自己的事，加在外面。
 *
 * 这就是 render 态能比编辑态轻的根源：整条链路止于
 * `protocol → materials → materials-react → renderer`，不碰 `model`，更不碰 designer。
 */

/** schema 树 —— 直接取 `evaluate` 的入参类型，避免手写一份走样 */
export type TreeInput = Parameters<typeof evaluate>[0];

export interface RenderTreeOptions {
  registry: MaterialMetaRegistry;
  bindings: ReactBindings;
  /** `edit` 会注入空容器占位、错误块更显眼；`runtime` 都收敛 */
  mode: RenderMode;
  /** 表达式作用域（state / props / item / index / utils），默认空 */
  scope?: Record<string, unknown>;
}

export function renderTree(tree: TreeInput | undefined, options: RenderTreeOptions): ReactNode {
  if (!tree) return null;

  const driver = createReactDriver(
    {
      resolve: (componentName) => options.bindings[componentName] ?? null,
      getMeta: (componentName) => options.registry.getMeta(componentName),
    },
    {
      mode: options.mode,
      editorPlaceholder: options.mode === 'edit',
    },
  );

  const ir = evaluate(tree, {
    mode: options.mode,
    scope: options.scope ?? {},
    resolver: options.registry,
  });

  return driver.renderRoot(ir);
}
