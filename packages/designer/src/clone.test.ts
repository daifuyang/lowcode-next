import { describe, expect, it } from 'vitest';
import type { NodeSchema } from '@lowcode-next/protocol';
import { cloneNodeSchema } from './clone';

const source: NodeSchema = {
  id: 'stack_1',
  componentName: 'Stack',
  props: { direction: 'column', gap: 12 },
  hidden: false,
  children: [
    { id: 'title_1', componentName: 'Title', props: { text: '把结构还给数据' } },
    {
      id: 'grid_1',
      componentName: 'Grid',
      children: [{ id: 'card_1', componentName: 'Card', children: ['纯文本子节点'] }],
    },
  ],
};

function collectIds(schema: NodeSchema): string[] {
  const ids = [schema.id];
  for (const child of schema.children ?? []) {
    if (typeof child !== 'string') ids.push(...collectIds(child));
  }
  return ids;
}

describe('cloneNodeSchema', () => {
  it('整棵子树换新 id，且与原树不重复', () => {
    const clone = cloneNodeSchema(source, 'stack');

    const originalIds = collectIds(source);
    const cloneIds = collectIds(clone);

    expect(cloneIds).toHaveLength(originalIds.length);
    expect(new Set([...originalIds, ...cloneIds]).size).toBe(originalIds.length * 2);
    expect(clone.id).toMatch(/^stack_/);
  });

  it('保留组件名与结构，字符串子节点原样带过去', () => {
    const clone = cloneNodeSchema(source);

    expect(clone.componentName).toBe('Stack');
    expect(clone.hidden).toBe(false);

    const grid = clone.children![1] as NodeSchema;
    const card = grid.children![0] as NodeSchema;
    expect(card.children).toEqual(['纯文本子节点']);
  });

  it('props 深拷贝：改克隆不影响原节点', () => {
    const clone = cloneNodeSchema(source);
    (clone.props as Record<string, unknown>).gap = 99;

    expect(source.props!.gap).toBe(12);
  });

  it('复制出来的两份互不相同（连续复制两次）', () => {
    const first = cloneNodeSchema(source);
    const second = cloneNodeSchema(source);

    expect(first.id).not.toBe(second.id);
    expect(collectIds(first)[1]).not.toBe(collectIds(second)[1]);
  });
});
