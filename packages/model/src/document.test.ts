import { describe, expect, it } from 'vitest';
import type { ComponentMeta, PageSchema } from '@lowcode-next/protocol';
import { createDocument } from './document';
import { InsertNode, MoveNode, RemoveNode, SetProps } from './commands';
import type { MaterialResolver } from './index';

const divMeta: ComponentMeta = {
  componentName: 'Div',
  title: '容器',
  props: {},
  configure: { component: { isContainer: true }, supports: {} },
};

const buttonMeta: ComponentMeta = {
  componentName: 'Button',
  title: '按钮',
  props: {},
  configure: { component: {}, supports: {} },
};

const metas: Record<string, ComponentMeta> = {
  Div: divMeta,
  Button: buttonMeta,
};

const resolver: MaterialResolver = {
  getMeta: (name) => metas[name] ?? null,
};

function makeSchema(): PageSchema {
  return {
    version: '1.0.0',
    componentsMap: [
      { componentName: 'Div', package: 'builtin' },
      { componentName: 'Button', package: 'builtin' },
    ],
    componentsTree: {
      id: 'root',
      componentName: 'Div',
      children: [
        { id: 'a', componentName: 'Button', children: ['A'] },
        { id: 'b', componentName: 'Button', children: ['B'] },
        { id: 'box', componentName: 'Div', children: [] },
      ],
    },
  };
}

describe('Document', () => {
  it('构建后可按下标取到所有节点', () => {
    const doc = createDocument(makeSchema(), resolver);
    expect(doc.root.id).toBe('root');
    expect(doc.getNode('a')?.componentName).toBe('Button');
    expect(doc.getNode('box')?.isContainer()).toBe(true);
    expect(doc.getNode('a')?.isContainer()).toBe(false);
    expect(doc.getNode('missing')).toBeNull();
  });

  it('index() 返回元素下标', () => {
    const doc = createDocument(makeSchema(), resolver);
    expect(doc.getNode('a')?.index()).toBe(0);
    expect(doc.getNode('box')?.index()).toBe(2);
  });

  it('contains 能识别自身与子孙', () => {
    const doc = createDocument(makeSchema(), resolver);
    const box = doc.getNode('box')!;
    expect(box.contains(box)).toBe(true);
    expect(doc.root.contains(box)).toBe(true);
    expect(box.contains(doc.root)).toBe(false);
  });
});

describe('InsertNode', () => {
  it('插入后结构与 schema 同步', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new InsertNode('root', 1, { componentName: 'Button', children: ['C'] });
    doc.apply(command);

    expect(doc.root.children.map((node) => node.id)).toEqual([
      'a',
      command.nodeId,
      'b',
      'box',
    ]);
    expect(doc.toSchema().componentsTree.children).toHaveLength(4);
  });

  it('revert 后回到原状', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new InsertNode('root', 0, { componentName: 'Button' });
    doc.apply(command);
    command.revert(doc as never);

    expect(doc.root.children.map((node) => node.id)).toEqual(['a', 'b', 'box']);
    expect(doc.getNode(command.nodeId)).toBeNull();
  });

  it('插到文本节点之间时 schema 下标依然正确', () => {
    const schema = makeSchema();
    schema.componentsTree.children = ['前缀', { id: 'a', componentName: 'Button' }];
    const doc = createDocument(schema, resolver);

    const command = new InsertNode('root', 1, { componentName: 'Button' });
    doc.apply(command);

    const children = doc.toSchema().componentsTree.children!;
    expect(children).toHaveLength(3);
    expect(children[0]).toBe('前缀');
    expect(typeof children[2]).toBe('object');
  });
});

describe('MoveNode', () => {
  it('同容器重排', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new MoveNode('a', { containerId: 'root', index: 2 }));

    expect(doc.root.children.map((node) => node.id)).toEqual(['b', 'box', 'a']);
  });

  it('跨容器移动', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new MoveNode('a', { containerId: 'box', index: 0 }));

    expect(doc.root.children.map((node) => node.id)).toEqual(['b', 'box']);
    expect(doc.getNode('box')?.children.map((node) => node.id)).toEqual(['a']);
    expect(doc.getNode('a')?.parent?.id).toBe('box');
  });

  it('revert 回到原位置', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new MoveNode('b', { containerId: 'box', index: 0 });
    doc.apply(command);
    command.revert(doc as never);

    expect(doc.root.children.map((node) => node.id)).toEqual(['a', 'b', 'box']);
    expect(doc.getNode('box')?.children).toHaveLength(0);
  });
});

describe('RemoveNode', () => {
  it('删除并可回滚', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new RemoveNode('b');
    doc.apply(command);
    expect(doc.getNode('b')).toBeNull();
    expect(doc.root.children).toHaveLength(2);

    command.revert(doc as never);
    expect(doc.root.children.map((node) => node.id)).toEqual(['a', 'b', 'box']);
  });

  it('删除容器会一并注销子树', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new MoveNode('a', { containerId: 'box', index: 0 }));
    doc.apply(new RemoveNode('box'));

    expect(doc.getNode('box')).toBeNull();
    expect(doc.getNode('a')).toBeNull();
  });
});

describe('SetProps', () => {
  it('合并 patch 且能回滚', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new SetProps('a', { type: 'primary' });
    doc.apply(command);

    expect(doc.getNode('a')?.props.type).toBe('primary');

    command.revert(doc as never);
    expect(doc.getNode('a')?.props.type).toBeUndefined();
  });
});

describe('变更广播', () => {
  it('apply 会带着变更类型通知订阅者', () => {
    const doc = createDocument(makeSchema(), resolver);
    const events: string[] = [];
    doc.subscribe((change) => events.push(change.type));

    doc.apply(new InsertNode('root', 0, { componentName: 'Button' }));
    doc.apply(new MoveNode('a', { containerId: 'root', index: 0 }));
    doc.apply(new RemoveNode('a'));

    expect(events).toEqual(['node.add', 'node.move', 'node.remove']);
  });
});
