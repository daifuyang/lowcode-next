import type { NodeImpl } from '@lowcode-next/model';

/**
 * 大纲面板的**纯规则**（DESIGN-v1 §12.13.2）：行标题与默认折叠态。
 *
 * 这两件事看起来很小，但它们是"打开同一页面，两版看到的树不一样"的直接来源：
 * 标题回落顺序、默认展开哪几层，一改就改变用户的第一个印象。
 */

/**
 * 行标题：根节点是"页面"；其余按 `schema.title` → `meta.title` → `componentName` 回落。
 *
 * 层级与 lowcode 一致：`NodeSchema.title` 是"这个节点叫什么"（用户起的名字，可改），
 * `meta.title` 是"这类组件叫什么"（物料给的默认名）。
 */
export function nodeLabel(node: NodeImpl): string {
  if (!node.parent) return '页面';
  return node.schema.title ?? node.meta?.title ?? node.componentName;
}

/** 节点的文本内容（文本类节点才有），既做行尾摘要也参与搜索 */
export function nodeText(node: NodeImpl): string {
  return (node.schema.children ?? [])
    .filter((child): child is string => typeof child === 'string')
    .join('')
    .trim();
}

/**
 * 大纲的默认折叠态：**除根节点外的所有容器都收起**，只摊开第一层。
 *
 * 全展开时这个页面有九十多行，一进来就是一片；而大纲的首要任务是"找到某个节点"，
 * 全铺开反而要先滚动。根节点留着展开，是为了让第一层（导航栏 / 首屏 / 区块 …）
 * 直接可见 —— 连根都收起就只剩一行"页面"，看起来像树没加载出来。
 *
 * 默认视图里根节点保持展开（连根都收起只剩一行"页面"，像树没加载出来）；
 * 但「全部收起」**按钮**的目标集合不含这条豁免 —— 见 `collapsibleIds`。
 */
export function collapsedByDefault(root: NodeImpl): Set<string> {
  const ids = collapsibleIds(root);
  ids.delete(root.id);
  return ids;
}

/**
 * 「全部收起」按钮的目标集合：**所有**有孩子的节点（含根）。
 *
 * 默认折叠态豁免根节点是"第一印象"的取舍；按钮是显式动作，用户点它就是要
 * 看到整棵树收到最简 —— 尤其扁平 schema（示例页全是叶子，唯一可折叠的就是
 * 根）下，排除根会让按钮点了毫无变化，看起来像坏了。
 */
export function collapsibleIds(root: NodeImpl): Set<string> {
  const ids = new Set<string>();
  const walk = (node: NodeImpl) => {
    if (node.children.length) ids.add(node.id);
    for (const child of node.children) walk(child as NodeImpl);
  };
  walk(root);
  return ids;
}
