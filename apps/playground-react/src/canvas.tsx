/**
 * iframe 画布的薄壳。
 *
 * 实现放在 `apps/shared/src/canvas.tsx`（两个 app 共用）：画布永远走
 * `renderer-react`，与编辑器用哪套框架无关 —— 这正是 §12.13.6 组合矩阵里
 * 「Vue 编辑器 + React 画布」那一格。HTML 入口只认 `/src/canvas.tsx`，
 * 所以每个 app 留这么一行转发，避免 HTML 去引 root 之外的相对路径。
 */
import './canvas-body';
