import type { Component } from 'vue';
import type { MaterialPackage } from '@lowcode-next/materials';
import {
  assertMetaBindings,
  builtinMaterialPackage,
  subsetPackage,
} from '@lowcode-next/materials';
import Div from './components/Div.vue';
import Typography from './components/Typography.vue';
import Button from './components/Button.vue';

/**
 * 内置物料的 Vue 绑定（DESIGN-v1 §12.4）。
 *
 * 与 `@lowcode-next/materials-react` 是**对等**的两个包：描述都来自
 * `@lowcode-next/materials`，实现各写各的。Vue 版不 import React 版 —— 这就是拆包
 * 要解决的那件事（拆之前 `designer-vue` 得 `import type { MaterialRegistry } from
 * '@lowcode-next/renderer'`，而那个包 dependencies 里写着 `react`）。
 *
 * ## 为什么先只有 3 个
 *
 * 面板上只列**真能渲染**的物料（`subsetPackage` 按实现清单筛描述），而不是列全
 * 20 个、剩下 17 个一拖进画布就变兜底块。少几个物料是可见的功能缺口，
 * 「看起来有、一用就废」是排查成本高得多的状态。
 *
 * 补齐顺序按「覆盖形态」走：容器（Div）、带枚举的文本（Heading）、带多状态的
 * 按钮（Button）。这三个把 `isContainer`、`options`、`bool` 三类 meta 字段都走了一遍，
 * 剩下的物料基本是同一个模子。
 */

/** 已实现的物料清单 —— 与 `vueComponents` 的 key 必须一一对应 */
export const vueMaterialNames = ['Div', 'Typography', 'Button'] as const;

export type VueBindings = Record<string, Component>;

export const vueComponents: VueBindings = {
  Div,
  Typography,
  Button,
};

export interface VueMaterialPackage {
  meta: MaterialPackage;
  components: VueBindings;
}

/**
 * 把「描述子集 + 实现」配成一个 Vue 包。
 *
 * 传进来的 meta 必须是**已筛过的子集**（`subsetPackage`），否则这里会当场抛错 ——
 * 这正是想要的行为：往 `vueComponents` 里加了一个组件却忘了加名字，或者反过来，
 * 装配期就炸，不用等到拖进画布。
 */
export function createVuePackage(
  meta: MaterialPackage,
  components: VueBindings,
): VueMaterialPackage {
  assertMetaBindings(meta.metas, Object.keys(components), 'Vue');
  return { meta, components };
}

/** 内置 Vue 物料包：描述是内置包的子集，只保留已实现的那几个 */
export const builtinVueMaterialPackage: VueMaterialPackage = createVuePackage(
  subsetPackage(builtinMaterialPackage, vueMaterialNames, '@lowcode-next/materials-vue'),
  vueComponents,
);

export function mergeVueBindings(packages: VueMaterialPackage[]): VueBindings {
  const output: VueBindings = {};
  for (const pkg of packages) Object.assign(output, pkg.components);
  return output;
}

export { Div, Typography, Button };
