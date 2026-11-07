import type { ReactNode } from 'react';
import { passthrough, styleOf } from '../lib/props';
import type { Props } from '../lib/props';

/**
 * 页面壳的 React 实现（§12.16）—— 与 `materials/src/metas/page.ts` 对应。
 *
 * 一个不带语义的块级容器：透传引擎注入的 props（`data-node-id` 靠这一句
 * 落到 DOM，顶层选中框与拖放命中都靠它），`style` 覆盖口留给 schema。
 */
export function Page(props: Props) {
  return (
    <div className="lc-page" style={styleOf(props.style)} {...passthrough(props)}>
      {props.children as ReactNode}
    </div>
  );
}
