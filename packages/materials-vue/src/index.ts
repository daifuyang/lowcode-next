import type { Component } from 'vue';
import type { MaterialPackage } from '@lowcode-next/materials';
import {
  assertMetaBindings,
  builtinMaterialPackage,
  subsetPackage,
} from '@lowcode-next/materials';
import Page from './components/Page.vue';
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
 * ## 当前清单
 *
 * 面板上只列**真能渲染**的物料（`subsetPackage` 按实现清单筛描述），而不是列全
 * 个、剩下的一拖进画布就变兜底块。少几个物料是可见的功能缺口，
 * 「看起来有、一用就废」是排查成本高得多的状态。
 *
 * 已补齐：页面壳（Page）、通用容器（Div，§12.17）、带枚举的文本（Typography）、
 * 带多状态的按钮（Button）。Div 与 Page 把 `isContainer`、`style`、`loop` 这类
 * 容器字段走了一遍，Typography/Button 把 `options`、`bool` 走了一遍，剩下的物料
 * 基本是同一个模子。
 *
 * Page 不进面板（`hidden: true`），但 Vue 的 sample 页根节点用它，必须有实现。
 */

/** 已实现的物料清单 —— 与 `vueComponents` 的 key 必须一一对应 */
export const vueMaterialNames = ['Page', 'Div', 'Typography', 'Button'] as const;

export type VueBindings = Record<string, Component>;

export const vueComponents: VueBindings = {
  Page,
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

export { Page, Div, Typography, Button };
