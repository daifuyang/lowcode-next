import type { CSSProperties, ReactNode } from 'react';
import styles from './DesignerShell.module.css';

export interface DesignerShellProps {
  /** 顶栏左区：品牌 / 项目名（引擎 `.lc-top-area-left`） */
  toolbarLeft?: ReactNode;
  /** 顶栏中区：画布尺寸调整（引擎 `.lc-top-area-center`，flex:1 居中） */
  toolbarCenter?: ReactNode;
  /** 顶栏右区：撤销重做 / 保存 / 重置 / 预览（引擎 `.lc-top-area-right`） */
  toolbarRight?: ReactNode;
  /** 左栏：物料 / 大纲（自己带页签） */
  left?: ReactNode;
  canvas?: ReactNode;
  /** 追加到白色画布容器上的样式：画布定宽（尺寸调整）时由 Designer 传入 */
  canvasStyle?: CSSProperties;
  /** 右栏：属性 / 样式 / 数据（自己带页签） */
  right?: ReactNode;
  /** 画布底部的节点路径 */
  footer?: ReactNode;
  /** 左栏面板是否展开：展开时占位（图标栏 + 面板），收起只留图标栏 */
  leftOpen?: boolean;
  /** 悬浮面板（默认装载）：不占位，浮在画布上方 */
  floatPane?: ReactNode;
  /**
   * 「详情」浮层：贴在左栏面板右缘、盖在画布上，由自己的页头收尾。
   * 引擎 `plugin-datasource-pane` 的 detail（数据源编辑表单）就是这个装载 ——
   * `position: absolute; left: 300px; top: -48px; bottom: -48px; min-width: 600px`，
   * 不占右栏、也不改三栏栅格。
   */
  detailPane?: ReactNode;
}

/**
 * 设计器外壳：顶栏（左 / 中 / 右三区）+ 三栏 + 画布底栏。
 *
 * 顶栏三区布局照引擎 `editor-skeleton/src/layouts/top-area.tsx`：
 * 左区自适应宽、中区 flex:1 居中、右区自适应宽 —— 布局不认识内容，
 * 页签、标题、按钮都由传进来的节点自己管。
 */
export function DesignerShell({
  toolbarLeft,
  toolbarCenter,
  toolbarRight,
  left,
  canvas,
  canvasStyle,
  right,
  footer,
  leftOpen = true,
  floatPane,
  detailPane,
}: DesignerShellProps) {
  return (
    <div className={styles.root}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>{toolbarLeft}</div>
        <div className={styles.toolbarCenter}>{toolbarCenter}</div>
        <div className={styles.toolbarRight}>{toolbarRight}</div>
      </header>
      <div
        className={styles.body}
        // 收起时才覆盖 --left-width；展开用 CSS 里的 rail + dock-pane 默认值，
        // 宽度只在一处维护（DesignerShell.module.css 的 .body）
        style={
          leftOpen ? undefined : ({ '--left-width': 'var(--rail-width)' } as CSSProperties)
        }
      >
        <aside className={styles.panel}>{left}</aside>
        {/* 悬浮面板：绝对定位在图标栏右侧，不参与栅格，所以画布拿满宽度。
            data-lc-overlay：它会压住画布左缘，SelectionBorders 画「可视区」框时
            要把这块区域扣掉，否则框的左边整条画在面板底下（等于没画）。 */}
        {floatPane ? (
          <div className={styles.floatPane} data-lc-overlay="left-pane">
            {floatPane}
          </div>
        ) : null}
        {/* 详情浮层：紧贴面板右缘往画布方向展开，同样会压住画布左缘，
            所以也打 data-lc-overlay（「页面」级 hover 框要扣掉它这一段）。 */}
        {detailPane ? (
          <div className={styles.detailPane} data-lc-overlay="detail-pane">
            {detailPane}
          </div>
        ) : null}
        <main className={styles.canvasWrap}>
          <div className={styles.canvasStage}>
            <div className={styles.canvas} style={canvasStyle}>
              {canvas}
            </div>
          </div>
          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </main>
        <aside className={styles.panelRight}>{right}</aside>
      </div>
    </div>
  );
}
