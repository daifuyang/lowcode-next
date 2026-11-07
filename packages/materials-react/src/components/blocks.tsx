import type { ReactNode } from 'react';
import { bool, cx, num, passthrough, str, styleOf } from '../lib/props';
import type { Props } from '../lib/props';

/**
 * 区块物料的 React 实现（6 个）。
 *
 * 这类物料把若干基础物料固定成「结构」，让搭落地页时不必每次从空容器拼。
 * 它们同时保留 children 插槽，所以既是快捷方式，也不会把用户锁死在预设结构里。
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
      {tag ? <span className="lc-tag lc-tag--accent lc-feature__tag">{tag}</span> : null}
      {title ? <h3 className="lc-feature__title">{title}</h3> : null}
      {desc ? <p className="lc-feature__desc">{desc}</p> : null}
      {props.children as ReactNode}
    </div>
  );
}

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
