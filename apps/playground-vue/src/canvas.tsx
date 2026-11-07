/**
 * iframe 画布的薄壳。实现见 `apps/shared/src/canvas.tsx`。
 *
 * 画布永远走 `renderer-react` —— 本 app 虽然用 Vue 做编辑器外壳，画布这一格
 * 仍是 React（§12.13.6 组合矩阵）。
 */
import '@pg/canvas';
