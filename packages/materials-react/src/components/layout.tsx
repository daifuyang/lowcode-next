import type { ReactNode } from 'react';
import {
  STACK_ALIGN,
  STACK_JUSTIFY,
  DIRECTIONS,
  SECTION_TONES,
  SECTION_PADDING,
  PADDING_SIZES,
  CARD_TONES,
} from '@lowcode-next/materials';
import { bool, cx, num, passthrough, pick, styleOf } from '../lib/props';
import type { Props } from '../lib/props';

/**
 * 布局物料的 React 实现（5 个）。
 *
 * 与 `materials-vue/src/components/layout.ts` 严格对等：同一份 schema、同一组
 * `lc-*` 类名、同一份 inline style 拼法。**DOM 必须一致** —— 否则同一页面在
 * 两个编辑器里看到的画布不同，这是最难排查的一类问题。
 *
 * 统一约定（所有物料都遵守）：
 * 1. 根元素必须 `{...passthrough(props)}`，`data-node-id` 靠这一句落到 DOM；
 * 2. 业务 props 一律经 pick/num/bool 收口，schema 是外部输入，不可信；
 * 3. 暴露 `style` 覆盖口，让 schema 能调 margin / maxWidth 这类布局意图。
 *
 * 枚举常量全部从 `@lowcode-next/materials` import —— 与 meta 里 `propOptions()`
 * 用的是同一个数组，物理上不可能不同步。
 */

/* ------------------------------------------------------------------ */
/* Div                                                                */
/* ------------------------------------------------------------------ */

export function Div(props: Props) {
  return (
    <div className="lc-card" style={styleOf(props.style)} {...passthrough(props)}>
      {props.children as ReactNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stack —— 一维堆叠                                                   */
/* ------------------------------------------------------------------ */

export function Stack(props: Props) {
  const direction = pick(props.direction, DIRECTIONS, 'column');
  const align = pick(props.align, STACK_ALIGN, 'stretch');
  const justify = pick(props.justify, STACK_JUSTIFY, 'start');
  const gap = num(props.gap, 16);

  return (
    <div
      className={cx(
        'lc-stack',
        `lc-stack--${direction}`,
        `lc-align--${align}`,
        `lc-justify--${justify}`,
        bool(props.wrap) && 'lc-stack--wrap',
        bool(props.full) && 'lc-stack--full',
      )}
      style={{ gap, ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grid                                                               */
/* ------------------------------------------------------------------ */

export function Grid(props: Props) {
  const gap = num(props.gap, 20);
  const columns = num(props.columns, 0);
  const minColumn = num(props.minColumn, 260);

  const template =
    columns > 0
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-fit, minmax(${minColumn}px, 1fr))`;

  return (
    <div
      className="lc-grid"
      style={{
        gridTemplateColumns: template,
        gap,
        ...styleOf(props.style),
      }}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                            */
/* ------------------------------------------------------------------ */

export function Section(props: Props) {
  const tone = pick(props.tone, SECTION_TONES, 'light');
  const padding = pick(props.padding, PADDING_SIZES, 'md');

  return (
    <section
      className={cx('lc-section', `lc-section--${tone}`)}
      style={{ padding: `${SECTION_PADDING[padding]}px 56px`, ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      <div className="lc-section__inner">{props.children as ReactNode}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */

export function Card(props: Props) {
  const tone = pick(props.tone, CARD_TONES, 'white');
  const padding = num(props.padding, 20);
  const radius = num(props.radius, 14);

  return (
    <div
      className={cx('lc-card', `lc-card--${tone}`, bool(props.shadow) && 'lc-card--shadow')}
      style={{ padding, borderRadius: radius, ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </div>
  );
}
