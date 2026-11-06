import { describe, expect, it } from 'vitest';
import {
  contentLeft,
  flattenVisible,
  GUIDE_X,
  INDENT,
  keepPaths,
  rowBox,
  ROOT_INSET,
  stepRow,
} from './tree-layout';

describe('rowBox', () => {
  it('根节点不吃缩进，只留 6px 行首内边距', () => {
    expect(rowBox(0)).toEqual({ paddingLeft: ROOT_INSET, marginLeft: 0 });
  });

  it('每深一层内容右移 16，盒子左移同样的量', () => {
    expect(rowBox(1)).toEqual({ paddingLeft: 16, marginLeft: -16 });
    expect(rowBox(3)).toEqual({ paddingLeft: 48, marginLeft: -48 });
  });

  it('内容实际落点恒为 depth * INDENT（负外边距只是把盒子拉宽）', () => {
    for (const depth of [1, 2, 4, 6]) {
      const { paddingLeft, marginLeft } = rowBox(depth);
      // 容器已缩进 depth * INDENT，行盒是从那里往左推 marginLeft 开始的
      expect(depth * INDENT + marginLeft + paddingLeft).toBe(depth * INDENT);
    }
  });

  it('宽度补偿量（--row-indent）与负外边距等值，行的左右缘才对得齐定宽层', () => {
    for (const depth of [0, 1, 3, 6]) {
      // 相加为 0：补偿量与负外边距等值（根节点是 0 与 -0，直接用 toBe 会比错）
      expect(depth * INDENT + rowBox(depth).marginLeft).toBe(0);
    }
  });

  it('非法深度回落成根节点，且不影响后续层级', () => {
    expect(rowBox(-2)).toEqual(rowBox(0));
    expect(rowBox(Number.NaN)).toEqual(rowBox(0));
    expect(rowBox(2.7)).toEqual(rowBox(2));
  });
});

describe('contentLeft', () => {
  it('每层内容比上一层右移一个 INDENT', () => {
    expect(contentLeft(0)).toBe(ROOT_INSET);
    expect(contentLeft(1) - contentLeft(0)).toBe(INDENT);
    expect(contentLeft(3) - contentLeft(2)).toBe(INDENT);
  });

  it('参考线落在父级内容的箭头列里，且与子级内容之间留出可点的空隙', () => {
    // 第 depth 层子节点所在分支：左边界 = 父级内容落点
    const branchLeft = contentLeft(2);
    const guide = branchLeft + GUIDE_X;
    const childContent = contentLeft(3);
    expect(guide).toBeGreaterThan(branchLeft);
    expect(guide).toBeLessThan(childContent);
    expect(childContent - guide).toBeGreaterThanOrEqual(8);
  });
});

describe('flattenVisible', () => {
  const tree = {
    id: 'root',
    children: [
      { id: 'a', children: [{ id: 'a1', children: [] }, { id: 'a2', children: [] }] },
      { id: 'b', children: [{ id: 'b1', children: [] }] },
    ],
  };

  it('按深度优先列出全部可见行', () => {
    expect(flattenVisible(tree, () => false)).toEqual(['root', 'a', 'a1', 'a2', 'b', 'b1']);
  });

  it('折叠的节点只留自己，子树不进序列', () => {
    expect(flattenVisible(tree, (id) => id === 'a')).toEqual(['root', 'a', 'b', 'b1']);
    expect(flattenVisible(tree, () => true)).toEqual(['root']);
  });
});

describe('stepRow', () => {
  const ids = ['root', 'a', 'a1', 'b'];

  it('在当前行前后挪一格', () => {
    expect(stepRow(ids, 'a', 1)).toBe('a1');
    expect(stepRow(ids, 'a', -1)).toBe('root');
  });

  it('没有当前行时落到首 / 尾', () => {
    expect(stepRow(ids, null, 1)).toBe('root');
    expect(stepRow(ids, null, -1)).toBe('b');
  });

  it('到边界就停在原地，不丢选中', () => {
    expect(stepRow(ids, 'b', 1)).toBe('b');
    expect(stepRow(ids, 'root', -1)).toBe('root');
    expect(stepRow([], 'root', 1)).toBeNull();
  });
});

describe('keepPaths', () => {
  const tree = {
    id: 'root',
    children: [
      { id: 'a', children: [{ id: 'a1', children: [] }, { id: 'a2', children: [] }] },
      { id: 'b', children: [{ id: 'b1', children: [] }] },
    ],
  };

  it('命中项连同全部祖先一起保留', () => {
    expect([...keepPaths(tree, (id) => id === 'a1')].sort()).toEqual(['a', 'a1', 'root']);
  });

  it('不命中就不留子树，也不连坐兄弟节点', () => {
    const keep = keepPaths(tree, (id) => id === 'b1');
    expect(keep.has('a1')).toBe(false);
    expect(keep.has('a2')).toBe(false);
    expect(keep.has('b')).toBe(true);
  });

  it('命中容器时，没命中的孩子不会跟着进来', () => {
    expect([...keepPaths(tree, (id) => id === 'a')].sort()).toEqual(['a', 'root']);
  });

  it('一个都不命中就是空集（面板据此显示空状态）', () => {
    expect(keepPaths(tree, () => false).size).toBe(0);
  });
});

describe('flattenVisible + keep', () => {
  const tree = {
    id: 'root',
    children: [
      { id: 'a', children: [{ id: 'a1', children: [] }] },
      { id: 'b', children: [{ id: 'b1', children: [] }] },
    ],
  };

  it('只走保留集里的节点，兄弟分支整枝跳过', () => {
    const keep = keepPaths(tree, (id) => id === 'a1');
    expect(flattenVisible(tree, () => false, keep)).toEqual(['root', 'a', 'a1']);
  });

  it('搜索态的折叠由调用方忽略（面板固定传「都不折叠」）', () => {
    const keep = keepPaths(tree, (id) => id === 'a1');
    // 面板在搜索时传的是 () => false，所以可见行与折叠状态无关
    expect(flattenVisible(tree, () => false, keep)).toContain('a1');
    // 传了真的折叠函数仍然生效 —— 这条纯函数不做"搜索感知"的判断
    expect(flattenVisible(tree, (id) => id === 'a', keep)).toEqual(['root', 'a']);
  });
});
