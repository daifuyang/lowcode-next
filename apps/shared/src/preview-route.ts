/**
 * 预览页与编辑器之间的约定：schema 传递键 + 预览地址构造。
 *
 * 三处引用同一个常量（两个 app 的编辑器入口各写一次、`preview.tsx` 读一次）——
 * 之前是各写字面量，改一处忘一处就会得到「预览数据不存在」。
 */
export const PREVIEW_KEY = 'lowcode-next:preview-schema';

/**
 * 预览地址 = 同目录下的 `preview`（独立 HTML 入口，见 `preview.html`）。
 *
 * 用 URL 相对解析而不是拼 `location.pathname + '?preview=1'`：前者在
 * 「部署到子路径」「编辑器地址带 ?page=sample」两种情况下都算得对，
 * 也不会出现 `index.html/preview` 这种错拼。
 */
export function previewUrl(href: string = globalThis.location.href): string {
  return new URL('preview', href).toString();
}

/**
 * 存 schema 并开预览窗口。
 *
 * 存失败就不开 —— 否则用户看到的是一个「预览数据不存在」的页面，
 * 比什么都不发生更难理解。存成功才 `window.open`，避免被弹窗拦截后
 * 留下一条无效的 sessionStorage。
 */
export function openPreview(schema: unknown): void {
  try {
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(schema));
  } catch {
    return;
  }
  window.open(previewUrl(), '_blank', 'noopener');
}
