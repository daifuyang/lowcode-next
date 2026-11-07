import type { ComponentMeta } from '@lowcode-next/protocol';
import {
  typographyMaterial,
  linkMaterial,
  buttonMaterial,
  inputMaterial,
  textAreaMaterial,
  selectMaterial,
  checkboxMaterial,
  switchMaterial,
  tagMaterial,
  dividerMaterial,
  imageMaterial,
  progressMaterial,
  emptyMaterial,
  alertMaterial,
} from './base';
import { pageMaterial } from './page';
import { divMaterial } from './div';
import type { MaterialPackage } from '../registry';

/**
 * 内置物料清单（§12.16 / §12.17）。
 *
 * **顺序即物料面板的展示顺序**，分组标题取 meta.group。布局容器与页面级区块
 * 已整体移除，仅补回一个最朴素的通用容器 `Div`（§12.17）；页面根由隐藏的
 * `Page` 壳承担（见 `page.ts`，`hidden: true` 不进面板）。其余是原子组件。
 *
 * 这是一个**物料包**而不是裸数组 —— 装上/摘掉都按包粒度走（`registry.use()` /
 * `registry.unuse()`），业务方追加自己的物料时不需要改动这份清单。
 */
export const builtinMetas: ComponentMeta[] = [
  // 页面壳（hidden，面板不展示，但根节点渲染与顶层拖放都靠它）
  pageMaterial,

  // 布局（唯一通用容器）
  divMaterial,

  // 文字
  typographyMaterial,
  linkMaterial,

  // 操作
  buttonMaterial,

  // 录入
  inputMaterial,
  textAreaMaterial,
  selectMaterial,
  checkboxMaterial,
  switchMaterial,

  // 展示
  tagMaterial,
  dividerMaterial,
  imageMaterial,
  progressMaterial,
  emptyMaterial,
  alertMaterial,
];

/** 描述层的内置包。视图层各自把它绑上自己的实现（见 materials-react / -vue） */
export const builtinMaterialPackage: MaterialPackage = {
  id: '@lowcode-next/materials',
  title: '内置物料',
  version: '0.0.0',
  metas: builtinMetas,
};

export * from './base';
export * from './page';
export * from './div';
