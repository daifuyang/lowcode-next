import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * 致命错误页（§12.14）。
 *
 * 只用于「编辑器根本起不来」的情形：容器找不到、页面 JSON 解析失败、
 * 两个物料包抢同一个 `componentName`。这类错误必须让接入方立刻看见，
 * 所以不降级、不吞掉，直接替换整个容器内容。
 *
 * 单个组件缺失/抛错**不走这里** —— 那些交给 Driver 的 `UnknownNode` /
 * `FaultBoundary`，只坏一块，不影响编辑器本身。
 */

export interface FatalScreenProps {
  title: string;
  detail?: string;
}

export function FatalScreen({ title, detail }: FatalScreenProps): ReactNode {
  return createElement(
    'div',
    { style: WRAP_STYLE },
    createElement('div', { style: TITLE_STYLE }, title),
    detail ? createElement('pre', { style: DETAIL_STYLE }, detail) : null,
  );
}

const WRAP_STYLE = {
  padding: '32px 40px',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  color: '#0f172a',
} as const;

const TITLE_STYLE = {
  fontSize: 16,
  fontWeight: 600,
  color: '#b91c1c',
} as const;

const DETAIL_STYLE = {
  marginTop: 12,
  padding: '12px 16px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  color: '#7f1d1d',
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  overflow: 'auto',
  maxHeight: 320,
} as const;
