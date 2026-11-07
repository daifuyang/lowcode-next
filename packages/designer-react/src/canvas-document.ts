/**
 * 现场造出 iframe 的文档（§12.14）。
 *
 * 独立入口页方案下，画布文档是用户提供的 `canvas.html`；portal 方案下没有那个文件，
 * 由这里 `document.write()` 一个空壳，再把画布内容 Portal 进去。
 *
 * **样式必须手动同步。** iframe 是独立 document，父文档的样式表不会自动生效 ——
 * 而用户组件的样式、物料样式（`lc-*`）、Tailwind 全在父文档里。不同步的表现是
 * "编辑器面板好看、画布里的组件是裸的"，且极易被误判成组件本身的问题。
 *
 * 开发期 Vite 是 `<style>` 热替换（改内容而不是增删元素），所以观察器要带
 * `characterData`；生产是 `<link>` 列表，基本不变。
 */

export interface CanvasDocumentHandle {
  doc: Document;
  /** 断开样式观察并清空文档内容（卸载时调） */
  dispose: () => void;
}

const CLONED_ATTR = 'data-lc-cloned';
const EMPTY_SHELL =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '</head><body></body></html>';

export function prepareCanvasDocument(frame: HTMLIFrameElement): CanvasDocumentHandle | null {
  const doc = frame.contentDocument;
  if (!doc) return null;

  doc.open();
  doc.write(EMPTY_SHELL);
  doc.close();

  /** 全量重同步：先摘掉上一轮克隆的节点，再按父文档当前状态重克隆 */
  const sync = () => {
    for (const stale of doc.head.querySelectorAll(`[${CLONED_ATTR}]`)) stale.remove();
    for (const node of globalThis.document.querySelectorAll('style, link[rel="stylesheet"]')) {
      const clone = node.cloneNode(true) as Element;
      clone.setAttribute(CLONED_ATTR, '');
      doc.head.appendChild(clone);
    }
  };
  sync();

  // 父文档新增/替换样式元素 → 重新同步。只观察 head，避免画布自身的 DOM 变动触发
  const observer = new MutationObserver(() => sync());
  observer.observe(globalThis.document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return {
    doc,
    dispose: () => {
      observer.disconnect();
      doc.open();
      doc.write('<!doctype html><html><head></head><body></body></html>');
      doc.close();
    },
  };
}
