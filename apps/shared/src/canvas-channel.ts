import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';

/**
 * 画布与宿主之间的消息通道（DESIGN-v1 §7.3）。
 *
 * 这段逻辑以前内嵌在 `canvas.tsx` 的 `useEffect` 里。Vue 版画布出现后必须共用 ——
 * 「ready 重发几次」「收到非法 schema 怎么办」这类细节各写一遍，两边行为就会
 * 慢慢分叉，而这类问题只在「打开编辑器画布一片空白」时才暴露，极难定位。
 *
 * 框架无关：用回调而不是 hook，React 在 `useEffect` 里调、Vue 在 `onMounted` 里调。
 */
const CANVAS_READY = 'lc:canvas-ready';
const SCHEMA_MESSAGE = 'lc:schema';

/** ready 的最多补发次数 × 间隔 —— 3 秒内宿主没接管就放弃 */
const ANNOUNCE_INTERVAL = 150;
const ANNOUNCE_LIMIT = 20;

export interface CanvasChannelHandlers {
  onSchema: (schema: PageSchema, padding: number) => void;
}

/**
 * 绑定消息通道，返回解绑函数。
 *
 * schema 通道：宿主在每次文档变化后全量推一条（D14 整树重渲染，消息天然全量）。
 */
export function connectCanvasChannel({ onSchema }: CanvasChannelHandlers): () => void {
  const origin = globalThis.location.origin;
  let got = false;
  // 宿主 tsconfig 带 Node types 时 setInterval 返回 Timeout 而不是 number，
  // 用 ReturnType 取当前环境的真实类型
  let timer: ReturnType<typeof setInterval> | null = null;
  let tries = 0;

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin) return;
    const data = event.data as { type?: string; schema?: unknown; padding?: number } | null;
    if (!data || data.type !== SCHEMA_MESSAGE) return;
    got = true;
    if (timer !== null) {
      globalThis.clearInterval(timer);
      timer = null;
    }
    try {
      onSchema(parsePageSchema(data.schema), Number(data.padding) || 0);
    } catch {
      /* schema 非法：保留上一帧渲染，别把画布打成白屏 */
    }
  };
  globalThis.addEventListener('message', onMessage);

  /**
   * 通知宿主"渲染管线就绪"（宿主据此推首份 schema）。
   *
   * **必须重发**：这份 iframe 的模块往往比宿主应用小，先加载完、先发 ready，
   * 而宿主的 `DesignerSession.start()` 还排在父应用的首屏 effect 里 —— 单发一次
   * 就赌"宿主已经在听"，输了就是"打开编辑器画布一片空白，点一下才出来"。
   */
  const announce = () => {
    if (got || tries >= ANNOUNCE_LIMIT) return;
    tries += 1;
    globalThis.window.parent.postMessage({ type: CANVAS_READY }, origin);
  };
  announce();
  timer = globalThis.setInterval(announce, ANNOUNCE_INTERVAL);

  return () => {
    if (timer !== null) globalThis.clearInterval(timer);
    globalThis.removeEventListener('message', onMessage);
  };
}

/**
 * 编辑态语义：画布内的一切原生拖拽归拖拽引擎；链接点击不导航。
 *
 * （引擎 `builtin-simulator/utils/clickable.ts` 的同一件事）
 * 返回解绑函数。
 */
export function lockCanvasInteractions(): () => void {
  const onDragStart = (event: DragEvent) => {
    event.preventDefault();
  };
  const onClick = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('a[href]')) {
      event.preventDefault();
    }
  };

  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('click', onClick, true);

  return () => {
    document.removeEventListener('dragstart', onDragStart);
    document.removeEventListener('click', onClick, true);
  };
}
