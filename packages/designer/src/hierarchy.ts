/**
 * 选中节点的层级（祖先链）。
 *
 * 画布上的高亮框只说明"选中了这块区域"，说明不了它在树里的位置 ——
 * 一个 Hero 里套 Section → Stack → Grid → Card，选中的到底是哪一层的 Stack？
 * 所以层级要显式算出来给工具条用：标题、父级链、层级深度都从这一份数据出。
 *
 * 纯函数，只吃节点的结构字段，不碰 DOM —— 因此可以用普通对象直接单测
 * （DESIGN-v1 §2.8：凡是几何/结构推导都放纯函数层）。
 */

export const PAGE_LABEL = '页面';

/**
 * 计算层级需要的最小结构面。
 *
 * 刻意不写 `NodeImpl`：NodeImpl 满足这个形状，测试里用普通对象也能满足，
 * 免得单测为了造一个节点把 Document / registry 全套都拉起来。
 */
export interface HierarchySource {
  readonly id: string;
  readonly componentName: string;
  readonly meta: { title?: string } | null;
  readonly parent: HierarchySource | null;
  readonly children: readonly HierarchySource[];
  isContainer(): boolean;
}

export interface HierarchyItem {
  id: string;
  /** 展示名：物料 title，根节点固定是「页面」 */
  title: string;
  componentName: string;
  /** 0 = 页面根节点，往下递增 */
  depth: number;
  /** 在兄弟元素中的下标；根节点为 -1 */
  siblingIndex: number;
  /** 兄弟元素总数；根节点为 0 */
  siblingTotal: number;
  isContainer: boolean;
  hasChildren: boolean;
}

/**
 * 根 → 选中节点，深度递增。
 *
 * 顺序是"自顶向下"而不是"由近及远"：读层级时人的心智模型是
 * "页面里有个 Section，Section 里有个 Stack"，倒过来念不通。
 */
export function buildHierarchy(node: HierarchySource | null): HierarchyItem[] {
  const chain: HierarchySource[] = [];
  let current: HierarchySource | null = node;
  while (current) {
    chain.unshift(current);
    current = current.parent;
  }

  return chain.map((item, depth) => {
    const parent = item.parent;
    return {
      id: item.id,
      title: parent ? (item.meta?.title ?? item.componentName) : PAGE_LABEL,
      componentName: item.componentName,
      depth,
      // indexOf 在兄弟数组上线性查找，但一层里的兄弟数很小，不值得建索引
      siblingIndex: parent ? parent.children.indexOf(item) : -1,
      siblingTotal: parent ? parent.children.length : 0,
      isContainer: item.isContainer(),
      hasChildren: item.children.length > 0,
    };
  });
}

/** 层级面板最多回溯几层 —— lowcode 的 `getParentNodes` 里写死就是 5 */
export const PARENT_CHAIN_LIMIT = 5;

/**
 * 祖先链，自近及远：父级 → 祖父 → …
 *
 * 顺序照抄 lowcode 的 `node-selector`：它在鼠标移上工具条的标题时，
 * 从当前节点往上取父级、父级的父级……所以第一条永远是最近的父级。
 * 不含当前节点 —— 当前节点显示在工具条那截标题里，重复列一遍没意义。
 */
export function parentChain(
  items: readonly HierarchyItem[],
  limit = PARENT_CHAIN_LIMIT,
): HierarchyItem[] {
  if (limit <= 0) return [];
  return items.slice(0, -1).reverse().slice(0, limit);
}

/** "hero · Section · 2/6" —— 下拉行的 title 提示，鼠标悬停时才看得到 */
export function describeItem(item: HierarchyItem): string {
  const parts = [item.title, item.componentName, `第 ${item.depth + 1} 层`];
  if (item.siblingTotal > 1) parts.push(`${item.siblingIndex + 1}/${item.siblingTotal}`);
  if (item.isContainer) parts.push('容器');
  return parts.join(' · ');
}
