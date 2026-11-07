import type { ComponentMeta } from '@lowcode-next/protocol';
import {
  divMaterial,
  stackMaterial,
  gridMaterial,
  sectionMaterial,
  cardMaterial,
} from './layout';
import {
  headingMaterial,
  textMaterial,
  buttonMaterial,
  linkMaterial,
  badgeMaterial,
  iconMaterial,
  imageMaterial,
  dividerMaterial,
  spacerMaterial,
} from './base';
import {
  navbarMaterial,
  heroMaterial,
  featureCardMaterial,
  statMaterial,
  codeBlockMaterial,
  footerMaterial,
} from './blocks';
import type { MaterialPackage } from '../registry';

/**
 * 内置物料清单。
 *
 * **顺序即物料面板的展示顺序**：先布局（搭骨架用的），再基础（填内容用的），
 * 最后区块（整段快捷方式）。分组标题取 meta.group。
 *
 * 这是一个**物料包**而不是裸数组 —— 装上/摘掉都按包粒度走（`registry.use()` /
 * `registry.unuse()`），业务方追加自己的物料时不需要改动这份清单。
 */
export const builtinMetas: ComponentMeta[] = [
  // 布局
  divMaterial,
  stackMaterial,
  gridMaterial,
  sectionMaterial,
  cardMaterial,

  // 基础
  headingMaterial,
  textMaterial,
  buttonMaterial,
  linkMaterial,
  badgeMaterial,
  iconMaterial,
  imageMaterial,
  dividerMaterial,
  spacerMaterial,

  // 区块
  navbarMaterial,
  heroMaterial,
  featureCardMaterial,
  statMaterial,
  codeBlockMaterial,
  footerMaterial,
];

/** 描述层的内置包。视图层各自把它绑上自己的实现（见 materials-react / -vue） */
export const builtinMaterialPackage: MaterialPackage = {
  id: '@lowcode-next/materials',
  title: '内置物料',
  version: '0.0.0',
  metas: builtinMetas,
};

export * from './layout';
export * from './base';
export * from './blocks';
