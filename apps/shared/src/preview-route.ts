import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';

/**
 * 预览通道 —— 编辑态把页面交给 render 态的唯一约定（DESIGN-v1 §12.14.5）。
 *
 * **为什么是「序列化一份数据」，而不是「共享运行时对象」**
 *
 * 因为 render 态是纯映射：`schema + 物料表 → DOM`。同样的 schema、同样的物料，
 * 渲染结果必然一样。所以不需要用 UMD / 全局变量把组件实例塞给另一个窗口 ——
 * render 页自己 `import` 一遍包和组件即可，它拿到的是同一份源码的另一个模块实例，
 * 产出的 DOM 与编辑器里逐字节相同。
 *
 * 唯一不共享的是组件的内部 state，而预览本来就该是干净环境：你在编辑器里
 * 给 Button 点出的 hover、给输入框敲进去的字，不该被带进预览。
 *
 * **为什么用 localStorage 而不是 sessionStorage**
 *
 * - `storage` 事件只在**其他**文档触发，天然是「编辑器写、预览页收」的单向广播。
 *   不用 postMessage，也不用持有窗口引用 —— 所以 `window.open` 可以加 `noopener`，
 *   预览页不反向持有编辑器。
 * - 编辑器每提交一次就写一遍，预览页原地跟着变，不必回编辑器重开一次。
 * - 预览页刷新后还在。
 */

export const PREVIEW_KEY = 'lowcode-next:preview-schema';

/** 两个入口名，与各自的 HTML 文件同名（`preview.html` / `render.html`） */
export type PreviewEntry = 'preview' | 'render';

/**
 * 入口地址 = 同目录下的 `<entry>`。
 *
 * 用 URL 相对解析而不是拼 `location.pathname + '?preview=1'`：前者在
 * 「部署到子路径」「编辑器地址带 ?page=sample」两种情况下都算得对，
 * 也不会出现 `index.html/preview` 这种错拼。
 */
export function entryUrl(
  entry: PreviewEntry,
  href: string = globalThis.location.href,
): string {
  return new URL(entry, href).toString();
}

/**
 * 写快照。返回是否写成功 —— 存储被禁用（隐私模式、配额满）时不静默失败，
 * 由调用方决定是否还要开窗口。
 */
export function writePreview(schema: unknown): boolean {
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(schema));
    return true;
  } catch {
    return false;
  }
}

/**
 * 读快照。过一遍 `parsePageSchema`：坏数据（旧版本结构、被手工改过）
 * 当作没有，让调用方回退到自己的默认页，而不是在渲染到一半时炸。
 */
export function readPreview(): PageSchema | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parsePageSchema(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * 订阅别的文档写入的快照，返回退订函数（直接给 `useEffect` 的清理用）。
 *
 * 只处理结构合法的快照：一次写到一半的 JSON 不该让预览页白屏。
 */
export function subscribePreview(onChange: (schema: PageSchema) => void): () => void {
  const handler = (event: StorageEvent): void => {
    if (event.key !== PREVIEW_KEY || !event.newValue) return;
    try {
      onChange(parsePageSchema(JSON.parse(event.newValue)));
    } catch {
      // 忽略这一条，等下一次写入
    }
  };
  globalThis.addEventListener('storage', handler);
  return () => globalThis.removeEventListener('storage', handler);
}

/**
 * 存 schema 并开窗口。
 *
 * 存失败就不开 —— 否则用户看到的是一句「预览数据不存在」，
 * 比什么都不发生更难理解。
 */
export function openPreview(
  schema: unknown,
  url: string = entryUrl('preview'),
): void {
  if (!writePreview(schema)) return;
  globalThis.open(url, '_blank', 'noopener');
}
