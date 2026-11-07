/**
 * 录入类组件的回写通道（DESIGN-v1 §12.15）。
 *
 * **问题**：Input / Select / Checkbox 这类受控组件的值属于 schema（`props.value`），
 * 但 driver 渲染时拿不到文档模型 —— `renderTree` 是纯函数（schema → 视图），
 * 组件里打一个字，谁把它写回 schema？
 *
 * **方案**：driver 在 `ReactDriverOptions.setProp` 存在时，给每个节点的 props
 * 挂一个 `(propName, value) => void`，键就是这个 Symbol。物料实现从 props 里取：
 *
 * ```tsx
 * const setProp = props[PROP_SETTER];
 * // 有 → 编辑态，受控：打字即改 schema（undo/redo、属性面板全都能跟上）
 * // 没有 → 运行态，退回内部 state：预览页可以交互，但不落 schema
 * ```
 *
 * **为什么是 Symbol 而不是普通属性**：
 * - 不会漏到 DOM（React 只把字符串键当 attribute 透传）；
 * - 不会进 `toSchema()` / JSON 序列化；
 * - 不会和业务组件自己的 prop 撞名 —— `Symbol.for` 只是全局可发现，
 *   `Object.keys` / 展开/`pick` 都看不见它。
 *
 * **为什么是 `Symbol.for` 而不是 `Symbol()`**：物料实现与 driver 分属两个包，
 * 若 app 打包后 protocol 被复制成两份实例（非 ESM 去重场景），
 * `Symbol()` 会得到两个不相等的键导致通道静默断开；`Symbol.for` 用全局注册表
 * 保证跨副本同键。代价是名字要唯一，所以带完整前缀。
 */
export const PROP_SETTER = Symbol.for('lowcode-next.prop-setter');

/** driver 注入的单 prop 回写函数 */
export type PropSetter = (propName: string, value: unknown) => void;
