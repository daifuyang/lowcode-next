import type { CSSProperties } from 'react';
import { styleOf as styleObjectOf } from '@lowcode-next/materials';

/**
 * `styleOf` 的 React 特化。
 *
 * `@lowcode-next/materials` 里的版本返回普通对象（`Record<string, string | number |
 * undefined>`），因为它是零框架的 —— 不能出现 `CSSProperties`。而 React 的 `style`
 * prop 要的是 `CSSProperties`，两者在 TS 里不能直接互赋（csstype 生成的类型没有
 * 索引签名）。
 *
 * 所以 cast 只在这一处发生。组件里继续写 `styleOf(props.style)`，看不出差别 ——
 * 这是拆包对 20 个组件的改动量能压到「一行 import」的原因。
 */
export function styleOf(value: unknown): CSSProperties {
  return styleObjectOf(value) as CSSProperties;
}
