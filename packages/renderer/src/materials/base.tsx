import type { ReactNode } from 'react';
import { defineMaterial, propOptions } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { bool, cx, num, passthrough, pick, str, styleOf } from './shared';
import type { Props } from './shared';

/**
 * 基础物料：文字、按钮、链接、标签、图标、分割线、图片、撑开。
 *
 * 统一约定（所有物料都遵守）：
 * 1. 根元素必须 `{...passthrough(props)}`，`data-node-id` 靠这一句落到 DOM；
 * 2. 业务 props 一律经 pick/num/bool 收口，schema 是外部输入，不可信；
 * 3. 暴露 `style` 覆盖口，让 schema 能调 margin / maxWidth 这类布局意图；
 * 4. 每个枚举 prop 的 meta.options 必须由下面的常量数组生成 —— 属性面板
 *    的下拉和物料内部的 pick 校验共用同一份常量，不允许手抄第二份。
 */

const TEXT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl'] as const;
const TONES = ['default', 'muted', 'subtle', 'primary', 'invert', 'invert-strong'] as const;
const ALIGNS = ['left', 'center', 'right'] as const;
const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;

const TEXT_SIZE_LABEL: Record<string, string> = {
  xs: '极小',
  sm: '小',
  base: '常规',
  lg: '大',
  xl: '特大',
};

const TONE_LABEL: Record<string, string> = {
  default: '默认',
  muted: '次要',
  subtle: '弱化',
  primary: '主色',
  invert: '反色',
  'invert-strong': '反色强调',
  gradient: '渐变',
};

const ALIGN_LABEL: Record<string, string> = { left: '左', center: '中', right: '右' };

const WEIGHT_LABEL: Record<string, string> = {
  normal: '常规',
  medium: '中等',
  semibold: '半粗',
  bold: '粗',
};

const WEIGHT_VALUE: Record<(typeof WEIGHTS)[number], number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/* ------------------------------------------------------------------ */
/* Heading                                                            */
/* ------------------------------------------------------------------ */

const HEADING_TONES = ['default', 'invert', 'gradient'] as const;
const HEADING_LEVELS = [1, 2, 3, 4] as const;

export function Heading(props: Props) {
  const level = Math.min(Math.max(num(props.level, 1), 1), 4);
  const tone = pick(props.tone, HEADING_TONES, 'default');
  const align = pick(props.align, ALIGNS, 'left');

  const Tag = `h${level}` as 'h1';
  const className = cx(
    'lc-heading',
    `lc-heading--${level}`,
    tone !== 'default' && `lc-heading--${tone}`,
    `lc-ta--${align}`,
    bool(props.mono) && 'lc-heading--mono',
  );

  const weight = pick(props.weight, WEIGHTS, 'semibold');

  return (
    <Tag
      className={className}
      style={{ fontWeight: WEIGHT_VALUE[weight], ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </Tag>
  );
}

export const headingMaterial: ComponentMeta = defineMaterial({
  componentName: 'Heading',
  title: '标题',
  group: '基础',
  props: {
    level: {
      title: '层级',
      type: 'number',
      defaultValue: 2,
      options: propOptions(HEADING_LEVELS, { 1: 'H1', 2: 'H2', 3: 'H3', 4: 'H4' }),
    },
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(HEADING_TONES, TONE_LABEL),
    },
    align: {
      title: '对齐',
      type: 'string',
      defaultValue: 'left',
      options: propOptions(ALIGNS, ALIGN_LABEL),
    },
    weight: {
      title: '字重',
      type: 'string',
      defaultValue: 'semibold',
      options: propOptions(WEIGHTS, WEIGHT_LABEL),
    },
    mono: { title: '等宽', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Heading',
    props: { level: 2, tone: 'default' },
    children: ['标题'],
  },
});

/* ------------------------------------------------------------------ */
/* Text                                                               */
/* ------------------------------------------------------------------ */

export function Text(props: Props) {
  const size = pick(props.size, TEXT_SIZES, 'base');
  const tone = pick(props.tone, TONES, 'default');
  const align = pick(props.align, ALIGNS, 'left');
  const tag = pick(props.as, ['p', 'span', 'div'] as const, 'p');
  const weight = pick(props.weight, WEIGHTS, 'normal');

  const Tag = tag as 'p';

  return (
    <Tag
      className={cx(
        'lc-text',
        `lc-text--${size}`,
        `lc-tone--${tone}`,
        `lc-ta--${align}`,
        bool(props.mono) && 'lc-mono',
        weight !== 'normal' && 'lc-text--strong',
      )}
      style={{ fontWeight: WEIGHT_VALUE[weight], ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </Tag>
  );
}

export const textMaterial: ComponentMeta = defineMaterial({
  componentName: 'Text',
  title: '文本',
  group: '基础',
  props: {
    size: {
      title: '字号',
      type: 'string',
      defaultValue: 'base',
      options: propOptions(TEXT_SIZES, TEXT_SIZE_LABEL),
    },
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(TONES, TONE_LABEL),
    },
    align: {
      title: '对齐',
      type: 'string',
      defaultValue: 'left',
      options: propOptions(ALIGNS, ALIGN_LABEL),
    },
    weight: {
      title: '字重',
      type: 'string',
      defaultValue: 'normal',
      options: propOptions(WEIGHTS, WEIGHT_LABEL),
    },
    // 实现里读了 props.as，meta 一直没写 —— 面板按 meta 生成控件，
    // 漏写的 prop 就是不可编辑的死字段
    as: {
      title: '标签',
      type: 'string',
      defaultValue: 'p',
      options: propOptions(['p', 'span', 'div'] as const),
    },
    mono: { title: '等宽', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Text',
    props: { size: 'base', tone: 'muted' },
    children: ['在这里写一段说明文字。'],
  },
});

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

const BUTTON_VARIANTS = ['primary', 'default', 'ghost', 'outline'] as const;
const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;

const BUTTON_VARIANT_LABEL: Record<string, string> = {
  primary: '主按钮',
  default: '次按钮',
  ghost: '文字按钮',
  outline: '描边按钮',
};

const BUTTON_SIZE_LABEL: Record<string, string> = { sm: '小', md: '中', lg: '大' };

export function Button(props: Props) {
  const variant = pick(props.variant, BUTTON_VARIANTS, 'default');
  const size = pick(props.size, BUTTON_SIZES, 'md');

  return (
    <button
      type="button"
      className={cx(
        'lc-btn',
        `lc-btn--${variant}`,
        size !== 'md' && `lc-btn--${size}`,
        bool(props.block) && 'lc-btn--block',
      )}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </button>
  );
}

export const buttonMaterial: ComponentMeta = defineMaterial({
  componentName: 'Button',
  title: '按钮',
  group: '基础',
  props: {
    variant: {
      title: '风格',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(BUTTON_VARIANTS, BUTTON_VARIANT_LABEL),
    },
    size: {
      title: '尺寸',
      type: 'string',
      defaultValue: 'md',
      options: propOptions(BUTTON_SIZES, BUTTON_SIZE_LABEL),
    },
    block: { title: '撑满', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Button',
    props: { variant: 'primary' },
    children: ['按钮'],
  },
});

/* ------------------------------------------------------------------ */
/* Link                                                               */
/* ------------------------------------------------------------------ */

const LINK_TONES = ['default', 'invert', 'muted'] as const;

export function Link(props: Props) {
  const tone = pick(props.tone, LINK_TONES, 'default');

  return (
    <a
      className={cx('lc-link', tone !== 'default' && `lc-link--${tone}`)}
      href={str(props.href, '#')}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </a>
  );
}

export const linkMaterial: ComponentMeta = defineMaterial({
  componentName: 'Link',
  title: '链接',
  group: '基础',
  props: {
    href: { title: '地址', type: 'string', defaultValue: '#' },
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(LINK_TONES, { default: '默认', invert: '反色', muted: '次要' }),
    },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Link',
    props: { href: '#' },
    children: ['链接'],
  },
});

/* ------------------------------------------------------------------ */
/* Badge                                                              */
/* ------------------------------------------------------------------ */

const BADGE_TONES = ['accent', 'neutral', 'success', 'invert', 'outline'] as const;

export function Badge(props: Props) {
  const tone = pick(props.tone, BADGE_TONES, 'accent');

  return (
    <span
      className={cx('lc-badge', `lc-badge--${tone}`)}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </span>
  );
}

export const badgeMaterial: ComponentMeta = defineMaterial({
  componentName: 'Badge',
  title: '标签',
  group: '基础',
  props: {
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'accent',
      options: propOptions(BADGE_TONES, {
        accent: '强调',
        neutral: '中性',
        success: '成功',
        invert: '反色',
        outline: '描边',
      }),
    },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Badge',
    props: { tone: 'accent' },
    children: ['新'],
  },
});

/* ------------------------------------------------------------------ */
/* Icon                                                               */
/* ------------------------------------------------------------------ */

export function Icon(props: Props) {
  const size = num(props.size, 18);

  return (
    <span
      className="lc-icon"
      style={{ fontSize: size, ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      {str(props.name, '◆')}
    </span>
  );
}

export const iconMaterial: ComponentMeta = defineMaterial({
  componentName: 'Icon',
  title: '图标',
  group: '基础',
  props: {
    name: { title: '字符', type: 'string', defaultValue: '◆' },
    size: { title: '大小', type: 'number', defaultValue: 18 },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Icon',
    props: { name: '◆', size: 18 },
  },
});

/* ------------------------------------------------------------------ */
/* Divider                                                            */
/* ------------------------------------------------------------------ */

export function Divider(props: Props) {
  const spacing = num(props.spacing, 0);

  return (
    <hr
      className={cx('lc-divider', bool(props.invert) && 'lc-divider--invert')}
      style={{ margin: `${spacing}px 0`, ...styleOf(props.style) }}
      {...passthrough(props)}
    />
  );
}

export const dividerMaterial: ComponentMeta = defineMaterial({
  componentName: 'Divider',
  title: '分割线',
  group: '基础',
  props: {
    spacing: { title: '上下间距', type: 'number', defaultValue: 0 },
    invert: { title: '反色', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Divider',
    props: { spacing: 20 },
  },
});

/* ------------------------------------------------------------------ */
/* Image                                                              */
/* ------------------------------------------------------------------ */

export function Image(props: Props) {
  const src = str(props.src);
  const alt = str(props.alt, '图片');
  const radius = num(props.radius, 12);

  if (!src) {
    return (
      <div
        className="lc-image lc-image--empty"
        style={{ borderRadius: radius, ...styleOf(props.style) }}
        {...passthrough(props)}
      >
        {alt}
      </div>
    );
  }

  return (
    <img
      className="lc-image"
      src={src}
      alt={alt}
      style={{ borderRadius: radius, ...styleOf(props.style) }}
      {...passthrough(props)}
    />
  );
}

export const imageMaterial: ComponentMeta = defineMaterial({
  componentName: 'Image',
  title: '图片',
  group: '基础',
  props: {
    src: { title: '图片地址', type: 'string' },
    alt: { title: '替代文本', type: 'string' },
    radius: { title: '圆角', type: 'number', defaultValue: 12 },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Image',
    props: { alt: '图片', radius: 12 },
  },
});

/* ------------------------------------------------------------------ */
/* Spacer                                                             */
/* ------------------------------------------------------------------ */

export function Spacer(props: Props) {
  const size = num(props.size, 16);

  return (
    <div
      className={cx('lc-spacer', bool(props.grow) && 'lc-spacer--grow')}
      style={bool(props.grow) ? styleOf(props.style) : { height: size, ...styleOf(props.style) }}
      {...passthrough(props)}
    />
  );
}

export const spacerMaterial: ComponentMeta = defineMaterial({
  componentName: 'Spacer',
  title: '间距',
  group: '基础',
  props: {
    size: { title: '高度', type: 'number', defaultValue: 16 },
    grow: { title: '撑满剩余', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Spacer',
    props: { size: 16 },
  },
});
