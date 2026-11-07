/**
 * 接入示例 —— 这个文件就是要给用户抄的那几行。
 *
 * 全部内容：引一次皮肤、交两份 JSON、交一张「组件名 → 组件」的映射表、
 * 调一次 `createEditor`。装配注册表、造 document、建画布文档、错误兜底
 * 都在 `@lowcode-next/lowcode-react` 内部完成，这里不出现任何管道代码。
 *
 * 对比改动之前：`App.tsx` + `materials.ts` + `canvas-body.tsx` +
 * `preview-body.tsx` + 两个入口薄壳，约 250 行，全部是接线。
 */

// 编辑器皮肤：Tailwind 入口 + 设计器 CSS 变量。接入方要提供一份等价的入口
import '@pg/styles.css';

import { createEditor } from '@lowcode-next/lowcode-react';
import { entryUrl, openPreview, writePreview } from '@pg/preview-route';
import { loadSavedSchema, saveSchema } from '@pg/schema-store';
import { showToast } from '@pg/toast';

import materials from '../materials.json';
import page from '@pg/schemas/landing.json';
import { StatCard } from './StatCard';

/**
 * 本页在 localStorage 里的 schema key（同 doc.id）。
 * 「保存」写到 `lowcode-next:schema:demo`；启动时优先读回保存过的内容，
 * 读不到（首次打开 / 用户清了存储）才回落到 shared 里的 landing.json
 */
const PAGE_KEY = 'demo';

const editor = createEditor('#root', {
  schema: loadSavedSchema(PAGE_KEY) ?? page,
  documentId: PAGE_KEY,
  // 物料描述（纯 JSON）与组件实现分开交，靠 componentName 对齐
  materials,
  components: { StatCard },
  // 20 个内置物料：演示时面板才有东西可拖。真实业务接入通常关掉
  includeBuiltin: true,
  // 整页布局自己带留白，画布不要再套一层内边距
  canvasPadding: 0,
  onSchemaChange: (schema) => {
    // 预览窗口靠这条实时跟随：写进 localStorage，`/render` 那页收到 storage
    // 事件就地更新。真实项目在这里同时落盘 / 打点。
    writePreview(schema);
    console.log('[demo] schema 已更新', schema.componentsTree.children?.length ?? 0, '个顶层节点');
  },
  // 保存 = 宿主决策（core 只交出 schema）：落 localStorage + toast 反馈
  onSave: (schema) => {
    saveSchema(PAGE_KEY, schema);
    showToast('已保存');
  },
  // 预览 = 换一个入口打开同一份 schema 的快照（§12.14.5）。
  // `render.html` 自己 import 包与组件，不共享任何运行时对象。
  onPreview: () => openPreview(editor.getSchema(), entryUrl('render')),
});

// 调试用：控制台里 `__editor.getSchema()` 可以拿到当前页面
Object.assign(globalThis, { __editor: editor });

/**
 * 注册表演示（DESIGN-v1 §12.12.6）：`?setter=demo` 时把内置 `textarea` 换成
 * 自定义实现，验证「编辑器跑起来之后注册 setter，属性面板立刻刷新」。
 *
 * 用动态 `import()` 而不是静态导入：setter 包往往在插件激活、路由切换时才拉，
 * 不是首屏必备。不加参数就什么都不注册。
 */
if (new URLSearchParams(globalThis.location.search).get('setter') === 'demo') {
  void import('./demo-setters').then(({ registerDemoSetters }) => registerDemoSetters());
}
