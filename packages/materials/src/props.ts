/**
 * 物料实现的公共收口工具（零框架）。
 *
 * 一条硬约束贯穿所有物料：**schema 里的 props 是不可信的 `unknown`**。
 * 它可能来自手写 JSON、远端接口、旧版本数据，或者属性面板里手输的值，
 * 所以每个物料都必须用 pick/num/bool 收口，不允许直接 `props.x as string`。
 * 缺省值就地取，坏数据退化成默认样式而不是运行时崩溃。
 *
 * 这套工具以前住在 `renderer/materials/shared.ts`，React 与 Vue 各抄一份的话，
 * 「同一个非法值，两边退化结果不同」这类漂移迟早出现。现在两边 import 同一份。
 *
 * `style` 相关返回的是普通对象而不是 React 的 `CSSProperties` —— 那是本包唯一的
 * 框架出口，必须切干净。React 侧一行 cast 收在自己的包里（`toStyle`）。
 */

import { PROP_SETTER } from '@lowcode-next/protocol';
import type { PropSetter } from '@lowcode-next/protocol';

export type Props = Record<string, unknown>;

/**
 * 读出 driver 注入的单 prop 回写函数（§12.15）。
 *
 * 之所以用函数而不是让 `Props` 直接声明 symbol 槽位：带 symbol 成员的
 * 接口会触发 weak-type 检测（TS2322 "no properties in common"），业务组件
 * 自己的具体 props 接口就接不进 `ReactBindings` 了 —— 试过，报错在
 * `apps/playground-react/src/main.tsx`。收口成一个函数，symbol 只在这一处
 * 被 cast。
 */
export function getPropSetter(props: Props): PropSetter | undefined {
  return (props as { [PROP_SETTER]?: PropSetter })[PROP_SETTER];
}

/** schema 里 style 的形状：camelCase 键 + 字符串/数值 */
export type StyleObject = Record<string, string | number | undefined>;

/**
 * 从 props 里挑出需要透传到根 DOM 的属性。
 *
 * 只放行 `data-*` 与 `aria-*`：
 * - 拖拽命中依赖 `data-node-id` 出现在物料根元素上（D8）
 * - 编辑态角标依赖 `data-edit-flags`
 * - 其余业务 props（level / gap / tone…）绝不能落到 DOM 上，
 *   否则会被当成非法 HTML 属性，React 会报 unknown prop 警告，Vue 会把它们
 *   渲染成真属性 —— 两边的控制台噪音都很难看
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

/** schema 里的 style 是普通对象，直接当样式用；非对象一律丢弃 */
export function styleOf(value: unknown): StyleObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as StyleObject;
}

/** 合并书写顺序：基础样式 ← schema style ← 组件内部覆盖（极少用） */
export function mergeStyle(base: StyleObject, override: unknown): StyleObject {
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

/**
 * 枚举收口。
 *
 * 这里的 `allowed` 必须与 meta 里 `propOptions(allowed, ...)` 用的是**同一个
 * 常量数组**（从本包导出，两套绑定各自 import）。分开维护的后果：属性面板里
 * 有选项 A，组件却不认 A，选中后静默回落到默认值。
 */
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
