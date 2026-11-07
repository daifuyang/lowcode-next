import { defineMaterial, propOptions } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 布局物料的描述（5 个）。
 *
 * 本文件**没有一行视图代码**：常量数组导出给 `materials-react` / `materials-vue`
 * 各自的实现 import，用于 `pick()` 校验。这就是「enum 与实现同源」在物理上的
 * 保证 —— 面板下拉和画布渲染读的是同一个数组，不可能抄漏一个选项。
 *
 * 以前常量和组件写在同一个 `.tsx` 里，靠注释约定「不许手抄第二份」；现在由
 * 模块边界强制。
 */

/* ------------------------------------------------------------------ */
/* Div —— 唯一没有 props 的容器，拆包后仍是最短的完整物料样本          */
/* ------------------------------------------------------------------ */

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

export const DIRECTIONS = ['column', 'row'] as const;
export const STACK_ALIGN = ['start', 'center', 'end', 'stretch'] as const;
export const STACK_JUSTIFY = ['start', 'center', 'end', 'between'] as const;

export const DIRECTION_LABEL: Record<string, string> = { column: '纵向', row: '横向' };
export const STACK_ALIGN_LABEL: Record<string, string> = {
  start: '起点',
  center: '居中',
  end: '终点',
  stretch: '拉伸',
};
export const STACK_JUSTIFY_LABEL: Record<string, string> = {
  start: '起点',
  center: '居中',
  end: '终点',
  between: '两端',
};

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
      options: propOptions(STACK_ALIGN, STACK_ALIGN_LABEL),
    },
    justify: {
      title: '主轴对齐',
      type: 'string',
      defaultValue: 'start',
      options: propOptions(STACK_JUSTIFY, STACK_JUSTIFY_LABEL),
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

export const SECTION_TONES = ['light', 'muted', 'dark', 'accent'] as const;
/** padding 档位 → 上下留白的像素值，实现里拼进 inline style */
export const SECTION_PADDING = { sm: 40, md: 68, lg: 92 } as const;
export const PADDING_SIZES = ['sm', 'md', 'lg'] as const;

export const SECTION_TONE_LABEL: Record<string, string> = {
  light: '白底',
  muted: '浅灰',
  dark: '深色',
  accent: '主色',
};

export const PADDING_LABEL: Record<string, string> = { sm: '紧凑', md: '常规', lg: '宽松' };

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

export const CARD_TONES = ['white', 'muted', 'dark', 'outline'] as const;

export const CARD_TONE_LABEL: Record<string, string> = {
  white: '白底',
  muted: '浅灰',
  dark: '深色',
  outline: '描边',
};

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
