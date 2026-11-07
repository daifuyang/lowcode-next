import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ALERT_TYPES,
  ALIGNS,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  FIELD_SIZES,
  LINK_TONES,
  PROGRESS_TONES,
  TAG_TONES,
  TYPOGRAPHY_TAG,
  TYPOGRAPHY_TONES,
  TYPOGRAPHY_TYPES,
  WEIGHTS,
  WEIGHT_VALUE,
} from '@lowcode-next/materials';
import { usePropSetter } from '../prop-setter-context';
import { bool, cx, num, passthrough, pick, str, styleOf } from '../lib/props';
import type { Props } from '../lib/props';

/**
 * 原子物料的 React 实现（14 个，与 `materials/src/metas/base.ts` 一一对应）。
 *
 * 分组：文字（Typography/Link）→ 操作（Button）→ 录入（Input/TextArea/
 * Select/Checkbox/Switch）→ 展示（Tag/Divider/Image/Progress/Empty/Alert）。
 *
 * 枚举常量从 `@lowcode-next/materials` import —— 与 meta 的 `propOptions()`
 * 读同一份数组，面板选项与实现认的值不可能走偏。
 */

/* ------------------------------------------------------------------ */
/* Typography —— 原 Heading + Text 合并                                */
/* ------------------------------------------------------------------ */

export function Typography(props: Props) {
  const type = pick(props.type, TYPOGRAPHY_TYPES, 'body');
  const tone = pick(props.tone, TYPOGRAPHY_TONES, 'default');
  const align = pick(props.align, ALIGNS, 'left');
  // 标题默认半粗（继承原 Heading 的观感），正文/辅助文字默认常规
  const weight = pick(
    props.weight,
    WEIGHTS,
    type === 'body' || type === 'caption' ? 'normal' : 'semibold',
  );
  const Tag = TYPOGRAPHY_TAG[type] as 'p';

  return (
    <Tag
      className={cx(
        'lc-typo',
        `lc-typo--${type}`,
        `lc-tone--${tone}`,
        `lc-ta--${align}`,
        bool(props.mono) && 'lc-mono',
      )}
      style={{ fontWeight: WEIGHT_VALUE[weight], ...styleOf(props.style) }}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </Tag>
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
/* 录入：受控语义                                                      */
/* ------------------------------------------------------------------ */

/**
 * 录入组件共用的取值逻辑（§12.15）。
 *
 * - 上层包了回写 Provider（编辑态 / 接了 onPropChange 的运行态）→
 *   **受控**：读 `props[key]`，写经回写通道进 schema。
 * - 没包（纯预览）→ **非受控**：内部 state 兜底，可以打字但不落库。
 *
 * hooks 必须无条件调用（React 规则），所以两条路都先 `useState`，
 * 受控分支只是不用它。拆成文本 / 布尔两个钩子而不是一个泛型：
 * `useState` 对字面量入参（`''`）会收窄类型，泛型反而要到处断言。
 */
function useTextValue(props: Props): [string, (next: string) => void] {
  const [local, setLocal] = useState('');
  const setProp = usePropSetter(props);
  if (!setProp) return [local, setLocal];

  const current = props.value;
  return [typeof current === 'string' ? current : '', (next) => setProp('value', next)];
}

function useCheckedValue(props: Props, fallback: boolean): [boolean, (next: boolean) => void] {
  const [local, setLocal] = useState(fallback);
  const setProp = usePropSetter(props);
  if (!setProp) return [local, setLocal];

  const current = props.checked;
  return [typeof current === 'boolean' ? current : fallback, (next) => setProp('checked', next)];
}

export function Input(props: Props) {
  const [value, setValue] = useTextValue(props);
  const size = pick(props.size, FIELD_SIZES, 'md');

  return (
    <input
      type="text"
      className={cx('lc-input', size !== 'md' && `lc-input--${size}`)}
      value={value}
      placeholder={str(props.placeholder, '请输入')}
      disabled={bool(props.disabled)}
      onChange={(event) => setValue(event.target.value)}
      style={styleOf(props.style)}
      {...passthrough(props)}
    />
  );
}

export function TextArea(props: Props) {
  const [value, setValue] = useTextValue(props);
  const rows = Math.max(2, Math.min(num(props.rows, 3), 20));

  return (
    <textarea
      className="lc-textarea"
      rows={rows}
      value={value}
      placeholder={str(props.placeholder, '请输入')}
      disabled={bool(props.disabled)}
      onChange={(event) => setValue(event.target.value)}
      style={styleOf(props.style)}
      {...passthrough(props)}
    />
  );
}

/** 选项数组收口：只留 string/number 项，其他坏数据静默丢弃 */
function optionsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' || typeof item === 'number').map(String);
}

export function Select(props: Props) {
  const [value, setValue] = useTextValue(props);
  const size = pick(props.size, FIELD_SIZES, 'md');
  const options = optionsOf(props.options);

  return (
    <select
      className={cx('lc-select', size !== 'md' && `lc-select--${size}`)}
      value={value}
      disabled={bool(props.disabled)}
      onChange={(event) => setValue(event.target.value)}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      <option value="" disabled hidden>
        请选择
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function Checkbox(props: Props) {
  const [checked, setChecked] = useCheckedValue(props, true);

  return (
    <label
      className={cx('lc-checkbox', bool(props.disabled) && 'lc-field--disabled')}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={bool(props.disabled)}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <span className="lc-checkbox__box" aria-hidden="true" />
      <span className="lc-field__label">{str(props.label, '选项')}</span>
    </label>
  );
}

export function Switch(props: Props) {
  const [checked, setChecked] = useCheckedValue(props, true);

  return (
    <label
      className={cx('lc-switch', bool(props.disabled) && 'lc-field--disabled')}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={bool(props.disabled)}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <span className="lc-switch__track" aria-hidden="true">
        <span className="lc-switch__thumb" />
      </span>
      {props.label !== undefined && <span className="lc-field__label">{str(props.label)}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* 展示                                                                */
/* ------------------------------------------------------------------ */

export function Tag(props: Props) {
  const tone = pick(props.tone, TAG_TONES, 'accent');

  return (
    <span
      className={cx('lc-tag', `lc-tag--${tone}`)}
      style={styleOf(props.style)}
      {...passthrough(props)}
    >
      {props.children as ReactNode}
    </span>
  );
}

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

export function Progress(props: Props) {
  const percent = Math.max(0, Math.min(num(props.percent, 40), 100));
  const tone = pick(props.tone, PROGRESS_TONES, 'default');
  const height = Math.max(2, num(props.height, 8));

  return (
    <div className="lc-progress" style={styleOf(props.style)} {...passthrough(props)}>
      <div className="lc-progress__track" style={{ height }}>
        <div
          className={cx('lc-progress__bar', `lc-progress__bar--${tone}`)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {bool(props.showText, true) && (
        <span className="lc-progress__text">{Math.round(percent)}%</span>
      )}
    </div>
  );
}

export function Empty(props: Props) {
  return (
    <div className="lc-empty" style={styleOf(props.style)} {...passthrough(props)}>
      <div className="lc-empty__figure" aria-hidden="true">
        <span />
        <span />
      </div>
      <p className="lc-empty__text">{str(props.text, '暂无数据')}</p>
    </div>
  );
}

export function Alert(props: Props) {
  const type = pick(props.type, ALERT_TYPES, 'info');
  const [dismissed, setDismissed] = useState(false);
  const setProp = usePropSetter(props);

  // 编辑态（有回写通道）不允许关：关掉只是内部 state，节点还在 schema 里，
  // 面板上又没有任何开关能把它请回来，等于把用户锁在门外。
  const closable = bool(props.closable) && !setProp;
  if (dismissed) return null;

  return (
    <div className={cx('lc-alert', `lc-alert--${type}`)} style={styleOf(props.style)} {...passthrough(props)}>
      <span className="lc-alert__icon" aria-hidden="true" />
      <div className="lc-alert__body">
        {str(props.title) && <div className="lc-alert__title">{str(props.title)}</div>}
        {str(props.description) && (
          <div className="lc-alert__desc">{str(props.description)}</div>
        )}
      </div>
      {closable && (
        <button
          type="button"
          className="lc-alert__close"
          aria-label="关闭"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      )}
    </div>
  );
}
