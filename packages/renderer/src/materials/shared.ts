import type { CSSProperties } from 'react';

/**
 * 物料层的公共工具。
 *
 * 一条硬约束贯穿所有物料：**schema 里的 props 是不可信的 `unknown`**。
 * 它可能来自手写 JSON、远端接口、旧版本数据，或者属性面板里手输的值，
 * 所以每个物料都必须用 pick/num/bool 收口，不允许直接 `props.x as string`。
 * 缺省值就地取，坏数据退化成默认样式而不是运行时崩溃。
 */

export type Props = Record<string, unknown>;

/**
 * 从 props 里挑出需要透传到根 DOM 的属性。
 *
 * 只放行 `data-*` 与 `aria-*`：
 * - 拖拽命中依赖 `data-node-id` 出现在物料根元素上（D8）
 * - 编辑态角标依赖 `data-edit-flags`
 * - 其余业务 props（level / gap / tone…）绝不能落到 DOM 上，
 *   否则会被当成非法 HTML 属性，React 也会报 unknown prop 警告
 */
export function passthrough(props: Props): Props {
  const output: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-') || key.startsWith('aria-')) output[key] = value;
  }
  return output;
}

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** schema 里的 style 是普通对象，直接当 CSSProperties 用；非对象一律丢弃 */
export function styleOf(value: unknown): CSSProperties {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as CSSProperties;
}

/** 合并书写顺序：基础样式 ← schema style ← 组件内部覆盖（极少用） */
export function mergeStyle(base: CSSProperties, override: unknown): CSSProperties {
  return { ...base, ...styleOf(override) };
}

export function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function num(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}
