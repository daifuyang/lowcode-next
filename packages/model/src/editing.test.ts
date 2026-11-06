import { describe, expect, it } from 'vitest';
import type { ComponentMeta, PageSchema } from '@lowcode-next/protocol';
import { createDocument } from './document';
import { SetFlag, SetProps, SetText, SetTitle } from './commands';
import { History } from './history';
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

const resolver: MaterialResolver = {
  getMeta: (name) => ({ Div: divMeta, Button: buttonMeta })[name] ?? null,
};

function makeSchema(): PageSchema {
  return {
    version: '1.0.0',
    componentsMap: [{ componentName: 'Div', package: 'builtin' }],
    componentsTree: {
      id: 'root',
      componentName: 'Div',
      children: [
        { id: 'a', componentName: 'Button', children: ['A'] },
        { id: 'box', componentName: 'Div', children: [{ id: 'inner', componentName: 'Button' }] },
      ],
    },
  };
}

describe('SetProps', () => {
  it('undefined 表示删除该键，而不是写一个 undefined', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new SetProps('a', { variant: 'primary' }));

    expect(doc.getNode('a')?.props.variant).toBe('primary');

    doc.apply(new SetProps('a', { variant: undefined }));

    // 关键是键本身消失：留着 undefined 会让导出的 schema 既不是"没设置"
    // 也不合法，物料那边还会因为 num(undefined) 悄悄回落默认值
    expect('variant' in (doc.getNode('a')?.props ?? {})).toBe(false);
  });

  it('revert 回到整轮输入之前（合并后的语义）', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new SetProps('a', { variant: 'primary' });
    doc.apply(command);
    doc.apply(new SetProps('a', { variant: 'ghost' }));
    doc.apply(new SetProps('a', { variant: 'outline' }));

    command.revert(doc as never);
    expect(doc.getNode('a')?.props.variant).toBeUndefined();
  });
});

describe('SetText', () => {
  it('改文案并同步 schema.children', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new SetText('a', '新文案'));

    expect(doc.getNode('a')?.schema.children).toEqual(['新文案']);
    expect(doc.toSchema().componentsTree.children?.[0]).toMatchObject({
      id: 'a',
      children: ['新文案'],
    });
  });

  it('清空文案会移除 children 里的文本', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new SetText('a', ''));
    expect(doc.getNode('a')?.schema.children).toEqual([]);
  });

  it('revert 恢复原文案', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new SetText('a', '改过');
    doc.apply(command);
    command.revert(doc as never);

    expect(doc.getNode('a')?.schema.children).toEqual(['A']);
  });

  it('有元素子节点时拒绝改文案', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new SetText('box', '想覆盖'));

    // box 里有个 inner 按钮，这里不该被一行字符串顶掉
    expect(doc.getNode('box')?.schema.children).toMatchObject([{ id: 'inner' }]);
  });
});

describe('SetFlag', () => {
  it('打开 hidden 写入 schema，关掉时删除键', () => {
    const doc = createDocument(makeSchema(), resolver);

    doc.apply(new SetFlag('a', { hidden: true }));
    expect(doc.getNode('a')?.schema.hidden).toBe(true);

    doc.apply(new SetFlag('a', { hidden: false }));
    expect('hidden' in (doc.getNode('a')?.schema ?? {})).toBe(false);
  });

  it('revert 恢复初始开关状态', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new SetFlag('a', { locked: true });
    doc.apply(command);
    expect(doc.getNode('a')?.locked).toBe(true);

    command.revert(doc as never);
    expect(doc.getNode('a')?.locked).toBe(false);
  });
});

describe('SetTitle', () => {
  it('写入 schema.title，能被序列化带出去', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new SetTitle('a', '主按钮'));

    expect(doc.getNode('a')?.schema.title).toBe('主按钮');
    expect(doc.toSchema().componentsTree.children?.[0]).toMatchObject({
      id: 'a',
      title: '主按钮',
    });
  });

  it('空白标题等于没起名：删除键而不是留空串', () => {
    const doc = createDocument(makeSchema(), resolver);
    doc.apply(new SetTitle('a', '主按钮'));
    doc.apply(new SetTitle('a', '   '));

    // 留着空串的话大纲会渲染成空白行，导出的 schema 里也多一个无意义字段
    expect('title' in (doc.getNode('a')?.schema ?? {})).toBe(false);
  });

  it('revert 回到改名之前', () => {
    const doc = createDocument(makeSchema(), resolver);
    const command = new SetTitle('box', '导航区');
    doc.apply(command);
    expect(doc.getNode('box')?.schema.title).toBe('导航区');

    command.revert(doc as never);
    expect(doc.getNode('box')?.schema.title).toBeUndefined();
  });

  it('撤销 / 重做不会把改完的标题当成旧值', () => {
    const doc = createDocument(makeSchema(), resolver);
    const history = new History(doc);

    history.execute(new SetTitle('a', '第一版'));
    history.undo();
    history.redo();
    expect(doc.getNode('a')?.schema.title).toBe('第一版');

    history.undo();
    // 第二次 apply 不能把 previous 覆盖成"第一版"，否则这里会残留
    expect(doc.getNode('a')?.schema.title).toBeUndefined();
  });
});

describe('History', () => {
  it('撤销 / 重做按栈序生效', () => {
    const doc = createDocument(makeSchema(), resolver);
    const history = new History(doc);

    history.execute(new SetText('a', '一'));
    history.execute(new SetProps('a', { variant: 'primary' }));

    expect(history.canUndo).toBe(true);

    history.undo();
    expect(doc.getNode('a')?.props.variant).toBeUndefined();
    expect(doc.getNode('a')?.schema.children).toEqual(['一']);

    history.undo();
    expect(doc.getNode('a')?.schema.children).toEqual(['A']);

    history.undo();
    expect(history.canUndo).toBe(false);
    expect(doc.getNode('a')?.schema.children).toEqual(['A']);

    history.redo();
    expect(doc.getNode('a')?.schema.children).toEqual(['一']);
  });

  it('同一 prop 的连续输入合并成一条历史', () => {
    const doc = createDocument(makeSchema(), resolver);
    const history = new History(doc);

    history.execute(new SetProps('a', { variant: 'p' }));
    history.execute(new SetProps('a', { variant: 'pr' }));
    history.execute(new SetProps('a', { variant: 'pri' }));

    expect(history.depth).toBe(1);
    expect(doc.getNode('a')?.props.variant).toBe('pri');

    history.undo();
    expect(doc.getNode('a')?.props.variant).toBeUndefined();
  });

  it('不同 prop 不合并', () => {
    const doc = createDocument(makeSchema(), resolver);
    const history = new History(doc);

    history.execute(new SetProps('a', { variant: 'primary' }));
    history.execute(new SetProps('a', { size: 'lg' }));

    expect(history.depth).toBe(2);
  });

  it('新操作会截断重做分支', () => {
    const doc = createDocument(makeSchema(), resolver);
    const history = new History(doc);

    history.execute(new SetText('a', '一'));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.execute(new SetText('a', '二'));
    expect(history.canRedo).toBe(false);
  });

  it('撤销后能继续撤销更早的结构变更', () => {
    const doc = createDocument(makeSchema(), resolver);
    const history = new History(doc);

    history.execute(new SetText('box', '盒子'));
    history.execute(new SetText('a', 'A2'));

    history.undo();
    history.undo();

    expect(doc.getNode('a')?.schema.children).toEqual(['A']);
    expect(doc.getNode('box')?.schema.children).toMatchObject([{ id: 'inner' }]);
  });
});
