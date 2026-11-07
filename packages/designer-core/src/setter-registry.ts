import type { PropOption, PropMeta } from '@lowcode-next/protocol';

/**
 * setter 注册表（对齐 lowcode-engine 的 `registerSetter` + `Setters`）。
 *
 * 与引擎的差异，都是刻意为之：
 * 1. 引擎的注册表是**启动期一次性**的，注册后属性面板不会响应；这里加了版本号 +
 *    订阅，注册发生在**编辑过程中**（异步拉一个第三方包）时面板会立即刷新。
 * 2. 引擎用 `isDynamic` 布尔标记区分「组件」和「动态 setter 函数」，但两者运行时
 *    都是函数，自定义组件上很容易误判；这里改用**字段名**区分（`component` /
 *    `load` / `dynamic`），不需要标记。
 * 3. 引擎 `getSetter` 查不到返回 null，面板会静默空掉；这里要求调用方把
 *    「未注册」渲染成可见诊断（见 `SetterSlot`）。
 * 4. 引擎的表只有一份，setter 实现被钉死在引擎自己的 UI 框架上；这里给实现打
 *    **flavor 标签**（`'react'` / `'vue'` / 自定义），核心只搬运不解释 —— 见 §12.13.7。
 *
 * **本文件零框架依赖**（`SetterImpl` 是 `unknown`）：它是 `designer-core` 的成员，
 * React / Vue 两套编辑器共用同一份契约，各自在 UI 层把 `unknown` 收窄成自己的
 * 组件类型。M-L3-1 抽包时整文件搬过去，不改一行。
 */

/** 控件入参契约（现有 5 个控件的公共部分，保持向后兼容） */
export interface SetterProps {
  value: unknown;
  options?: PropOption[];
  placeholder?: string;
  multiline?: boolean;
  onCommit: (value: unknown) => void;
}

/** 只读上下文：给「联动 / 条件显示 / 数据源」类 setter 读，不给写 */
export interface SetterScope {
  nodeId: string;
  componentName: string;
  /** 当前节点 props 的只读快照 */
  props: Readonly<Record<string, unknown>>;
  /** 整页 schema 的只读快照（含 dataSource） */
  page: unknown;
}

/**
 * 自定义 setter 的完整上下文。
 *
 * 继承 `SetterProps`：现有 5 个控件按旧契约实现，直接传 `SetterContext` 也能工作
 * （多出来的字段它们不读），所以不需要改 `setters.tsx` 的任何一行。
 * `commit` 是 `onCommit` 的语义化别名；`batch` 走一次 `SetProps`，只进一条历史。
 */
export interface SetterContext extends SetterProps {
  /** 属性名 */
  field: string;
  meta: PropMeta;
  scope: SetterScope;
  disabled?: boolean;
  /** 一次写多个字段（间距四向、边距简写…），只产生一条历史记录 */
  batch: (updates: Record<string, unknown>) => void;
  /** 注册项 / `SetterRef` 对象形态声明的默认参数 */
  setterProps?: Record<string, unknown>;
}

/**
 * 编辑器 UI 的框架标识。
 *
 * 核心**不认识**任何具体值：`'react'` / `'vue'` 只是约定，第三方完全可以写
 * `'solid'` / `'webcomponent'`。用一个不透明的 string 而不是联合类型，是为了
 * 让核心连框架名都不出现（G1 的 grep 判据可以继续用）。
 */
export type SetterFlavor = string;

/**
 * 一份 setter 实现：组件、渲染函数、Web Component 构造函数…
 *
 * 核心不知道它长什么样（这就是「不锁框架」的落点），只有各 flavor 的 UI 层
 * 知道怎么渲染。React 侧收窄为 `ComponentType<SetterContext>`，Vue 侧收窄为
 * `Component`，都在自己的包内完成。
 */
export type SetterImpl = unknown;

/** `load()` 的返回值：直接给实现，或给一个带 default 的模块 */
export interface SetterModule {
  default?: SetterImpl;
  [key: string]: unknown;
}

export interface SetterEntryMeta {
  /** 诊断 / 未来做 setter 选择器时展示 */
  title?: string;
  /** 每次渲染前合并进 `ctx.setterProps` */
  defaultProps?: Record<string, unknown>;
}

/**
 * 注册项三种形态：
 * - `component`：常规组件，同步渲染（默认路径，零额外开销）
 * - `load`：异步加载，首次用到时才拉 —— 「编辑中加载第三方 setter 包」的主力
 * - `dynamic`：渲染时按上下文求值（引擎 `isDynamic` 的等价物，但显式声明）
 *
 * 后两者多一个 `flavor` 入参：同一个 setter 包要同时供两套编辑器用时，可以按
 * flavor 决定 import 哪个入口（对齐 Lexical 的 `@lexical/react` 分包形态）。
 */
export type SetterRegistration =
  | (SetterEntryMeta & { component: SetterImpl })
  | (SetterEntryMeta & { load: (flavor: SetterFlavor) => Promise<SetterModule | SetterImpl> })
  | (
      SetterEntryMeta & {
        dynamic: (ctx: SetterContext, flavor: SetterFlavor) => SetterImpl | SetterRegistration;
      }
    );

export interface RegisteredSetter {
  kind: string;
  registration: SetterRegistration;
  /** 谁注册的，用于诊断：builtin / host / 插件名 */
  source: string;
  /**
   * 这份实现属于哪套编辑器 UI：
   * - `'*'`：框架无关（Web Component、只吐 DOM 的渲染函数），任何 flavor 都能用
   * - 其它：只有同 flavor 的编辑器才会取到它
   */
  flavor: SetterFlavor;
}

/** 框架无关实现的标记 */
export const ANY_FLAVOR = '*';

/** 用户直接传组件时的简写形态 */
export type SetterInput = SetterRegistration | ((...args: never[]) => unknown);

export interface SetterRegistryOptions {
  /**
   * 绑定一个 flavor 后，`register()` 默认按它打标签、`match()` 默认按它筛选。
   * 每套编辑器 UI 各建一个（`new SetterRegistry({ flavor: 'react' })`），
   * 注册代码不需要反复写 flavor。
   */
  flavor?: SetterFlavor;
}

/** `match()` 的结果：三种状态都显式，逼调用方处理「未命中」而不是静默回落 */
export type SetterMatch =
  | { status: 'hit'; entry: RegisteredSetter }
  | { status: 'missing' }
  | {
      /** 有这个 kind，但只注册了别的 flavor 的实现 —— 典型的「React setter 拿去给 Vue 用」 */
      status: 'flavor-mismatch';
      entry: RegisteredSetter;
    };

export class SetterRegistry {
  private readonly map = new Map<string, RegisteredSetter>();
  private readonly listeners = new Set<() => void>();
  private readonly boundFlavor: SetterFlavor | undefined;
  private version = 0;

  constructor(options: SetterRegistryOptions = {}) {
    this.boundFlavor = options.flavor;
  }

  /** 本注册表绑定的 flavor（未绑定时 undefined，`match()` 不做筛选） */
  get flavor(): SetterFlavor | undefined {
    return this.boundFlavor;
  }

  register(
    kind: string,
    input: SetterInput,
    options: { source?: string; flavor?: SetterFlavor } = {},
  ): void {
    if (!kind) return;
    this.map.set(kind, {
      kind,
      registration: normalizeRegistration(input),
      source: options.source ?? 'host',
      flavor: options.flavor ?? this.boundFlavor ?? ANY_FLAVOR,
    });
    this.emit();
  }

  registerMany(
    entries: Record<string, SetterInput>,
    options: { source?: string; flavor?: SetterFlavor } = {},
  ): string[] {
    const kinds: string[] = [];
    for (const [kind, input] of Object.entries(entries)) {
      if (!kind) continue;
      this.map.set(kind, {
        kind,
        registration: normalizeRegistration(input),
        source: options.source ?? 'host',
        flavor: options.flavor ?? this.boundFlavor ?? ANY_FLAVOR,
      });
      kinds.push(kind);
    }
    if (kinds.length > 0) this.emit();
    return kinds;
  }

  unregister(kind: string): boolean {
    const removed = this.map.delete(kind);
    if (removed) this.emit();
    return removed;
  }

  /** 原始查询：不看 flavor。诊断 / 列表类用途走这个 */
  get(kind: string): RegisteredSetter | undefined {
    return this.map.get(kind);
  }

  has(kind: string): boolean {
    return this.map.has(kind);
  }

  /**
   * 按 flavor 解析：命中 / 没有 / 有但不属于这套 UI。
   *
   * 不用 `get() ?? 回落` 的写法，是因为「注册了 React 实现却拿给 Vue 面板用」
   * 必须能被报出来 —— 直接渲染会炸在别人组件的内部实现上，比空着更难查。
   */
  match(kind: string, flavor: SetterFlavor | undefined = this.boundFlavor): SetterMatch {
    const entry = this.map.get(kind);
    if (!entry) return { status: 'missing' };
    if (flavor === undefined || entry.flavor === ANY_FLAVOR || entry.flavor === flavor) {
      return { status: 'hit', entry };
    }
    return { status: 'flavor-mismatch', entry };
  }

  /** 所有已注册的 kind；传 flavor 时只列这套 UI 能用的 */
  kinds(flavor: SetterFlavor | undefined = this.boundFlavor): string[] {
    if (flavor === undefined) return [...this.map.keys()];
    return [...this.map.values()]
      .filter((entry) => entry.flavor === ANY_FLAVOR || entry.flavor === flavor)
      .map((entry) => entry.kind);
  }

  /** 配错 flavor 时一次性列全，给诊断面板用 */
  mismatches(flavor: SetterFlavor | undefined = this.boundFlavor): RegisteredSetter[] {
    if (flavor === undefined) return [];
    return [...this.map.values()].filter(
      (entry) => entry.flavor !== ANY_FLAVOR && entry.flavor !== flavor,
    );
  }

  list(): RegisteredSetter[] {
    return [...this.map.values()];
  }

  clear(): void {
    if (this.map.size === 0) return;
    this.map.clear();
    this.emit();
  }

  /** `useSyncExternalStore` 的快照：版本号变化即重渲染 */
  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}

function normalizeRegistration(input: SetterInput): SetterRegistration {
  // 组件与 dynamic 函数运行时都是函数，靠「有没有登记字段」区分：
  // 直接传函数的只可能是组件（dynamic 必须显式写成 { dynamic }）。
  return typeof input === 'function' ? { component: input } : input;
}

/* ------------------------------------------------------------------ */
/* 内置 kind 别名：兼容 lowcode 的组件名写法                              */
/* ------------------------------------------------------------------ */

/**
 * 引擎的 setter 名是**组件名**（`'TextAreaSetter'`），迁移过来的物料不该被逼着
 * 改 schema。这里做一层别名映射，语义 kind 与旧组件名都能解析。
 */
const KIND_ALIASES: Record<string, string> = {
  StringSetter: 'text',
  TextSetter: 'text',
  TextAreaSetter: 'textarea',
  NumberSetter: 'number',
  BoolSetter: 'bool',
  SelectSetter: 'select',
  JsonSetter: 'json',
};

/** 从 `SetterRef` 取出 kind；对象形态取 `componentName`，旧组件名走别名 */
export function setterKindOf(ref: unknown): string | undefined {
  const raw =
    typeof ref === 'string'
      ? ref
      : ref && typeof ref === 'object' && typeof (ref as { componentName?: unknown }).componentName === 'string'
        ? (ref as { componentName: string }).componentName
        : undefined;
  if (!raw) return undefined;
  return KIND_ALIASES[raw] ?? raw;
}

/** `SetterRef` 对象形态里声明的默认参数 */
export function setterRefProps(ref: unknown): Record<string, unknown> | undefined {
  if (!ref || typeof ref !== 'object') return undefined;
  const props = (ref as { props?: unknown }).props;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
  return props as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* 默认实例 + lowcode 同款便捷 API                                        */
/* ------------------------------------------------------------------ */

/**
 * 全局默认注册表：**不绑 flavor**，用来放框架无关的实现，或给只有一套编辑器的
 * 宿主用。
 *
 * 两套编辑器 UI 并存时，各自 `new SetterRegistry({ flavor })` 再注入 ——
 * 对应引擎的 `viewName` 分库，也是「一个实例只启用一种 setter 实现族」的落点。
 */
export const defaultSetterRegistry = new SetterRegistry();

export interface RegisterSetterOptions {
  registry?: SetterRegistry;
  source?: string;
  /** 不给就落到注册表绑定的 flavor（再退到 `'*'` 框架无关） */
  flavor?: SetterFlavor;
}

/**
 * 注册自定义 setter —— API 形状对齐 lowcode 的 `registerSetter`：
 * 既支持 `registerSetter('color', Comp)` / `registerSetter('color', { component })`，
 * 也支持 map 形式 `registerSetter({ color: Comp, icon: { load } })`。
 */
export function registerSetter(
  kindOrMap: string | Record<string, SetterInput>,
  input?: SetterInput,
  options: RegisterSetterOptions = {},
): void {
  const registry = options.registry ?? defaultSetterRegistry;
  const flavor = options.flavor ?? registry.flavor;
  const meta = { source: options.source ?? 'host', flavor };
  if (typeof kindOrMap === 'object') {
    registry.registerMany(kindOrMap, meta);
    return;
  }
  if (input === undefined) return;
  registry.register(kindOrMap, input, meta);
}

export function unregisterSetter(
  kind: string,
  options: { registry?: SetterRegistry } = {},
): boolean {
  return (options.registry ?? defaultSetterRegistry).unregister(kind);
}

/**
 * 编辑中动态加载：`await` 一个模块，批量注册进去。
 *
 * 这是「自定义 setter 在编辑中加载」的正式入口 —— 宿主可以在编辑器已经跑起来
 * 之后（按钮、路由、插件激活时）调用，属性面板会通过订阅自动刷新。
 *
 * 一个 setter 包同时供两套编辑器用时，按 flavor 取各自入口（对齐 Lexical 的
 * `@lexical/react` 分包形态，核心不合并框架代码）：
 *
 * ```ts
 * // React 编辑器
 * await loadSetters(async () => (await import('@acme/lc-setters/react')).react);
 * // Vue 编辑器
 * await loadSetters(async () => (await import('@acme/lc-setters/vue')).vue);
 * ```
 */
export async function loadSetters(
  loader: () => Promise<Record<string, SetterInput>>,
  options: RegisterSetterOptions = {},
): Promise<string[]> {
  const registry = options.registry ?? defaultSetterRegistry;
  const entries = await loader();
  return registry.registerMany(entries, {
    source: options.source ?? 'dynamic',
    flavor: options.flavor ?? registry.flavor,
  });
}
