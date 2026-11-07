/**
 * Vue 版 iframe 画布的薄壳。实现见 `./canvas-body.ts`。
 *
 * 与 React 版的差别只在渲染器：这里用 `@lowcode-next/renderer-vue` +
 * `@lowcode-next/materials-vue`，画布里的每个物料都是 Vue 组件。
 * iframe 隔离、消息通道、选中框、拖拽命中全部不变。
 */
import './canvas-body';
