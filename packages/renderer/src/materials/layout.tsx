import type { ReactNode } from 'react';
import { defineMaterial, propOptions } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { bool, cx, num, passthrough, pick, styleOf } from './shared';
import type { Props } from './shared';

/**
 * 布局物料：容器 / 纵向横向堆叠 / 网格 / 区块 / 卡片。
 *
 * 这几个是 isContainer，拖拽时会被 DropContext 当作可落点容器。
 * 注意 Section 和 Hero 内部都有一层没有 data-node-id 的 inner：
 * 它只负责限宽居中，命中时会由 closest() 冒泡回带 id 的根元素，
 * 不影响落点判定。
 */

/* ------------------------------------------------------------------ */
/* Div —— 裸容器                                                       */
/* ------------------------------------------------------------------ */

export function Div(props: Props) {
  return (
    <div className="lc-card" style={styleOf(props.style)} {...passthrough(props)}>
      {props.children as ReactNode}
    </div>
  );
}

export const divMaterial: ComponentMeta = defineMaterial({
  componentName: 'Div',
  title: '容器',
  group: '布局',
  props: {
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: { isContainer: true },
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Div',
    props: {
      style: {
        padding: 16,
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        border: '1px dashed #d0d3d9',
        borderRadius: 8,
      },
    },
  },
});

/* ------------------------------------------------------------------ */
/* Stack —— 一维堆叠                                                   */
/* ------------------------------------------------------------------ */

const DIRECTIONS = ['column', 'row'] as const;
const ALIGN = ['start', 'center', 'end', 'stretch'] as const;
const JUSTIFY = ['start', 'center', 'end', 'between'] as const;

const DIRECTION_LABEL: Record<string, string> = { column: '纵向', row: '横向' };
const ALIGN_LABEL: Record<string, string> = {
  start: '起点',
  center: '居中',
  end: '终点',
  stretch: '拉伸',
};
const JUSTIFY_LABEL: Record<string, string> = {
  start: '起点',
  center: '居中',
  end: '终点',
  between: '两端',
};

export function Stack(props: Props) {
  const direction = pick(props.direction, DIRECTIONS, 'column');
  const align = pick(props.align, ALIGN, 'stretch');
  const justify = pick(props.justify, JUSTIFY, 'start');
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

export const stackMaterial: ComponentMeta = defineMaterial({
  componentName: 'Stack',
  title: '堆叠',
  group: '布局',
  props: {
    direction: {
      title: '方向',
      type: 'string',
      defaultValue: 'column',
      options: propOptions(DIRECTIONS, DIRECTION_LABEL),
    },
    gap: { title: '间距', type: 'number', defaultValue: 16 },
    align: {
      title: '交叉轴对齐',
      type: 'string',
      defaultValue: 'stretch',
      options: propOptions(ALIGN, ALIGN_LABEL),
    },
    justify: {
      title: '主轴对齐',
      type: 'string',
      defaultValue: 'start',
      options: propOptions(JUSTIFY, JUSTIFY_LABEL),
    },
    wrap: { title: '允许换行', type: 'bool', defaultValue: false },
    full: { title: '撑满宽度', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: { isContainer: true },
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Stack',
    props: { direction: 'column', gap: 16, align: 'stretch' },
  },
});

/* ------------------------------------------------------------------ */
/* Grid                                                               */
/* ------------------------------------------------------------------ */

export function Grid(props: Props) {
  const gap = num(props.gap, 20);
  const columns = num(props.columns, 0);
  const minColumn = num(props.minColumn, 260);

  const template = columns > 0 ? `repeat(${columns}, minmax(0, 1fr))` : `repeat(auto-fit, minmax(${minColumn}px, 1fr))`;

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

export const gridMaterial: ComponentMeta = defineMaterial({
  componentName: 'Grid',
  title: '网格',
  group: '布局',
  props: {
    columns: { title: '固定列数', type: 'number', defaultValue: 0 },
    minColumn: { title: '最小列宽', type: 'number', defaultValue: 260 },
    gap: { title: '间距', type: 'number', defaultValue: 20 },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: { isContainer: true },
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Grid',
    props: { minColumn: 260, gap: 20 },
  },
});

/* ------------------------------------------------------------------ */
/* Section                                                            */
/* ------------------------------------------------------------------ */

const SECTION_TONES = ['light', 'muted', 'dark', 'accent'] as const;
const SECTION_PADDING = { sm: 40, md: 68, lg: 92 } as const;
const PADDING_SIZES = ['sm', 'md', 'lg'] as const;

const SECTION_TONE_LABEL: Record<string, string> = {
  light: '白底',
  muted: '浅灰',
  dark: '深色',
  accent: '主色',
};

const PADDING_LABEL: Record<string, string> = { sm: '紧凑', md: '常规', lg: '宽松' };

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

export const sectionMaterial: ComponentMeta = defineMaterial({
  componentName: 'Section',
  title: '区块',
  group: '布局',
  props: {
    tone: {
      title: '背景',
      type: 'string',
      defaultValue: 'light',
      options: propOptions(SECTION_TONES, SECTION_TONE_LABEL),
    },
    padding: {
      title: '上下留白',
      type: 'string',
      defaultValue: 'md',
      options: propOptions(PADDING_SIZES, PADDING_LABEL),
    },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: { isContainer: true },
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Section',
    props: { tone: 'light', padding: 'md' },
  },
});

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */

const CARD_TONES = ['white', 'muted', 'dark', 'outline'] as const;

const CARD_TONE_LABEL: Record<string, string> = {
  white: '白底',
  muted: '浅灰',
  dark: '深色',
  outline: '描边',
};

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

export const cardMaterial: ComponentMeta = defineMaterial({
  componentName: 'Card',
  title: '卡片',
  group: '布局',
  props: {
    tone: {
      title: '背景',
      type: 'string',
      defaultValue: 'white',
      options: propOptions(CARD_TONES, CARD_TONE_LABEL),
    },
    padding: { title: '内边距', type: 'number', defaultValue: 20 },
    radius: { title: '圆角', type: 'number', defaultValue: 14 },
    shadow: { title: '阴影', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: { isContainer: true },
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Card',
    props: { tone: 'white', padding: 20, radius: 14, shadow: true },
  },
});
