/**
 * 物料组件的收口工具（React 侧入口）。
 *
 * 逻辑本体在 `@lowcode-next/materials` —— 只有 `styleOf` 在这里被特化成返回
 * `CSSProperties`。组件文件因此只 import 这一个模块，不需要同时记得「哪个来自
 * 共享包、哪个来自本地」。
 */

export { passthrough, cx, mergeStyle, str, num, bool, pick } from '@lowcode-next/materials';
export type { Props } from '@lowcode-next/materials';

export { styleOf } from './style';
