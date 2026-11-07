import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { defineMaterial } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { shouldPlacePlaceholder } from '@lowcode-next/renderer-core';
import { createReactDriver } from './react-driver';
import type { ReactRendererInput } from './react-driver';
import type { IRNode } from './index';

/**
 * 空容器占位。
 *
 * 这是编辑态才会出现的 DOM：容器没子节点时塌成 0 高度，选不中也拖不进去。
 * 判断条件照抄 lowcode `react-simulator-renderer` 的 customCreateElement，
 * 所以这里既测判定函数，也测 driver 真的把占位挂进了 children。
 */

const Box = () => null;
const Label = () => null;

const containerMeta = defineMaterial({
  componentName: 'Box',
  title: '容器',
  props: {},
  configure: { component: { isContainer: true }, supports: {} },
});

const leafMeta = defineMaterial({
  componentName: 'Label',
  title: '文字',
  props: {},
  configure: { component: {}, supports: {} },
});

/** 自带内容的容器：children 只是可选补充，空着本身就是完整形态 */
const blockMeta = defineMaterial({
  componentName: 'Block',
  title: '区块',
  props: {},
  configure: { component: { isContainer: true, emptyPlaceholder: false }, supports: {} },
});

/**
 * Driver 只收「名字 → 组件 / 名字 → meta」两个函数（§12.4 拆分后不再依赖
 * 具体注册表类）。测试里用两张 Map 就够了，反而把契约看得更清楚。
 */
const metas = new Map<string, ComponentMeta>([
  [containerMeta.componentName, containerMeta],
  [leafMeta.componentName, leafMeta],
  [blockMeta.componentName, blockMeta],
]);

const components = new Map<string, () => null>([
  [containerMeta.componentName, Box],
  [leafMeta.componentName, Label],
  [blockMeta.componentName, Box],
]);

const registry: ReactRendererInput = {
  resolve: (componentName) => components.get(componentName) ?? null,
  getMeta: (componentName) => metas.get(componentName) ?? null,
};

function node(type: string, children: IRNode[] = [], extra: Partial<IRNode> = {}): IRNode {
  return { id: 'n1', key: 'n1', type, props: {}, children, ...extra };
}

/**
 * 取到「组件本身」的元素。
 *
 * 现在 Driver 会给每个节点套一层 `FaultBoundary`（用户组件抛错时只坏一块），
 * 所以 `render()` 返回的是边界元素，真正的组件在它的 `children` 里。
 */
function renderComponent(input: IRNode, options?: { editorPlaceholder?: boolean }): ReactElement<{ children?: unknown }> {
  const boundary = createReactDriver(registry, options).render(input) as ReactElement<{
    children?: ReactElement<{ children?: unknown }>;
  }>;
  return boundary.props.children as ReactElement<{ children?: unknown }>;
}

function childrenOf(input: IRNode): unknown[] {
  const children = renderComponent(input, { editorPlaceholder: true }).props.children;
  if (children === undefined) return [];
  return Array.isArray(children) ? children : [children];
}

function placeholderOf(input: IRNode): ReactElement<{ className: string }> | null {
  for (const child of childrenOf(input)) {
    const element = child as ReactElement<{ className?: string }>;
    if (typeof element?.props?.className === 'string' && element.props.className.includes('lc-container-placeholder')) {
      return element as ReactElement<{ className: string }>;
    }
  }
  return null;
}

describe('shouldPlacePlaceholder', () => {
  it('容器 + 无子节点 + 没写 style → 需要占位', () => {
    expect(shouldPlacePlaceholder({ meta: containerMeta, childCount: 0, props: {} })).toBe(true);
  });

  it('空的 style 对象不算"写了样式"', () => {
    expect(shouldPlacePlaceholder({ meta: containerMeta, childCount: 0, props: { style: {} } })).toBe(true);
  });

  it('容器已经写了 style → 用户自己定了尺寸，不塞占位', () => {
    expect(
      shouldPlacePlaceholder({ meta: containerMeta, childCount: 0, props: { style: { padding: 16 } } }),
    ).toBe(false);
  });

  it('有子节点 → 不需要占位', () => {
    expect(shouldPlacePlaceholder({ meta: containerMeta, childCount: 2, props: {} })).toBe(false);
  });

  it('非容器 → 不需要占位', () => {
    expect(shouldPlacePlaceholder({ meta: leafMeta, childCount: 0, props: {} })).toBe(false);
  });

  it('物料未注册（meta 为空）→ 不需要占位', () => {
    expect(shouldPlacePlaceholder({ meta: null, childCount: 0, props: {} })).toBe(false);
  });

  it('物料显式关掉 emptyPlaceholder → 不需要占位', () => {
    expect(shouldPlacePlaceholder({ meta: blockMeta, childCount: 0, props: {} })).toBe(false);
  });
});

describe('ReactDriver 空容器占位', () => {
  it('空容器挂上占位块和默认文案', () => {
    const placeholder = placeholderOf(node('Box'));
    expect(placeholder).not.toBeNull();
    expect(placeholder!.props.className).toBe('lc-container-placeholder');
    expect(placeholder!.props.children).toBe('拖拽组件或模板到这里');
  });

  it('占位块没有 data-node-id：命中要冒泡回容器本体', () => {
    const placeholder = placeholderOf(node('Box'));
    expect((placeholder!.props as Record<string, unknown>)['data-node-id']).toBeUndefined();
  });

  it('锁定容器换成锁定文案并带 lc-container-locked', () => {
    const placeholder = placeholderOf(node('Box', [], { editFlags: { locked: true } }));
    expect(placeholder!.props.className).toBe('lc-container-placeholder lc-container-locked');
    expect(placeholder!.props.children).toBe('锁定元素及其子元素不可编辑');
  });

  it('物料可以用 placeholder prop 覆盖文案', () => {
    const placeholder = placeholderOf(
      node('Box', [], { props: { placeholder: '这里放一张卡片' } }),
    );
    expect(placeholder!.props.children).toBe('这里放一张卡片');
  });

  it('有子节点的容器不挂占位', () => {
    expect(placeholderOf(node('Box', [node('Label')]))).toBeNull();
  });

  it('非容器空节点不挂占位', () => {
    expect(placeholderOf(node('Label'))).toBeNull();
  });

  it('自带内容的区块容器不挂占位', () => {
    expect(placeholderOf(node('Block'))).toBeNull();
  });

  it('不以编辑态创建驱动（运行态）时不挂占位', () => {
    expect(renderComponent(node('Box')).props.children).toBeUndefined();
  });
});
