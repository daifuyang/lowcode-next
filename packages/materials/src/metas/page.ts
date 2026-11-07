import { defineMaterial } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 页面壳（§12.16）—— 整棵 componentsTree 的根。
 *
 * 协议要求根是一个组件节点（`componentsTree: NodeSchema`），把布局物料全部
 * 拿掉之后，「根渲染成什么」必须有个着落。Page 就是这个着落：一个不带任何
 * 语义的块级容器，吃 `style` 覆盖口，children 即页面内容。
 *
 * `hidden: true` —— 它必须注册（根要渲染、要能被拖进子节点），但不该出现在
 * 物料面板里：页面里再套一层页面没有意义。
 */
export const pageMaterial: ComponentMeta = defineMaterial({
  componentName: 'Page',
  title: '页面',
  group: '页面',
  props: {
    style: {
      title: '样式覆盖',
      type: 'object',
      group: '样式',
    },
  },
  configure: {
    component: {
      isContainer: true,
      hidden: true,
    },
    supports: {
      style: true,
    },
  },
  defaultSchema: {
    id: 'page_root',
    componentName: 'Page',
    props: {},
    children: [],
  },
});
