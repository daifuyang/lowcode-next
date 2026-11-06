import type { NodeSchema } from '@lowcode-next/protocol';
import { createNodeId } from '@lowcode-next/model';

/**
 * 复制节点：整棵子树换新 id。
 *
 * lowcode 的 `copy` 动作是 `doc.insertNode(parent, node, index + 1)` 再
 * `deduplicateRef`；我们这边没有 insertNode 的语法糖，走的是
 * `InsertNode(parentId, index, schema)`，所以复制这件事就等于
 * "拿到一份 id 全新的 schema"。
 *
 * id 必须重建：document 里 id 是唯一键，撞了会把原节点从注册表里顶掉。
 * props 也要深拷贝，否则新节点改属性会顺着引用改到原节点。
 */
export function cloneNodeSchema(
  schema: NodeSchema,
  prefix = schema.componentName.toLowerCase(),
): NodeSchema {
  const clone: NodeSchema = { ...schema, id: createNodeId(prefix) };

  if (schema.props) clone.props = cloneValue(schema.props);
  if (schema.meta) clone.meta = cloneValue(schema.meta);
  if (schema.loopArgs) clone.loopArgs = cloneValue(schema.loopArgs);

  if (schema.children) {
    clone.children = schema.children.map((child) =>
      typeof child === 'string' ? child : cloneNodeSchema(child),
    );
  }

  return clone;
}

/** props 里可能混进函数，structuredClone 会抛，退化成原引用 */
function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
