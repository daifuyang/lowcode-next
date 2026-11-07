import type { ReactNode } from 'react';
import { passthrough, styleOf } from '../lib/props';
import type { Props } from '../lib/props';

/**
 * 通用块级容器的 React 实现（§12.17）—— 与 `materials/src/metas/div.ts` 对应。
 *
 * 一个不带视觉语义的 `<div>`：透传引擎注入的 props（`data-node-id` 靠这一句
 * 落到 DOM，选中框与拖放命中都靠它），`style` 覆盖口留给 schema，children 直出。
 */
export function Div(props: Props) {
  return (
    <div className="lc-div" style={styleOf(props.style)} {...passthrough(props)}>
      {props.children as ReactNode}
    </div>
  );
}
