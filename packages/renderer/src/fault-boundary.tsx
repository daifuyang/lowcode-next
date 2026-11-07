import { Component, createElement } from 'react';
import type { ReactNode } from 'react';
import type { RenderMode } from '@lowcode-next/renderer-core';

/**
 * 组件渲染异常的兜底（§12.14）。
 *
 * 未注册物料靠 `resolve()` 返回 null 就能发现；但**注册了却渲染时抛错**是另一回事，
 * 没有 ErrorBoundary 时一个用户组件的 bug 会把整张画布打成白屏 —— 而那正是
 * 「接入别人写的组件」这个场景里最常见的事故。
 *
 * 边界按节点逐个包：一个组件炸掉只影响它自己那块，其余照常渲染。
 */

interface FaultBoundaryProps {
  /** 组件名，报错文案用 */
  name: string;
  mode: RenderMode;
  children?: ReactNode;
}

interface FaultBoundaryState {
  error: Error | null;
}

export class FaultBoundary extends Component<FaultBoundaryProps, FaultBoundaryState> {
  override state: FaultBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FaultBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    // React 自己也会打一条，但那条不带组件名，排查时不好定位到具体物料
    console.error(`[lowcode] 组件「${this.props.name}」渲染异常`, error);
  }

  private retry = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return createElement(FaultBlock, {
      name: this.props.name,
      mode: this.props.mode,
      message: error.message,
      onRetry: this.retry,
    });
  }
}

interface FaultBlockProps {
  name: string;
  mode: RenderMode;
  message: string;
  onRetry: () => void;
}

/**
 * 异常时的替代内容。
 *
 * 编辑态要**显眼且可操作**（这是开发者正在修的东西），运行态要**克制**
 * （线上访客不需要知道 React 抛了什么，也不该看到一整块红）。
 */
function FaultBlock({ name, mode, message, onRetry }: FaultBlockProps): ReactNode {
  if (mode === 'runtime') {
    return createElement(
      'div',
      { style: RUNTIME_BLOCK_STYLE },
      '内容暂不可用',
    );
  }

  return createElement(
    'div',
    { style: EDIT_BLOCK_STYLE },
    createElement('div', { style: { fontWeight: 600 } }, `组件渲染异常：${name}`),
    createElement('div', { style: { marginTop: 4, opacity: 0.8 } }, message),
    createElement(
      'button',
      { type: 'button', onClick: onRetry, style: RETRY_BUTTON_STYLE },
      '重试',
    ),
  );
}

const EDIT_BLOCK_STYLE = {
  padding: '8px 10px',
  border: '1px solid #ef4444',
  borderRadius: 4,
  background: 'rgba(239, 68, 68, 0.06)',
  color: '#b91c1c',
  fontSize: 12,
  lineHeight: 1.5,
} as const;

const RUNTIME_BLOCK_STYLE = {
  padding: '8px 10px',
  color: '#94a3b8',
  fontSize: 12,
  textAlign: 'center',
} as const;

const RETRY_BUTTON_STYLE = {
  marginTop: 6,
  padding: '2px 8px',
  border: '1px solid #fca5a5',
  borderRadius: 3,
  background: '#fff',
  color: '#b91c1c',
  fontSize: 11,
  cursor: 'pointer',
} as const;
