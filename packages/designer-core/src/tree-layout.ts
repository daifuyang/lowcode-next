/**
 * 大纲树的行几何（纯函数，便于单测）。
 *
 * 树不是手风琴：行与行之间没有分隔线，层级完全靠**缩进 + 常驻的竖向参考线**表达，
 * 所以缩进步长要比"列表类"组件大一点（16），层级差才看得出来。
 *
 * 写法仍沿用 lowcode-engine `plugin-outline-pane` 的
 * `paddingLeft: indent, marginLeft: -indent`（`views/tree-title.tsx`）：
 * 负外边距把盒子往左推回树的左边界，内边距再把内容推回 `depth * INDENT`。
 * 于是**内容位置不变，盒子却是整行宽**，hover / 选中的底色才能横贯面板，
 * 深层的行也不会越缩越窄。
 *
 * 行首内边距只给根节点：非根节点如果也加，内容会比竖参考线越偏越多
 * （参考线画在每层 6px 处），最后压到展开箭头上。
 */
export const INDENT = 16;
export const ROOT_INSET = 6;
/** 分支容器里竖向参考线的横向位置（相对分支左边界） */
export const GUIDE_X = 6;

export interface RowBox {
  paddingLeft: number;
  marginLeft: number;
}

export function rowBox(depth: number): RowBox {
  const level = Number.isFinite(depth) ? Math.max(0, Math.trunc(depth)) : 0;
  if (level === 0) return { paddingLeft: ROOT_INSET, marginLeft: 0 };
  return { paddingLeft: level * INDENT, marginLeft: -(level * INDENT) };
}

/** 内容相对「面板左边界」的落点，供测试与调试断言用 */
export function contentLeft(depth: number, panelInset = ROOT_INSET): number {
  const level = Number.isFinite(depth) ? Math.max(0, Math.trunc(depth)) : 0;
  return level === 0 ? panelInset : panelInset + level * INDENT;
}

/** 树节点里算「可见行序列」所需的最小结构，便于脱离 Document 单测 */
export interface TreeLike {
  id: string;
  children: readonly TreeLike[];
}

/**
 * 深度优先展开出当前**可见**的行 id 序列（折叠节点的子树不进来）。
 * 键盘导航（↑↓ / Home / End）就是在这个序列上 ±1。
 */
export function flattenVisible(
  root: TreeLike,
  isCollapsed: (id: string) => boolean,
  /** 搜索态：只有集合里的节点参与（不命中就连子树一起跳过） */
  keep?: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  const walk = (node: TreeLike) => {
    if (keep && !keep.has(node.id)) return;
    ids.push(node.id);
    if (isCollapsed(node.id)) return;
    for (const child of node.children) walk(child);
  };
  walk(root);
  return ids;
}

/**
 * 搜索时要保留的节点：命中项 + 它们的**全部祖先**。
 * 祖先必须留下，否则命中项在树里没有挂靠点，看起来像凭空冒出来一行。
 * 命中项的子孙不自动保留（搜索是在"找节点"，不是"展开这个节点"）。
 */
export function keepPaths(root: TreeLike, match: (id: string) => boolean): Set<string> {
  const keep = new Set<string>();
  const walk = (node: TreeLike): boolean => {
    const self = match(node.id);
    let hit = self;
    for (const child of node.children) {
      if (walk(child)) hit = true;
    }
    if (hit) keep.add(node.id);
    return hit;
  };
  walk(root);
  return keep;
}

/**
 * 从 `current` 往某个方向挪一格。没有当前行时落到第一行 / 最后一行；
 * 已经在边界上就原地不动（返回原 id），不返回 null —— 免得调用方把选中丢掉。
 */
export function stepRow(
  ids: readonly string[],
  current: string | null,
  delta: 1 | -1,
): string | null {
  if (!ids.length) return null;
  const index = current ? ids.indexOf(current) : -1;
  if (index === -1) return delta > 0 ? ids[0]! : ids[ids.length - 1]!;
  const next = index + delta;
  if (next < 0 || next >= ids.length) return ids[index]!;
  return ids[next]!;
}
