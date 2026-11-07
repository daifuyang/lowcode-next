import type { ReactNode } from 'react';
import { Pin, PinOff, X } from 'lucide-react';
import styles from '@lowcode-next/designer-ui/PaneHeader.module.css';

export interface PaneHeaderProps {
  /** 面板名，左栏统一用它标页 */
  title: string;
  /** 面板自己的小工具（如大纲树的「全部收起」），排在窗口动作左边 */
  extra?: ReactNode;
  /** 面板是否固定（占位）。false = 悬浮（浮在画布上、不占宽度） */
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
}

/**
 * 左栏面板的统一页头：标题 + 面板工具 + 窗口动作（固定 / 关闭）。
 *
 * 三个分组靠间距而不是分割线拉开：标题吃掉剩余宽度，工具与窗口动作之间留 6px，
 * 单个按钮 22 见方、组内间隔 2px —— 视觉上是一簇，不会散成一条按钮带。
 * 图标按钮都带 title，文字提示在 hover 时出现，页头才能只占 34px 高。
 *
 * 图钉图标照 lowcode 的语义：**画的是"点下去会变成什么"，不是当前状态**。
 * 悬浮时是图钉（点它 → 固定），固定时是划了斜线的图钉（点它 → 回到悬浮）。
 * 所以固定态不染品牌色 —— 图标本身已经在说"我能把你放回去"。
 */
export function PaneHeader({ title, extra, pinned, onTogglePin, onClose }: PaneHeaderProps) {
  return (
    <header className={styles.header}>
      <span className={styles.title} title={title}>
        {title}
      </span>

      {extra ? <span className={styles.extra}>{extra}</span> : null}

      <span className={styles.chrome}>
        {onTogglePin ? (
          <button
            type="button"
            className={styles.iconBtn}
            title={pinned ? '取消固定' : '固定'}
            aria-label={pinned ? '取消固定' : '固定'}
            onClick={onTogglePin}
          >
            {pinned ? <PinOff size={15} strokeWidth={1.8} aria-hidden="true" /> : <Pin size={15} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        ) : null}

        {onClose ? (
          <button
            type="button"
            className={styles.iconBtn}
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={13} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </header>
  );
}
