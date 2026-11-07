import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * 录入类物料的回写通道（§12.15）—— React 侧的注入载体。
 *
 * **为什么是 Context 而不是 props**：React 19 的 `createElement` 用
 * `for...in` 拷贝 config，symbol 键会被静默丢弃 —— driver 往 props 里塞的
 * 回写函数到不了组件（实测）。Context 是唯一能穿透 createElement 的官方通道。
 *
 * 分工：
 * - 上层（`renderTree` / 任何接了 onPropChange 的接入方）把
 *   `(nodeId, propName, value) => void` 放进 Provider；
 * - 物料组件用 `usePropSetter(props)` 取**绑定到自身节点**的回写函数：
 *   node id 从 `props['data-node-id']` 读 —— 字符串键，createElement 不会丢。
 * - 没有上层 Provider（纯运行态预览）→ 返回 undefined，组件退回内部 state。
 */
export const PropSetterContext = createContext<
  ((nodeId: string, propName: string, value: unknown) => void) | null
>(null);

/** 把 Provider 的回写函数绑定到当前节点。必须在物料组件内部调用（hook） */
export function usePropSetter(
  props: { 'data-node-id'?: unknown },
): ((propName: string, value: unknown) => void) | undefined {
  const set = useContext(PropSetterContext);
  const nodeId = props['data-node-id'];
  if (!set || typeof nodeId !== 'string') return undefined;
  return (propName, value) => set(nodeId, propName, value);
}

/** 供接入方包根节点用（renderTree 内部就是这么做的） */
export function PropSetterProvider({
  value,
  children,
}: {
  value: (nodeId: string, propName: string, value: unknown) => void;
  children: ReactNode;
}) {
  return <PropSetterContext.Provider value={value}>{children}</PropSetterContext.Provider>;
}
