/**
 * lowcode-engine 样式面板图标的 **React 渲染件**（DESIGN-v1 §7.14）。
 *
 * 图标数据（iconfont symbol → path）已搬到 `@lowcode-next/designer-ui/icon-paths`，
 * 那里只有数据、没有框架，Vue 版读同一份。这里只负责把它渲染成 `<svg>`，并提供
 * 两个 React 专用的辅助（`EngineIcon` / `engineIcons`）。新增图标只改数据文件。
 */
import type { CSSProperties, ReactNode } from 'react';

import { ICON_PATHS } from '@lowcode-next/designer-ui/icon-paths';

export interface EngineIconProps {
  /** iconfont symbol id，例如 icon-beijingse */
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function EngineIcon({ name, size = 16, className, style }: EngineIconProps) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}

/** 按「枚举值 → iconfont id」批量生成 IconRadioGroup 需要的 icons map */
export function engineIcons(map: Record<string, string>, size = 16): Record<string, ReactNode> {
  return Object.fromEntries(
    Object.entries(map).map(([key, id]) => [key, <EngineIcon key={key} name={id} size={size} />]),
  );
}
