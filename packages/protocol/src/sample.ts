import type { PageSchema } from './schema';

/**
 * 各包的示例/测试共用的最小页面 schema。
 * 同时也是一份"协议长什么样"的可执行文档。
 */
export const sampleSchema: PageSchema = {
  version: '1.0.1',
  componentsMap: [
    { componentName: 'Div', package: '@lowcode-next/builtin', exportName: 'Div' },
    { componentName: 'Button', package: '@lowcode-next/builtin', exportName: 'Button' },
  ],
  componentsTree: {
    id: 'root',
    componentName: 'Div',
    props: { style: { padding: 24 } },
    children: [
      {
        id: 'btn_1',
        componentName: 'Button',
        props: { type: 'primary' },
        children: ['提交'],
      },
      {
        id: 'btn_2',
        componentName: 'Button',
        props: { type: 'default' },
        children: ['取消'],
      },
    ],
  },
};
