import type { CSSProperties, ReactNode } from 'react';

/**
 * 一个「用户自己的组件」—— 完全按业务写法实现，不 import 引擎的任何东西。
 *
 * 唯一需要遵守的契约是 **把收到的 props 透传到根元素**（这里的 `...rest`）。
 * 引擎靠 `data-node-id` 定位每个节点的 DOM：
 * 不透传 → 选中框画不出来、拖拽算不出落点、属性面板改值也定位不到节点。
 * 这是接入手册的第一条，也是最容易被漏掉的一条。
 */
export interface StatCardProps {
  label?: string;
  value?: string;
  hint?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** 引擎注入，由 `...rest` 透传 */
  'data-node-id'?: string;
}

export function StatCard({
  label = '指标',
  value = '0',
  hint,
  style,
  children,
  ...rest
}: StatCardProps) {
  return (
    <div
      {...rest}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '18px 20px',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        ...style,
      }}
    >
      <span style={{ fontSize: 12, color: '#64748b', letterSpacing: '0.02em' }}>{label}</span>
      <strong style={{ fontSize: 28, lineHeight: 1.1, color: '#0f172a', fontWeight: 600 }}>
        {value}
      </strong>
      {hint ? <span style={{ fontSize: 12, color: '#94a3b8' }}>{hint}</span> : null}
      {children}
    </div>
  );
}
