import type { ComponentType } from 'react';
import {
  AlignLeft,
  AlertCircle,
  CheckSquare,
  ChevronDownSquare,
  FileText,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader,
  Minus,
  RectangleHorizontal,
  Square,
  Tag,
  TextCursorInput,
  ToggleLeft,
  Type,
} from 'lucide-react';

/**
 * 物料 / 节点图标集。
 *
 * 宜搭与 lowcode-engine 的物料、大纲、属性头都用图形图标而不是首字母徽章，
 * 图标是扫面板时的主要寻址线索。图形统一来 **lucide**（ISC，线性 24 视窗），
 * 不再自己写 path：自绘图标最大的问题是同一个人不同时间画的线宽、圆角、
 * 留白都对不齐，20px 下一排看过去会一轻一重。
 *
 * 这里保留 `MatIcon({ name })` 这层壳，原因是 componentName 是运行时字符串
 * （物料注册表里来的），而 lucide 是具名导出、按需 tree-shake —— 中间必须有一张
 * 名字到组件的表。未登记的物料回落到首字母徽章。
 */

export interface MatIconProps {
  name: string;
  size?: number;
}

/** lucide 图标的公共签名，只取这里会用到的字段 */
type Glyph = ComponentType<{
  size?: number | string;
  strokeWidth?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

const GLYPHS: Record<string, Glyph> = {
  // 页面壳（hidden，树面板里会见到）
  Page: FileText,

  // 布局（通用容器）
  Div: Square,

  // 原子组件（§12.16）
  Typography: Type,
  Button: RectangleHorizontal,
  Link: Link2,
  Image: ImageIcon,
  Divider: Minus,
  Input: TextCursorInput,
  TextArea: AlignLeft,
  Select: ChevronDownSquare,
  Checkbox: CheckSquare,
  Switch: ToggleLeft,
  Tag: Tag,
  Progress: Loader,
  Empty: Inbox,
  Alert: AlertCircle,
};

/**
 * 线宽按尺寸走三档：lucide 的 2 是给 24px 定的，缩到 16px 只剩 1.3px，
 * 在树里和 11px 的文字并排会显飘；20~24px 的宫格图标 2 会偏重，降一档。
 */
function strokeFor(size: number): number {
  if (size >= 24) return 1.6;
  if (size >= 20) return 1.7;
  return 2;
}

export function MatIcon({ name, size = 16 }: MatIconProps) {
  const Glyph = GLYPHS[name];
  if (!Glyph) {
    // 未注册物料回落到首字母徽章，保证新增物料不至于没有图标
    return (
      <span
        style={{
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.62),
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {(name[0] ?? '?').toUpperCase()}
      </span>
    );
  }
  return <Glyph size={size} strokeWidth={strokeFor(size)} aria-hidden="true" />;
}

