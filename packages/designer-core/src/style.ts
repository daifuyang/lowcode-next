/**
 * 样式页签的**纯规则**（DESIGN-v1 §12.13.2）。
 *
 * 这些函数原来以私有函数的形式埋在 `StyleSetter.tsx` / `StyleSetterExtras.tsx` 里，
 * 是「同一 schema 在两个编辑器里渲染不同」的高危点：单位剥不剥、四向简写怎么合并、
 * CSS 文本怎么解析，全都直接影响写回值。抽到 core 之后 React 版与 Vue 版调用的是
 * **同一份**实现，不存在两份漂移。
 *
 * 语义全部照抄 lowcode-engine（`removeUnit` / `parseToStyleData` / `multiProp` /
 * `formatBgImgUrl` …），改动一律以引擎为准。
 */

export const isNil = (value: unknown): boolean => value === undefined || value === null;

export const toText = (value: unknown): string => (isNil(value) ? '' : String(value));

/** 引擎 `isCssVarBind`：绑定 CSS 变量的字段禁用输入 */
export const isVarBind = (value: unknown): boolean =>
  typeof value === 'string' && /var\(/.test(value);

/** 引擎 `addUnit(value, unit)`：空值返回 null */
export const addUnit = (value: unknown, unit = 'px'): string | null =>
  isNil(value) ? null : `${value}${unit}`;

/** 引擎 `removeUnit`：仅剥 px，其他单位（%、calc…）原样保留 */
export function removeUnit(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text.endsWith('px') ? text.slice(0, -2) : text;
}

export const NUMERIC = /^-?\d+(\.\d+)?$/;

/** 驼峰 → kebab-case（引擎 `toLine`） */
export function toKebab(styleKey: string): string {
  return styleKey.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** kebab-case → 驼峰（引擎 `toHump`） */
export function toCamel(cssKey: string): string {
  return cssKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** styleData → CSS 文本。引擎 `parseToCssCode` 用 cssjson.toCSS，缩进是每层一个 tab */
export function styleToCssCode(style: Record<string, unknown>): string {
  const decls = Object.entries(style)
    .map(([key, value]) => `\t${toKebab(key)}: ${String(value)};`)
    .join('\n');
  return `#main {\n${decls}\n}`;
}

/**
 * CSS 文本 → styleData（引擎 `parseToStyleData` 同语义）。
 * 接受 `#main { }` 包装或裸声明；解析失败返回 null（引擎据此禁用保存）。
 */
export function parseToStyleData(code: string): Record<string, string> | null {
  let text = code.trim();
  const wrapped = text.match(/^#main\s*\{([\s\S]*)\}$/);
  if (wrapped) text = wrapped[1]!.trim();

  const style: Record<string, string> = {};
  for (const rawDecl of text.split(';')) {
    const decl = rawDecl.trim();
    if (decl === '') continue;
    const sep = decl.indexOf(':');
    if (sep <= 0) return null;
    const prop = decl.slice(0, sep).trim();
    const value = decl.slice(sep + 1).trim();
    if (!/^-?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop) || value === '') return null;
    style[toCamel(prop)] = value;
  }
  return style;
}

/** 引擎 `removeUnit(parseInt)` + `getUnit` 的合并形态：'50%' → { value:'50', unit:'%' } */
export function splitUnit(raw: unknown): { value: string; unit: string } {
  if (isNil(raw) || raw === 'auto') return { value: '', unit: 'px' };
  const text = String(raw).trim();
  if (text === '') return { value: '', unit: 'px' };
  const matched = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(text);
  if (!matched) return { value: text, unit: 'px' };
  return { value: matched[1]!, unit: matched[2] || 'px' };
}

/** 引擎 Number 的 `multiProp`：取 "a b" 的第 index 段，auto / 空 → 空输入 */
export function multiPart(raw: unknown, index: number): string {
  if (isNil(raw)) return '';
  const part = String(raw).trim().split(/\s+/)[index];
  return !part || part === 'auto' ? '' : part;
}

/**
 * 引擎 `onBgSizeChange` / `onBgPositionChange` 的写回：
 * 改一个方向，另一方向保持原值（缺省 auto）；两个都 auto 时删掉整个键。
 */
export function pairValue(
  raw: unknown,
  direction: 'width' | 'height' | 'horizontal' | 'vertical',
  value: string,
): string | undefined {
  const parts = isNil(raw) ? [] : String(raw).trim().split(/\s+/).filter(Boolean);
  const first = parts[0] && parts[0] !== 'auto' ? parts[0] : 'auto';
  const second = parts[1] && parts[1] !== 'auto' ? parts[1] : 'auto';
  const horizontal = direction === 'width' || direction === 'horizontal';
  const width = horizontal ? value : first;
  const height = horizontal ? second : value;
  return width === 'auto' && height === 'auto' ? undefined : `${width} ${height}`;
}

/** 引擎 `formatBgImgUrl` / `backToBgImgUrl` */
export function formatBgImgUrl(url: string): string | undefined {
  return url && url !== '' ? `url(${url})` : undefined;
}

export function parseBgImgUrl(styleUrl: unknown): string {
  const text = toText(styleUrl);
  if (!text) return '';
  const open = text.indexOf('(');
  const close = text.indexOf(')');
  return open >= 0 && close > open ? text.substring(open + 1, close) : text;
}
