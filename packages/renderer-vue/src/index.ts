import { Fragment, h } from 'vue';
import type { Component, VNode } from 'vue';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { PROP_SETTER } from '@lowcode-next/protocol';
import { flagString, shouldPlacePlaceholder } from '@lowcode-next/renderer-core';
import type { Driver, IRNode } from '@lowcode-next/renderer-core';

/**
 * Vue Driver（DESIGN-v1 §12.4）—— 与 `@lowcode-next/renderer` 的 React Driver 对等。
 *
 * 它只做「IR → VNode」这一件事：不知道有哪些物料、不知道编辑器长什么样。
 * 契约（`IRNode` / `Driver`）来自零框架的 `renderer-core`，本包只依赖 Vue。
 *
 * 与 React 版必须保持一致的四处，任何一处漂移都会让「同一份 schema 两个画布不同」：
 * 1. 组件名解析失败 → 渲染可见兜底块（带 `data-node-id`，能被选中、能删掉）；
 * 2. `data-node-id` / `data-edit-flags` 通过 props 传给组件，由组件透传到根元素；
 * 3. 空容器占位的判定与文案（`shouldPlacePlaceholder` 是两边共用的同一个函数）；
 * 4. 占位块本身不带 `data-node-id`，让 `closest()` 冒泡回容器本体。
 */
export interface VueRendererInput {
  /** 组件名 → Vue 组件。未命中时渲染兜底块 */
  resolve: (componentName: string) => Component | null;
  /** 组件名 → meta。容器判定与空容器占位要用 */
  getMeta: (componentName: string) => ComponentMeta | null;
}

export interface VueDriverOptions {
  /** 编辑态：给"没内容的容器"塞占位子节点。运行态必须关掉 */
  editorPlaceholder?: boolean;
  /**
   * 单 prop 回写（§12.15）：存在时每个节点都会在 props 里收到
   * `props[PROP_SETTER]`，录入类物料靠它把用户输入写回 schema。
   * 语义与 React 版 `ReactDriverOptions.setProp` 完全一致。
   */
  setProp?: (nodeId: string, propName: string, value: unknown) => void;
}

const PLACEHOLDER_CLASS = 'lc-container-placeholder';
const PLACEHOLDER_TEXT = '拖拽组件或模板到这里';
const LOCKED_PLACEHOLDER_TEXT = '锁定元素及其子元素不可编辑';

export function createVueDriver(
  input: VueRendererInput,
  options: VueDriverOptions = {},
): Driver<VNode> {
  function render(node: IRNode): VNode {
    const Component = input.resolve(node.type);
    const meta = input.getMeta(node.type);

    const props: Record<string, unknown> = {
      ...node.props,
      'data-node-id': node.id,
    };

    if (node.editFlags) {
      const flags = flagString(node.editFlags);
      if (flags) props['data-edit-flags'] = flags;
    }

    if (options.setProp) {
      const nodeId = node.id;
      // symbol 键不能直接索引 Record<string, unknown>（TS2538），借 Object.assign 写入
      Object.assign(props, {
        [PROP_SETTER]: (propName: string, value: unknown) =>
          options.setProp!(nodeId, propName, value),
      });
    }

    const children: Array<VNode | string> = node.children.map((child) =>
      typeof child === 'string' ? child : render(child),
    );

    if (
      options.editorPlaceholder &&
      shouldPlacePlaceholder({ meta, childCount: children.length, props: node.props })
    ) {
      children.push(createPlaceholder(node));
    }

    if (!Component) {
      return createUnknownNode(node, children);
    }

    /**
     * 第三个参数传数组 = 默认插槽。物料组件用 `<slot />` 接收。
     *
     * key 放进 props 传：Vue 的 `h()` 会把它提取成 vnode key，不渲染到 DOM 上，
     * 与 React 的 `key` 语义对齐。
     */
    return h(Component, { ...props, key: node.key }, children);
  }

  return {
    render,
    renderRoot(nodes) {
      // React 版返回数组；Vue 里多根必须包一层 Fragment，否则「一个页面多个根节点」
      // 会在挂载时抛 "Multiple root nodes returned from render function"
      return h(
        Fragment,
        null,
        nodes.map((node) => (typeof node === 'string' ? node : render(node))),
      );
    },
  };
}

/**
 * 占位块。**不是节点**：没有 `data-node-id`，所以 `closest()` 会把点击/悬停
 * 冒泡回容器本体；它也不在 schema 里，不会被导出。
 */
function createPlaceholder(node: IRNode): VNode {
  const locked = Boolean(node.editFlags?.locked);
  const custom = node.props.placeholder;
  const text =
    (typeof custom === 'string' && custom) ||
    (locked ? LOCKED_PLACEHOLDER_TEXT : PLACEHOLDER_TEXT);

  return h(
    'div',
    {
      key: `${node.id}-placeholder`,
      class: locked ? `${PLACEHOLDER_CLASS} lc-container-locked` : PLACEHOLDER_CLASS,
    },
    text,
  );
}

/** 组件未注册时的兜底：显式占位，避免白屏后无处排查 */
function createUnknownNode(node: IRNode, children: Array<VNode | string>): VNode {
  return h(
    'div',
    {
      key: node.key,
      'data-node-id': node.id,
      'data-edit-flags': 'unknown',
      style: {
        padding: '8px 10px',
        border: '1px dashed #ef4444',
        borderRadius: '4px',
        background: 'rgba(239, 68, 68, 0.06)',
        color: '#b91c1c',
        fontSize: '12px',
      },
    },
    [`未注册物料：${node.type}`, ...children],
  );
}
