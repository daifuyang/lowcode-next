import type { ComponentMeta } from '@lowcode-next/protocol';
import {
  divMaterial,
  stackMaterial,
  gridMaterial,
  sectionMaterial,
  cardMaterial,
} from './layout';
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
 * **顺序即物料面板的展示顺序**，分组标题取 meta.group。排列的用意是
 * 「从上到下就是搭建顺序」：先布局搭骨架，再填文字和操作，然后放录入控件，
 * 最后是展示类；区块（整段页面模块）压在最下面 —— 它更像模板而不是组件，
 * 常规搭建用不到。
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

  // 区块（页面级模板，不是原子组件）
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
