/**
 * 共享宿主代码的全局类型声明。
 *
 * 写在 `apps/shared` 而不是各 app：`@pg/*` 下的模块被两个 app 的 tsconfig 同时
 * `include`，声明写一次就够，不会出现「一边有声明一边漏」。
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
