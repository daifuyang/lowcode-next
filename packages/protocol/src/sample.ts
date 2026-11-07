import type { PageSchema } from './schema';

/**
 * 各包的示例/测试共用的最小页面 schema。
 * 同时也是一份"协议长什么样"的可执行文档。
 *
 * 根节点是 `Page`（§12.16）：协议要求根是一个组件，Page 是引擎级的隐藏页面壳。
 */
export const sampleSchema: PageSchema = {
  version: '1.0.1',
  componentsMap: [
    { componentName: 'Page', package: '@lowcode-next/builtin', exportName: 'Page' },
    { componentName: 'Button', package: '@lowcode-next/builtin', exportName: 'Button' },
  ],
  componentsTree: {
    id: 'root',
    componentName: 'Page',
    props: { style: { padding: 24 } },
    children: [
      {
        id: 'btn_1',
        componentName: 'Button',
        props: { variant: 'primary' },
        children: ['提交'],
      },
      {
        id: 'btn_2',
        componentName: 'Button',
        props: { variant: 'default' },
        children: ['取消'],
      },
    ],
  },
};
