import type { PropMeta, PropOption } from '@lowcode-next/protocol';
import { setterKindOf } from './setter-registry';
import type { NodeImpl } from '@lowcode-next/model';

/**
 * 属性面板的**行模型**（DESIGN-v1 §12.13.2）。
 *
 * 视图层只负责「把行模型画出来 + 把 `onCommit` 接回去」，不再自己判断：
 * - 哪些 props 要渲染、`style` 要排除哪一个；
 * - 哪些是「schema 里有、物料没声明」的键；
 * - 某个 `PropMeta` 该用哪类控件、占位符写什么；
 * - 文案行什么时候可编辑。
 *
 * 这些判断以前散在 `PropertyPanel.tsx` 的 `PropsTab` / `PropRow` 里。Vue 版如果
 * 自己再写一遍，两版会出现「同一物料显示不同属性集合」这类最难查的漂移。
 */

/** 内置控件种类。`setterKind`（自定义 setter）命中时优先于它，见 `resolvePropControl`。 */
export type PropControlKind = 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'json';

export interface PropControlSpec {
  kind: PropControlKind;
  options?: PropOption[];
  placeholder?: string;
  multiline?: boolean;
}

export interface PropertyRowModel {
  /** 属性名（写回时的 key） */
  name: string;
  meta: PropMeta;
  /** 显示名：`meta.title` 优先，回落属性名 */
  label: string;
  control: PropControlSpec;
  /**
   * 作者显式声明的语义 kind（`meta.setter` 归一后）。
   *
   * 与 `control.kind` 的区别很重要：
   * - `control` 是**推导结果**，非内置 kind（如 `color`）会被回落成 `text`；
   * - `setterKind` 是**原始意图**，`color` 依旧是 `color`。
   *
   * 属性面板先拿它去查 setter 注册表，查不到才用 `control` —— 否则「作者写了
   * `setter: 'color'` 但没注册」会被静默当成普通文本，看不出是配置错了。
   * 没写 `setter` 时是 `undefined`，此时用 `control.kind` 查表（支持全局替换内置控件）。
   */
  setterKind?: string;
  /** 是否显示"恢复默认"（值存在时才显示） */
  resettable: boolean;
}

export interface PropertyModel {
  rows: PropertyRowModel[];
  /** schema 里有、物料 meta 没声明的键 —— 不渲染就"看不见也改不了" */
  undeclared: string[];
  /** 文案行：只有 children 全是字符串时才可编辑 */
  text: { editable: boolean; value: string };
  /** 根节点（页面）：属性页签为**空且无提示**，对齐引擎的 settings-primary-pane */
  isRoot: boolean;
  /** 需要显示「这个物料没有可配置的属性」 */
  empty: boolean;
}

/** 语义 kind → 内置控件。不在这里的（如 `color`）由注册表决定 */
const BUILTIN_SETTER_KINDS: Record<string, PropControlKind> = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  bool: 'bool',
  select: 'select',
  json: 'json',
};

/** 已知控件种类时，补齐该控件特有的附属信息（options / 占位符 / 多行） */
function controlFor(kind: PropControlKind, meta: PropMeta): PropControlSpec {
  switch (kind) {
    case 'select':
      return { kind, options: meta.options ?? [] };
    case 'json':
      return { kind, placeholder: '{}' };
    case 'textarea':
      return { kind, multiline: true };
    case 'text':
      return {
        kind,
        placeholder: meta.defaultValue === undefined ? '' : String(meta.defaultValue),
      };
    default:
      return { kind };
  }
}

/** 这个语义 kind 是否由内置控件实现（`color` 之类返回 false，得靠注册表） */
export function isBuiltinSetterKind(kind: string): boolean {
  return Object.hasOwn(BUILTIN_SETTER_KINDS, kind);
}

/**
 * 按 `PropMeta` 推导控件。
 *
 * **顺序：显式 `setter` → `options` → `type`。**
 *
 * 早先的实现把 `setter` 排在最后、且只跟字符串字面量 `'TextAreaSetter'` 比较，
 * 于是有两个坑：① 带 `options` 的属性写 `setter` 永远不生效（枚举分支先返回了）；
 * ② `setter: { componentName: 'TextAreaSetter' }`（`SetterRef` 的合法对象形态）
 * 完全不认，静默退回单行文本。修法是把「作者显式声明」提到最高优先级 —— 推导永远
 * 不该盖掉声明 —— 并用 `setterKindOf` 归一（它认对象形态，也认旧组件名的别名）。
 *
 * 非内置 kind（如 `'color'`）这里不处理：`PropControlSpec` 只表达内置控件，
 * 自定义 setter 由属性面板查注册表决定（M4）。此处退回类型推导，注册表命中时
 * 面板会用它覆盖 —— 一个函数改一次，两套编辑器同时生效。
 */
export function resolvePropControl(meta: PropMeta): PropControlSpec {
  // 1) 显式声明最优先（对象形态 / 旧组件名都归一成语义 kind）
  const declared = setterKindOf(meta.setter);
  const declaredKind = declared ? BUILTIN_SETTER_KINDS[declared] : undefined;
  if (declaredKind) return controlFor(declaredKind, meta);

  // 2) 枚举
  if (meta.options && meta.options.length > 0) return { kind: 'select', options: meta.options };

  // 3) 按类型推断
  const type = meta.type ?? 'string';
  if (type === 'bool') return { kind: 'bool' };
  if (type === 'number') return { kind: 'number' };
  if (type === 'object' || type === 'array') return { kind: 'json', placeholder: '{}' };

  return {
    kind: 'text',
    placeholder: meta.defaultValue === undefined ? '' : String(meta.defaultValue),
  };
}

/**
 * 节点的文案**原样**（只取纯字符串子节点，**不 trim**）。
 *
 * 与 `tree.ts` 的 `nodeText` 刻意不同：那个是给大纲做行尾摘要的，trim 掉首尾空白更好看；
 * 这个会直接填进「文案」输入框，trim 掉就等于用户什么都没改、一提交就把首尾空格删了。
 * 两个函数长相几乎一样，所以这里把区别写在名字和注释上，别合并。
 */
export function nodeRawText(node: NodeImpl): string {
  return (node.schema.children ?? [])
    .filter((child): child is string => typeof child === 'string')
    .join('');
}

/** 把节点拍成属性面板的行模型 */
export function buildPropertyModel(node: NodeImpl): PropertyModel {
  const metaProps = node.meta?.props ?? {};
  const declaredKeys = new Set(Object.keys(metaProps));
  const isRoot = !node.parent;

  const rows: PropertyRowModel[] = Object.entries(metaProps)
    .filter(([key]) => key !== 'style')
    .map(([name, meta]) => ({
      name,
      meta,
      label: meta.title ?? name,
      control: resolvePropControl(meta),
      setterKind: setterKindOf(meta.setter),
      resettable: node.props[name] !== undefined,
    }));

  const undeclared = Object.keys(node.props).filter(
    (key) => key !== 'style' && !declaredKeys.has(key),
  );

  // 有元素子节点时改这段文本等于删子树，不给这个入口
  const editable = !node.hasElementChildren() && node.schema.children !== undefined;

  return {
    rows,
    undeclared,
    text: { editable, value: nodeRawText(node) },
    isRoot,
    empty: rows.length === 0 && !editable && !isRoot,
  };
}
