import type { ReactNode } from 'react';
import {
  HEADING_TONES,
  TEXT_SIZES,
  TONES,
  ALIGNS,
  WEIGHTS,
  WEIGHT_VALUE,
  TEXT_TAGS,
  BUTTON_VARIANTS,
  BUTTON_SIZES,
  LINK_TONES,
  BADGE_TONES,
} from '@lowcode-next/materials';
import { bool, cx, num, passthrough, pick, str, styleOf } from '../lib/props';
import type { Props } from '../lib/props';

/**
 * 基础物料的 React 实现（9 个）。
 *
 * 与 `materials-vue/src/components/base.ts` 严格对等。枚举常量从
 * `@lowcode-next/materials` import，与 meta 里的 `propOptions()` 同源。
 */

/* ------------------------------------------------------------------ */
/* Heading                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Text                                                               */
/* ------------------------------------------------------------------ */

export function Text(props: Props) {
  const size = pick(props.size, TEXT_SIZES, 'base');
  const tone = pick(props.tone, TONES, 'default');
  const align = pick(props.align, ALIGNS, 'left');
  const tag = pick(props.as, TEXT_TAGS, 'p');
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

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Link                                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Badge                                                              */
/* ------------------------------------------------------------------ */

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
