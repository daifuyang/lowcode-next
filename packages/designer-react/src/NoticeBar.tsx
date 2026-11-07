import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearError, getStoredError, subscribeError } from '@lowcode-next/designer-core';
import type { StoredError } from '@lowcode-next/designer-core';
import styles from '@lowcode-next/designer-ui/NoticeBar.module.css';

/**
 * 右上角报错条（参考 lowcode-engine 的 simulator 错误提示）。
 *
 * 数据来自 `designer-core` 的报错通道：任何 `reportError()` 都会写进 localStorage，
 * 所以刷新 / 重开示例后这条报错还在 —— 方便复现「保存过的内容为什么没生效」。
 * 关闭按钮只清内存 + 清 localStorage，不影响别的状态。
 */
export function NoticeBar() {
  const [error, setError] = useState<StoredError | null>(getStoredError());

  useEffect(() => subscribeError(() => setError(getStoredError())), []);

  if (!error) return null;

  return createPortal(
    <div className={styles.bar} role="alert">
      <span className={styles.icon} aria-hidden="true">
        !
      </span>
      <span className={styles.message}>{error.message}</span>
      <button
        type="button"
        className={styles.close}
        aria-label="关闭提示"
        title="关闭"
        onClick={clearError}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
