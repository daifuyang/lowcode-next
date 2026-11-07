/**
 * `@lowcode-next/materials` —— 物料描述层（DESIGN-v1 §12.4）。
 *
 * 这里只有 `ComponentMeta` 和注册表，**没有一行视图代码**。视图层分成两个绑定包：
 * `@lowcode-next/materials-react` / `@lowcode-next/materials-vue`，各自提供 20 个
 * （或任意多个）组件实现，共用本包导出的枚举常量做 `pick()` 校验。
 *
 * 好处不只是「解耦」：
 * - 编辑器只依赖本包就能画出物料面板和属性表单，不需要拉一整套视图框架；
 * - 同一个物料包的描述只写一遍，两套渲染实现不会漂移；
 * - 业务方把自己的物料打成包用 `registry.use()` 装上，随时可摘。
 */

export {
  MaterialMetaRegistry,
  createMetaRegistry,
  subsetPackage,
  assertMetaBindings,
} from './registry';
export type { MaterialPackage, UsePackageOptions } from './registry';

export {
  passthrough,
  cx,
  styleOf,
  mergeStyle,
  str,
  num,
  bool,
  pick,
  getPropSetter,
} from './props';
export type { Props, StyleObject } from './props';

export * from './metas';
