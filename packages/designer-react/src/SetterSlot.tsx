import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type {
  RegisteredSetter,
  SetterContext,
  SetterModule,
  SetterRegistration,
} from '@lowcode-next/designer-core';
import styles from '@lowcode-next/designer-ui/SetterSlot.module.css';

/**
 * setter 注册表的**渲染侧**（DESIGN-v1 §12.12.6 / §12.13.5）。
 *
 * 核心（`designer-core` 的 `SetterRegistry`）只负责「按 kind + flavor 找到一条
 * 注册项」，完全不认识 React。这里负责把那条注册项变成能渲染的东西：
 *
 * | 注册形态 | 这里做什么 |
 * |---|---|
 * | `{ component }` | 直接渲染，零额外开销 |
 * | `{ load }` | 首次用到才 `import()`，加载期间显示占位、失败显示原因 |
 * | `{ dynamic }` | 每次渲染按上下文求值，结果再按上面两支处理（最多下钻一层） |
 *
 * Vue 版会写一份同样职责的 slot，但**共用同一个注册表契约** —— 一次
 * `registerSetter` 调用在两侧都成立，各自只取自己 flavor 的实现。
 */

/**
 * 这套编辑器 UI 的框架标识。
 *
 * 与注册表里 `RegisteredSetter.flavor` 对得上才会渲染。宿主把一份
 * `new SetterRegistry({ flavor: 'vue' })` 误传给 React 设计器时，属性面板会
 * 报「flavor 不匹配」而不是把 Vue 组件塞进 React 树里炸掉。
 */
export const DESIGNER_FLAVOR = 'react';

type ReactSetter = ComponentType<SetterContext>;
type LoadableRegistration = Extract<SetterRegistration, { load: unknown }>;

/** 判据只看「能否当组件渲染」，不猜它内部实现 */
function asComponent(impl: unknown): ReactSetter | null {
  return typeof impl === 'function' ? (impl as ReactSetter) : null;
}

function isRegistration(value: unknown): value is SetterRegistration {
  return (
    !!value &&
    typeof value === 'object' &&
    ('component' in value || 'load' in value || 'dynamic' in value)
  );
}

/** `load()` 可以返回组件本身，也可以返回 `{ default: 组件 }` 模块 */
function pickComponent(mod: unknown): ReactSetter | null {
  const direct = asComponent(mod);
  if (direct) return direct;
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return asComponent((mod as SetterModule).default);
  }
  return null;
}

/**
 * 同一个注册项只加载一次。
 *
 * key 用 registration **对象**而不是 kind：宿主热替换同名 setter 时注册项会换成
 * 新对象，自然重新加载；旧 Promise 随旧对象一起回收（WeakMap 不持有强引用）。
 */
const pendingLoads = new WeakMap<object, Promise<unknown>>();

function startLoad(registration: LoadableRegistration): Promise<unknown> {
  const cached = pendingLoads.get(registration);
  if (cached) return cached;
  const promise = registration.load(DESIGNER_FLAVOR);
  pendingLoads.set(registration, promise);
  return promise;
}

type Resolution =
  | { status: 'ready'; Component: ReactSetter }
  | { status: 'loading' }
  | { status: 'invalid'; reason: string };

/**
 * 注册项 → 可渲染结果。
 *
 * `dynamic` 的求值发生在 render 期，所以它必须是**纯函数**（只读 ctx、不写文档），
 * 并且**返回稳定的组件引用**（模块级组件，别在 `dynamic` 里现写内联箭头函数）：
 * 每次渲染都给新函数，等于每次让 React 卸载重建子树，输入框会丢焦点。这里不做
 * 缓存 —— 缓存就等于替作者猜意图，反而不如让问题在书写时就暴露。
 * 返回不可渲染的值时报 `invalid` 而不是静默空白 —— 静默失败最难查。
 */
function resolve(registration: SetterRegistration, ctx: SetterContext, depth = 0): Resolution {
  if ('component' in registration) {
    const Component = asComponent(registration.component);
    return Component
      ? { status: 'ready', Component }
      : { status: 'invalid', reason: '注册项的 component 不是函数' };
  }

  if ('dynamic' in registration) {
    const out = registration.dynamic(ctx, DESIGNER_FLAVOR);
    // 允许 dynamic 再返回一个注册项，但只下钻一层：两层的动态 setter 已经无法从
    // schema 推断行为，继续递归只会让「为什么渲染成这个」变得不可查。
    if (isRegistration(out)) {
      if (depth >= 1) {
        return { status: 'invalid', reason: 'dynamic 连续返回注册项（只允许下钻一层）' };
      }
      return resolve(out, ctx, depth + 1);
    }
    const Component = asComponent(out);
    return Component
      ? { status: 'ready', Component }
      : { status: 'invalid', reason: 'dynamic 返回了不可渲染的值' };
  }

  return { status: 'loading' };
}

export interface SetterSlotProps {
  entry: RegisteredSetter;
  ctx: SetterContext;
}

/**
 * 渲染一条命中的注册项。
 *
 * 加载结果按**注册项对象**校验新鲜度：宿主重新注册同一个 kind 时，旧实现的
 * state 立刻作废，不会出现「换了 setter 但界面还是旧的」。
 */
export function SetterSlot({ entry, ctx }: SetterSlotProps) {
  const registration = entry.registration;
  const [loaded, setLoaded] = useState<{
    registration: SetterRegistration;
    Component: ReactSetter;
  } | null>(null);
  const [failed, setFailed] = useState<{ registration: SetterRegistration; message: string } | null>(
    null,
  );

  const fresh = loaded && loaded.registration === registration ? loaded : null;

  useEffect(() => {
    if (fresh) return;
    if (!('load' in registration)) return;
    let alive = true;
    startLoad(registration).then(
      (mod) => {
        if (!alive) return;
        const Component = pickComponent(mod);
        if (Component) setLoaded({ registration, Component });
        else setFailed({ registration, message: 'load() 的返回值里没有可渲染的组件' });
      },
      (error: unknown) => {
        if (!alive) return;
        setFailed({
          registration,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [registration, fresh]);

  if (fresh) {
    const Component = fresh.Component;
    return <Component {...ctx} />;
  }

  const failure = failed && failed.registration === registration ? failed.message : null;
  if (failure) {
    return <p className={styles.failed}>setter「{entry.kind}」加载失败：{failure}</p>;
  }

  // `component` / `dynamic` 每次渲染现算（dynamic 的语义就是「按上下文求值」）；
  // 只有 `{ load }` 会走到 pending，等 effect 里的 import 落地。
  const resolution = resolve(registration, ctx);
  if (resolution.status === 'invalid') {
    return <p className={styles.failed}>setter「{entry.kind}」不可用：{resolution.reason}</p>;
  }
  if (resolution.status === 'ready') {
    const Component = resolution.Component;
    return <Component {...ctx} />;
  }

  return <span className={styles.pending}>正在加载 setter「{entry.kind}」…</span>;
}
