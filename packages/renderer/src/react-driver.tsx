import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { flagString, shouldPlacePlaceholder } from '@lowcode-next/renderer-core';
import type { Driver, IRNode, RenderMode } from '@lowcode-next/renderer-core';
import { FaultBoundary } from './fault-boundary';

/**
 * Driver 需要知道的两件事（DESIGN-v1 §12.4）。
 *
 * 刻意收成两个**函数**而不是一个注册表类：描述与实现分属两个包
 * （`@lowcode-next/materials` 与 `@lowcode-next/materials-react`），
 * Driver 不关心它们怎么存、是否同一对象，只关心「给我名字，我给你东西」。
 */
export interface ReactRendererInput {
  /** 组件名 → 组件。未命中时渲染可见兜底块，不白屏 */
  resolve: (componentName: string) => ComponentType<Record<string, unknown>> | null;
  /** 组件名 → meta。容器判定与空容器占位要用 */
  getMeta: (componentName: string) => ComponentMeta | null;
}

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
  /**
   * 渲染模式，决定出错时给什么（§12.14）。
   *
   * - `edit`：显眼 —— 红框 + 组件名 + 排查线索。这是开发者正在修的东西
   * - `runtime`：克制 —— 一行灰字，不打断布局。线上访客不该看到 React 堆栈
   *
   * 缺省按 `editorPlaceholder` 推断：开了占位就是编辑态。
   */
  mode?: RenderMode;
}

const PLACEHOLDER_CLASS = 'lc-container-placeholder';
const PLACEHOLDER_TEXT = '拖拽组件或模板到这里';
const LOCKED_PLACEHOLDER_TEXT = '锁定元素及其子元素不可编辑';

/**
 * React Driver（DESIGN-v1 §5.1）—— 渲染机制本身，不知道自己有哪些物料。
 *
 * 关键点：`data-node-id` 直接传给组件，由组件透传到根 DOM，
 * 而不是外面包一层 `display: contents`。原因是后者不生成盒子，
 * `getBoundingClientRect()` 全是 0，命中框和指示线会整个失效。
 */
export function createReactDriver(
  input: ReactRendererInput,
  options: ReactDriverOptions = {},
): Driver<ReactNode> {
  const mode: RenderMode = options.mode ?? (options.editorPlaceholder ? 'edit' : 'runtime');

  function render(node: IRNode): ReactNode {
    const Component = input.resolve(node.type);
    const meta = input.getMeta(node.type);

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
      return createElement(UnknownNode, { key: node.key, node, mode }, ...children);
    }

    return createElement(
      FaultBoundary,
      { key: node.key, name: node.type, mode },
      createElement(
        Component as unknown as (p: Record<string, unknown>) => ReactNode,
        props,
        ...children,
      ),
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
  mode: RenderMode;
  children?: ReactNode;
}

/**
 * 组件未注册时的兜底：显式占位，避免白屏后无处排查。
 *
 * 编辑态给出「为什么」和「改哪里」；运行态只保留一句不打断布局的提示 ——
 * 线上页面里露出一整块红框，比缺一块内容更糟。
 */
function UnknownNode({ node, mode, children }: UnknownNodeProps) {
  if (mode === 'runtime') {
    return createElement(
      'div',
      { 'data-node-id': node.id, 'data-edit-flags': 'unknown', style: RUNTIME_UNKNOWN_STYLE },
      '内容暂不可用',
    );
  }

  return createElement(
    'div',
    {
      'data-node-id': node.id,
      'data-edit-flags': 'unknown',
      style: EDIT_UNKNOWN_STYLE,
    },
    createElement('div', { style: { fontWeight: 600 } }, `未注册物料：${node.type}`),
    createElement(
      'div',
      { style: { marginTop: 2, opacity: 0.8 } },
      '检查 materials 配置里的 componentName，或 components 里是否漏了同名实现',
    ),
    children,
  );
}

const EDIT_UNKNOWN_STYLE = {
  padding: '8px 10px',
  border: '1px dashed #ef4444',
  borderRadius: 4,
  background: 'rgba(239, 68, 68, 0.06)',
  color: '#b91c1c',
  fontSize: 12,
  lineHeight: 1.5,
} as const;

const RUNTIME_UNKNOWN_STYLE = {
  padding: '8px 10px',
  color: '#94a3b8',
  fontSize: 12,
  textAlign: 'center',
} as const;
