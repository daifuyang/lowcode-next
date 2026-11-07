import type { ComponentType } from 'react';
import type { ComponentMeta } from '@lowcode-next/protocol';
import type { MaterialPackage, Props } from '@lowcode-next/materials';
import { builtinMaterialPackage, assertMetaBindings } from '@lowcode-next/materials';
import { Div, Stack, Grid, Section, Card } from './components/layout';
import {
  Heading,
  Text,
  Button,
  Link,
  Badge,
  Icon,
  Image,
  Divider,
  Spacer,
} from './components/base';
import { Navbar, Hero, FeatureCard, Stat, CodeBlock, Footer } from './components/blocks';

/**
 * 内置物料的 React 绑定（DESIGN-v1 §12.4）。
 *
 * 描述在 `@lowcode-next/materials`（零框架），实现在这里。两边靠
 * `componentName` 对齐，见 `bindReactMetas()` 的装配期校验。
 *
 * **样式表不在这里 import。** 本包会被 `tsc` 编成 dist，`import '*.css'` 留在
 * 产物里会指向一个不存在的文件。样式入口由宿主显式引入：
 *
 * ```ts
 * import '@lowcode-next/materials/styles.css';
 * ```
 */

export type ReactComponent = ComponentType<Props>;

/** componentName → 组件。key 必须与 meta 的 componentName 完全一致 */
export type ReactBindings = Record<string, ReactComponent>;

export const builtinReactComponents: ReactBindings = {
  // 布局
  Div,
  Stack,
  Grid,
  Section,
  Card,

  // 基础
  Heading,
  Text,
  Button,
  Link,
  Badge,
  Icon,
  Image,
  Divider,
  Spacer,

  // 区块
  Navbar,
  Hero,
  FeatureCard,
  Stat,
  CodeBlock,
  Footer,
};

/**
 * 装配期全量校验（照 `DESIGN-v1` §12.4 的约定）。
 *
 * 判定逻辑在 `@lowcode-next/materials` 的 `assertMetaBindings` —— Vue 侧要跑同一套，
 * 两边各写一遍迟早出现「React 拦住了、Vue 放过了」这种不对称。
 */
export function assertBindingsComplete(metas: ComponentMeta[], components: ReactBindings): void {
  assertMetaBindings(metas, Object.keys(components), 'React');
}

/**
 * 把一个物料包装成「描述 + 组件」的 React 包。
 *
 * 用法（多包并存的场景）：
 * ```ts
 * registry.use(builtinMaterialPackage);
 * registry.use(reactPackage(businessMetaPackage, businessComponents));
 * ```
 */
export interface ReactMaterialPackage {
  meta: MaterialPackage;
  components: ReactBindings;
}

export function reactPackage(meta: MaterialPackage, components: ReactBindings): ReactMaterialPackage {
  assertBindingsComplete(meta.metas, components);
  return { meta, components };
}

/** 内置包 —— 描述 + 实现配好的一份，宿主直接用 */
export const builtinReactMaterialPackage: ReactMaterialPackage = reactPackage(
  builtinMaterialPackage,
  builtinReactComponents,
);

/**
 * 把若干个 React 包合成一张扁平表，供 Driver 解析。
 *
 * 重名不在这里处理：`MaterialMetaRegistry.use()` 已经按包粒度校验过，
 * 能走到这一步的集合一定是无冲突的。
 */
export function mergeReactBindings(packages: ReactMaterialPackage[]): ReactBindings {
  const output: ReactBindings = {};
  for (const pkg of packages) Object.assign(output, pkg.components);
  return output;
}

export { Div, Stack, Grid, Section, Card } from './components/layout';
export {
  Heading,
  Text,
  Button,
  Link,
  Badge,
  Icon,
  Image,
  Divider,
  Spacer,
} from './components/base';
export { Navbar, Hero, FeatureCard, Stat, CodeBlock, Footer } from './components/blocks';
