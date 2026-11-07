import { describe, expect, it } from 'vitest';
import {
  buildHierarchy,
  describeItem,
  PAGE_LABEL,
  parentChain,
  PARENT_CHAIN_LIMIT,
} from './hierarchy';
import type { HierarchySource } from './hierarchy';

/**
 * 造一个最小节点：只要能表达父子、兄弟、容器能力。
 * 这里刻意不用 NodeImpl —— 层级推导不该依赖 Document/registry。
 */
function make(
  id: string,
  children: HierarchySource[] = [],
  options: { title?: string; container?: boolean; componentName?: string } = {},
): HierarchySource {
  const node: HierarchySource = {
    id,
    componentName: options.componentName ?? (options.container ? 'Div' : 'Text'),
    meta: options.title ? { title: options.title } : null,
    parent: null,
    children,
    isContainer: () => options.container ?? false,
  };
  for (const child of children) {
    (child as { parent: HierarchySource | null }).parent = node;
  }
  return node;
}

describe('buildHierarchy', () => {
  it('未选中节点返回空链', () => {
    expect(buildHierarchy(null)).toEqual([]);
  });

  it('根节点：深度 0、无兄弟序号、标题固定为「页面」', () => {
    const root = make('root', [], { container: true });
    const [only] = buildHierarchy(root);
    expect(only!.depth).toBe(0);
    expect(only!.title).toBe(PAGE_LABEL);
    expect(only!.siblingIndex).toBe(-1);
    expect(only!.siblingTotal).toBe(0);
  });

  it('根 → 选中节点，顺序自顶向下', () => {
    const target = make('card', [], { title: '卡片' });
    const stack = make('stack', [target], { container: true });
    const root = make('root', [stack], { container: true });

    const chain = buildHierarchy(target);
    expect(chain.map((item) => item.id)).toEqual(['root', 'stack', 'card']);
    expect(chain.map((item) => item.depth)).toEqual([0, 1, 2]);
  });

  it('兄弟序号按父节点的元素子节点算，不是 schema.children 的混排下标', () => {
    const target = make('c', [], { title: 'C' });
    const root = make('root', [make('a'), make('b'), target], { container: true });

    const chain = buildHierarchy(target);
    const last = chain[chain.length - 1]!;
    expect(last.siblingIndex).toBe(2);
    expect(last.siblingTotal).toBe(3);
  });

  it('标题回落：无 meta.title 时用物料名', () => {
    const target = make('x', [], { componentName: 'Stack', container: true });
    const root = make('root', [target], { container: true });

    const chain = buildHierarchy(target);
    expect(chain[1]!.title).toBe('Stack');
    expect(chain[1]!.componentName).toBe('Stack');
    expect(chain[1]!.isContainer).toBe(true);
  });

  it('hasChildren 反映子节点存在，与是否容器无关', () => {
    const leaf = make('leaf');
    const parent = make('p', [leaf], { container: true, title: 'P' });
    const root = make('root', [parent], { container: true });

    const chain = buildHierarchy(leaf);
    expect(chain.map((item) => item.hasChildren)).toEqual([true, true, false]);
  });
});

describe('parentChain', () => {
  function chainOf(): ReturnType<typeof buildHierarchy> {
    const target = make('card', [], { title: '卡片' });
    const stack = make('stack', [target], { container: true, title: '堆叠' });
    const section = make('section', [stack], { container: true, title: '首屏' });
    make('root', [section], { container: true });
    return buildHierarchy(target);
  }

  it('自近及远：父级在最前，且不含当前节点', () => {
    const ids = parentChain(chainOf()).map((item) => item.id);
    expect(ids).toEqual(['stack', 'section', 'root']);
  });

  it('超过上限时只保留最近的几层（引擎写死 5 层）', () => {
    expect(PARENT_CHAIN_LIMIT).toBe(5);
    expect(parentChain(chainOf(), 2).map((item) => item.id)).toEqual(['stack', 'section']);
  });

  it('根节点没有祖先', () => {
    const root = make('root', [], { container: true });
    expect(parentChain(buildHierarchy(root))).toEqual([]);
  });

  it('limit 为 0 时返回空数组', () => {
    expect(parentChain(chainOf(), 0)).toEqual([]);
  });
});

describe('describeItem', () => {
  it('带上层级深度与兄弟序号', () => {
    const [item] = buildHierarchy(make('a'));
    expect(describeItem(item!)).toContain('第 1 层');
  });

  it('单子节点不显示 1/1，容器追加容器标记', () => {
    const target = make('only-child', [], { container: true });
    make('root', [target], { container: true });
    const chain = buildHierarchy(target);
    const text = describeItem(chain[1]!);
    expect(text).not.toContain('1/1');
    expect(text).toContain('容器');
  });
});
