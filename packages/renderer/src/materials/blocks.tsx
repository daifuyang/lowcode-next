import type { ReactNode } from 'react';
import { defineMaterial } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { bool, cx, num, passthrough, pick, str, styleOf } from './shared';
import type { Props } from './shared';

/**
 * 区块物料：导航栏 / 首屏 / 特性卡 / 数据块 / 代码块 / 页脚。
 *
 * 这类物料是把若干基础物料固定成"结构"，让搭建落地页时不必每次
 * 从空容器开始拼。它们同时保留 children 插槽，所以既是快捷方式，
 * 也不会把用户锁死在预设结构里。
 */

/* ------------------------------------------------------------------ */
/* Navbar                                                             */
/* ------------------------------------------------------------------ */

export function Navbar(props: Props) {
  return (
    <header className="lc-navbar" style={styleOf(props.style)} {...passthrough(props)}>
      <div className="lc-navbar__brand">
        <span className="lc-navbar__mark">{str(props.mark, 'L')}</span>
        <span>{str(props.brand, 'Brand')}</span>
      </div>
      <nav className="lc-navbar__nav">{props.children as ReactNode}</nav>
    </header>
  );
}

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

export function Hero(props: Props) {
  return (
    <section className="lc-hero" style={styleOf(props.style)} {...passthrough(props)}>
      <div className="lc-hero__grid" />
      <div className="lc-hero__glow" />
      <div className="lc-hero__inner">{props.children as ReactNode}</div>
    </section>
  );
}

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

export function FeatureCard(props: Props) {
  const icon = str(props.icon);
  const tag = str(props.tag);
  const title = str(props.title);
  const desc = str(props.desc);

  return (
    <div className="lc-feature" style={styleOf(props.style)} {...passthrough(props)}>
      {icon ? <span className="lc-feature__icon">{icon}</span> : null}
      {tag ? <span className="lc-badge lc-badge--accent lc-feature__tag">{tag}</span> : null}
      {title ? <h3 className="lc-feature__title">{title}</h3> : null}
      {desc ? <p className="lc-feature__desc">{desc}</p> : null}
      {props.children as ReactNode}
    </div>
  );
}

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

export function Stat(props: Props) {
  const invert = bool(props.invert);
  const suffix = str(props.suffix);

  return (
    <div
      className={cx('lc-stat', invert && 'lc-stat--invert')}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      <span className="lc-stat__value">
        {str(props.value, '0')}
        {suffix ? <em className="lc-stat__suffix">{suffix}</em> : null}
      </span>
      <span className="lc-stat__label">{str(props.label, '指标')}</span>
    </div>
  );
}

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

export function CodeBlock(props: Props) {
  const code = str(props.code, '// 空代码块');
  const filename = str(props.filename, 'snippet.ts');
  const dots = num(props.dots, 3);

  return (
    <figure className="lc-code" style={styleOf(props.style)} {...passthrough(props)}>
      <div className="lc-code__bar">
        {Array.from({ length: Math.max(dots, 0) }, (_, index) => (
          <span key={index} className="lc-code__dot" />
        ))}
        <span className="lc-code__file">{filename}</span>
      </div>
      <pre className="lc-code__body">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

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

export function Footer(props: Props) {
  return (
    <footer className="lc-footer" style={styleOf(props.style)} {...passthrough(props)}>
      <div className="lc-footer__inner">
        <span className="lc-footer__copy">{str(props.copyright)}</span>
        <div className="lc-footer__extra">{props.children as ReactNode}</div>
      </div>
    </footer>
  );
}

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
