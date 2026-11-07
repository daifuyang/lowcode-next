import { defineMaterial } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 区块物料的描述（6 个）：导航栏 / 首屏 / 特性卡 / 数据块 / 代码块 / 页脚。
 *
 * 这类物料把若干基础物料固定成「结构」，让搭落地页时不必每次从空容器拼。
 * 它们同时保留 children 插槽，所以既是快捷方式，也不会把用户锁死在预设结构里。
 *
 * 本组没有枚举 prop（全部是字符串/布尔/数值），所以没有导出常量。
 */

/* ------------------------------------------------------------------ */
/* Navbar                                                             */
/* ------------------------------------------------------------------ */

export const navbarMaterial: ComponentMeta = defineMaterial({
  componentName: 'Navbar',
  title: '导航栏',
  group: '区块',
  props: {
    brand: { title: '品牌名', type: 'string', defaultValue: 'Brand' },
    mark: { title: '标识字符', type: 'string', defaultValue: 'L' },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    // 品牌文案来自 props，children 只是导航项：空着也是完整形态，不挂空占位
    component: { isContainer: true, emptyPlaceholder: false },
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Navbar',
    props: { brand: 'Brand', mark: 'L' },
  },
});

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

export const heroMaterial: ComponentMeta = defineMaterial({
  componentName: 'Hero',
  title: '首屏',
  group: '区块',
  props: {
    style: { title: '样式', type: 'object' },
  },
  configure: {
    // 首屏自带背景与留白，空着不会塌成 0 高度
    component: { isContainer: true, emptyPlaceholder: false },
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Hero',
  },
});

/* ------------------------------------------------------------------ */
/* FeatureCard                                                        */
/* ------------------------------------------------------------------ */

export const featureCardMaterial: ComponentMeta = defineMaterial({
  componentName: 'FeatureCard',
  title: '特性卡',
  group: '区块',
  props: {
    icon: { title: '图标字符', type: 'string', defaultValue: '◆' },
    tag: { title: '角标', type: 'string' },
    title: { title: '标题', type: 'string', defaultValue: '特性标题' },
    desc: {
      title: '描述',
      type: 'string',
      defaultValue: '一句话说明这个特性解决了什么问题。',
      // 长文本给多行控件，单行输入框写到一半就看不见前面了
      setter: 'TextAreaSetter',
    },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    // 图标/标题/描述都来自 props，children 只是可选补充
    component: { isContainer: true, emptyPlaceholder: false },
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'FeatureCard',
    props: {
      icon: '◆',
      title: '特性标题',
      desc: '一句话说明这个特性解决了什么问题。',
    },
  },
});

/* ------------------------------------------------------------------ */
/* Stat                                                               */
/* ------------------------------------------------------------------ */

export const statMaterial: ComponentMeta = defineMaterial({
  componentName: 'Stat',
  title: '数据',
  group: '区块',
  props: {
    value: { title: '数值', type: 'string', defaultValue: '0' },
    suffix: { title: '后缀', type: 'string' },
    label: { title: '说明', type: 'string', defaultValue: '指标' },
    invert: { title: '反色', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Stat',
    props: { value: '128', suffix: '+', label: '指标说明' },
  },
});

/* ------------------------------------------------------------------ */
/* CodeBlock                                                          */
/* ------------------------------------------------------------------ */

export const codeBlockMaterial: ComponentMeta = defineMaterial({
  componentName: 'CodeBlock',
  title: '代码块',
  group: '区块',
  props: {
    code: { title: '代码', type: 'string', setter: 'TextAreaSetter' },
    filename: { title: '文件名', type: 'string', defaultValue: 'snippet.ts' },
    dots: { title: '指示灯数量', type: 'number', defaultValue: 3 },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'CodeBlock',
    props: { filename: 'snippet.ts', code: 'const answer = 42;' },
  },
});

/* ------------------------------------------------------------------ */
/* Footer                                                             */
/* ------------------------------------------------------------------ */

export const footerMaterial: ComponentMeta = defineMaterial({
  componentName: 'Footer',
  title: '页脚',
  group: '区块',
  props: {
    copyright: { title: '版权信息', type: 'string', defaultValue: '© 2026' },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    // 版权信息来自 props，children 只是右侧的补充链接
    component: { isContainer: true, emptyPlaceholder: false },
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Footer',
    props: { copyright: '© 2026 Brand' },
  },
});
