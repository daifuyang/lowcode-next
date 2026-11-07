import {
  ChartColumn,
  Code,
  CreditCard,
  FileText,
  Heading1,
  Image as ImageIcon,
  LayoutGrid,
  LayoutPanelTop,
  Link2,
  Minus,
  Monitor,
  PanelBottom,
  PanelTop,
  RectangleHorizontal,
  Rows3,
  Shapes,
  Square,
  SquareStack,
  Tag,
  Type,
  UnfoldVertical,
} from '@lucide/vue';
import type { Component } from 'vue';

/**
 * 物料 / 节点图标集（Vue 版，DESIGN-v1 §12.13.2）。
 *
 * 与 `designer-react/src/icons.tsx` **同一张名字表、同一套线宽规则**，只是
 * 渲染件换成 `@lucide/vue`。共享的是「哪个 componentName 用哪个图形」这条约定，
 * 不是组件实例 —— 所以这张表按 flavor 各一份，图标名必须成对维护。
 *
 * `@lucide/vue` 是 lucide 官方现行包名（`lucide-vue-next` 已弃用）。
 * 版本 1.x 与 `lucide-react@1.x` 对齐，图标集合与命名一致。
 */
export const GLYPHS: Record<string, Component> = {
  // 布局
  Div: Square,
  Stack: Rows3,
  Grid: LayoutGrid,
  Section: LayoutPanelTop,
  Card: CreditCard,

  // 基础
  Heading: Heading1,
  Text: Type,
  Button: RectangleHorizontal,
  Link: Link2,
  Badge: Tag,
  Icon: Shapes,
  Image: ImageIcon,
  Divider: Minus,
  Spacer: UnfoldVertical,

  // 区块
  Navbar: PanelTop,
  Hero: Monitor,
  FeatureCard: SquareStack,
  Stat: ChartColumn,
  CodeBlock: Code,
  Footer: PanelBottom,

  // 页面 / 根节点
  Page: FileText,
};

/**
 * 线宽按尺寸走三档：lucide 的 2 是给 24px 定的，缩到 16px 只剩 1.3px，
 * 在大纲里和 11px 的文字并排会显飘；20~24px 的宫格图标 2 会偏重，降一档。
 * 与 React 版逐字相同 —— 两版图标看起来一样重，靠的就是这里不分叉。
 */
export function strokeFor(size: number): number {
  if (size >= 24) return 1.6;
  if (size >= 20) return 1.7;
  return 2;
}
