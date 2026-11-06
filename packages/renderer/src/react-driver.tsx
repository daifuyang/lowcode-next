import { createElement } from 'react';
import type { ReactNode } from 'react';
import { isContainerMeta } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';
import type { Driver, IRNode } from './index';
import type { MaterialRegistry } from './registry';

export interface ReactDriverOptions {
  /**
   * 编辑态：给"没内容的容器"塞一个占位子节点。
   *
   * 对齐 lowcode `react-simulator-renderer/src/renderer-view.tsx` 的 customCreateElement：
   * 容器 + 无 children + 没写 style 三个条件同时成立时，注入
   * `<div class="lc-container-placeholder">拖拽组件或模板到这里</div>`。
   *
   * 运行态必须关掉，否则线上页面会多出一块灰色提示。
   */
  editorPlaceholder?: boolean;
}

const PLACEHOLDER_CLASS = 'lc-container-placeholder';
const PLACEHOLDER_TEXT = '拖拽组件或模板到这里';
const LOCKED_PLACEHOLDER_TEXT = '锁定元素及其子元素不可编辑';

/**
 * React Driver（DESIGN-v1 §5.1）—— 整个系统唯一的框架相关层。
 *
 * 关键点：`data-node-id` 直接传给组件，由组件透传到根 DOM，
 * 而不是外面包一层 `display: contents`。原因是后者不生成盒子，
 * `getBoundingClientRect()` 全是 0，命中框和指示线会整个失效。
 */
export function createReactDriver(
  registry: MaterialRegistry,
  options: ReactDriverOptions = {},
): Driver<ReactNode> {
  function render(node: IRNode): ReactNode {
    const Component = registry.resolve(node.type);
    const meta = registry.getMeta(node.type);

    const props: Record<string, unknown> = {
      key: node.key,
      ...node.props,
      'data-node-id': node.id,
    };

    if (node.editFlags) {
      const flags = flagString(node.editFlags);
      if (flags) props['data-edit-flags'] = flags;
    }

    const children: ReactNode[] = node.children.map((child) =>
      typeof child === 'string' ? child : render(child),
    );

    if (
      options.editorPlaceholder &&
      shouldPlacePlaceholder({ meta, childCount: children.length, props: node.props })
    ) {
      children.push(createPlaceholder(node));
    }

    if (!Component) {
      return createElement(UnknownNode, { key: node.key, node }, ...children);
    }

    return createElement(
      Component as unknown as (p: Record<string, unknown>) => ReactNode,
      props,
      ...children,
    );
  }

  return {
    render,
    renderRoot(nodes) {
      return nodes.map((node) => (typeof node === 'string' ? node : render(node)));
    },
  };
}

/**
 * 空容器要不要塞占位 —— 三个条件缺一不可（照抄 engine 的判断）。
 *
 * 第三条容易被当成废话删掉：显式写了 `style` 的容器是用户主动定义了尺寸
 * （宽高、内边距、甚至背景），此时它不会塌成 0，再塞一块灰底提示反而盖住用户的样式。
 */
export function shouldPlacePlaceholder(input: {
  meta: ComponentMeta | null;
  childCount: number;
  props: Record<string, unknown>;
}): boolean {
  if (!isContainerMeta(input.meta)) return false;
  if (input.meta?.configure.component.emptyPlaceholder === false) return false;
  if (input.childCount > 0) return false;

  const style = input.props.style;
  if (style && typeof style === 'object' && Object.keys(style).length > 0) return false;

  return true;
}

/**
 * 占位块。**不是节点**：没有 `data-node-id`，所以 `closest()` 会把点击/悬停
 * 冒泡回容器本体，命中语义不会被它篡改；它也不在 schema 里，不会被导出。
 */
function createPlaceholder(node: IRNode): ReactNode {
  const locked = Boolean(node.editFlags?.locked);
  const custom = node.props.placeholder;
  const text =
    (typeof custom === 'string' && custom) ||
    (locked ? LOCKED_PLACEHOLDER_TEXT : PLACEHOLDER_TEXT);

  return createElement(
    'div',
    {
      key: `${node.id}-placeholder`,
      className: locked ? `${PLACEHOLDER_CLASS} lc-container-locked` : PLACEHOLDER_CLASS,
    },
    text,
  );
}


interface UnknownNodeProps {
  node: IRNode;
  children?: ReactNode;
}

/** 组件未注册时的兜底：显式占位，避免白屏后无处排查 */
function UnknownNode({ node, children }: UnknownNodeProps) {
  return createElement(
    'div',
    {
      'data-node-id': node.id,
      'data-edit-flags': 'unknown',
      style: {
        padding: '8px 10px',
        border: '1px dashed #ef4444',
        borderRadius: 4,
        background: 'rgba(239, 68, 68, 0.06)',
        color: '#b91c1c',
        fontSize: 12,
      },
    },
    `未注册物料：${node.type}`,
    children,
  );
}

export function flagString(flags: NonNullable<IRNode['editFlags']>): string {
  const list: string[] = [];
  if (flags.hidden) list.push('hidden');
  if (flags.loop) list.push('loop');
  if (flags.conditionFalse) list.push('condition-false');
  if (flags.locked) list.push('locked');
  return list.join(' ');
}
