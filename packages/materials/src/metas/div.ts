import { defineMaterial } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 通用块级容器（§12.17）—— 布局物料整体移除后补回的唯一容器。
 *
 * Div 不携带任何视觉语义：它既不是「栅格」也不是「卡片」，就是一个
 * 「可以往里拖东西、可以编组、可以整体设 style」的裸 `<div>`。上一轮把
 * Row/Col/Card 之类的布局物料删掉之后，用户想「把几个组件框在一起」就没了
 * 抓手，Page 是页面根、不该被当成普通容器反复嵌套，所以需要一个最朴素的
 * 容器。它对齐 lowcode-engine 的「容器」物料。
 *
 * `isContainer: true` —— 唯一的容器判据（见 `protocol` 的 `isContainerMeta`），
 * 空态由引擎的 empty-placeholder 机制兜底（高度/选中提示）。
 */
export const divMaterial: ComponentMeta = defineMaterial({
  componentName: 'Div',
  title: '容器',
  group: '布局',
  props: {
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {
      isContainer: true,
    },
    supports: {
      style: true,
      condition: true,
      loop: true,
    },
  },
  defaultSchema: {
    id: 'div_default',
    componentName: 'Div',
    props: {},
    children: [],
  },
});
