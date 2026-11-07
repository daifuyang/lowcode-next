import { defineMaterial, propOptions } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 基础物料的描述（9 个）：文字、按钮、链接、标签、图标、分割线、图片、间距。
 *
 * 常量一律导出 —— 两套视图层的实现都 import 它们做 `pick()` 校验，与 meta 里的
 * `propOptions()` 共用同一个数组。字段顺序刻意与 props 的展示顺序一致，
 * 改动会直接改变属性面板的行序。
 */

export const TEXT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl'] as const;
export const TONES = ['default', 'muted', 'subtle', 'primary', 'invert', 'invert-strong'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;
export const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;

export const TEXT_SIZE_LABEL: Record<string, string> = {
  xs: '极小',
  sm: '小',
  base: '常规',
  lg: '大',
  xl: '特大',
};

export const TONE_LABEL: Record<string, string> = {
  default: '默认',
  muted: '次要',
  subtle: '弱化',
  primary: '主色',
  invert: '反色',
  'invert-strong': '反色强调',
  gradient: '渐变',
};

export const ALIGN_LABEL: Record<string, string> = { left: '左', center: '中', right: '右' };

export const WEIGHT_LABEL: Record<string, string> = {
  normal: '常规',
  medium: '中等',
  semibold: '半粗',
  bold: '粗',
};

/** 语义字重 → 数值。实现里拼进 inline style，不在 CSS 里重复定义 */
export const WEIGHT_VALUE: Record<(typeof WEIGHTS)[number], number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/* ------------------------------------------------------------------ */
/* Heading                                                            */
/* ------------------------------------------------------------------ */

export const HEADING_TONES = ['default', 'invert', 'gradient'] as const;
export const HEADING_LEVELS = [1, 2, 3, 4] as const;

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

/** Text 的 `as` 允许的标签 —— 单独导出，实现与 meta 共用 */
export const TEXT_TAGS = ['p', 'span', 'div'] as const;

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
      options: propOptions(TEXT_TAGS),
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

export const BUTTON_VARIANTS = ['primary', 'default', 'ghost', 'outline'] as const;
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;

export const BUTTON_VARIANT_LABEL: Record<string, string> = {
  primary: '主按钮',
  default: '次按钮',
  ghost: '文字按钮',
  outline: '描边按钮',
};

export const BUTTON_SIZE_LABEL: Record<string, string> = { sm: '小', md: '中', lg: '大' };

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

export const LINK_TONES = ['default', 'invert', 'muted'] as const;

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

export const BADGE_TONES = ['accent', 'neutral', 'success', 'invert', 'outline'] as const;

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
