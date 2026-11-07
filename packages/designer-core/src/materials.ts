import type { NodeSchema } from '@lowcode-next/protocol';

/**
 * 设计时对物料注册表的**最小依赖**（DESIGN-v1 §12.13.2）。
 *
 * 这里刻意不用 `@lowcode-next/renderer` 的 `MaterialRegistry` 具体类：
 * `designer-core` 只认识「能不能查到一个物料的 meta」这件事，具体实现（内置表、
 * 第三方插件表、未来的远端表）由宿主注入。结构化类型让 `MaterialRegistry` 天然
 * 满足它，不需要在 core 里 import 渲染层。
 */
export interface MaterialLookup {
  /** 有没有这个物料 —— 拖拽落点合法性用 */
  has(componentName: string): boolean;
  /** 取 meta（`defaultSchema` 用于拖入时生成初始节点）；未知物料返回 null/undefined */
  getMeta(componentName: string): MaterialMetaLike | null | undefined;
}

export interface MaterialMetaLike {
  componentName?: string;
  /** 拖入时使用的初始 schema（不含 id，插入时生成） */
  defaultSchema?: Record<string, unknown>;
}

/** 把 meta 的 `defaultSchema` 收窄成可插入的节点模板 */
export function defaultInsertTemplate(
  meta: MaterialMetaLike | null | undefined,
  componentName: string,
): Omit<NodeSchema, 'id'> {
  return (meta?.defaultSchema ?? { componentName }) as Omit<NodeSchema, 'id'>;
}
