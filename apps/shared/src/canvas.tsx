import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { builtinMaterials, createMaterialRegistry, createReactDriver, evaluate } from '@lowcode-next/renderer';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import './canvas.css';

/**
 * 画布渲染入口（DESIGN-v1 §7.3，被宿主 Designer 以同源 iframe 装载）。
 *
 * 职责只有两件事：
 * 1. **渲染**：收 postMessage 推来的 schema，用编辑态 driver（带空容器占位、
 *    `data-node-id`）整树重渲染 —— 与宿主的 D14 同粒度；
 * 2. **隔离**：样式、滚动、@media、原生拖拽全部关在这份文档里，
 *    物料 CSS 污染不了编辑器，编辑器皮肤也污染不了物料。
 *
 * 同源 frame，所以宿主可以直接查这里的 DOM（选中框、拖拽命中都不需要
 * RPC）；跨 frame 的事件桥接在 Designer 的桥接 effect 与 DragManager 里。
 */

const EDITOR_ORIGIN = globalThis.location.origin;

function CanvasApp() {
  const [registry] = useState(() => createMaterialRegistry(builtinMaterials));
  const [state, setState] = useState<{ schema: PageSchema; padding: number } | null>(null);

  // schema 通道：宿主在每次文档变化后全量推一条（D14 整树重渲染，消息天然全量）
  useEffect(() => {
    let got = false;
    // 宿主 tsconfig 带 Node types 时 setInterval 返回 Timeout 而不是 number，
    // 用 ReturnType 取当前环境的真实类型
    let timer: ReturnType<typeof setInterval> | null = null;
    let tries = 0;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== EDITOR_ORIGIN) return;
      const data = event.data as { type?: string; schema?: unknown; padding?: number } | null;
      if (!data || data.type !== 'lc:schema') return;
      got = true;
      if (timer !== null) {
        globalThis.clearInterval(timer);
        timer = null;
      }
      try {
        const schema = parsePageSchema(data.schema);
        setState({ schema, padding: Number(data.padding) || 0 });
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
     * 每 150ms 补发一次，拿到第一份 schema 就停；最多 20 次（3 秒），
     * 预览页这类没有宿主的场景不会一直发。
     */
    const announce = () => {
      if (got || tries >= 20) return;
      tries += 1;
      window.parent.postMessage({ type: 'lc:canvas-ready' }, EDITOR_ORIGIN);
    };
    announce();
    timer = globalThis.setInterval(announce, 150);

    return () => {
      if (timer) globalThis.clearInterval(timer);
      globalThis.removeEventListener('message', onMessage);
    };
  }, []);

  // 编辑态语义：画布内的一切原生拖拽归拖拽引擎；链接点击不导航
  // （引擎 builtin-simulator/utils/clickable.ts 的同一件事）
  useEffect(() => {
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
  }, []);

  const driver = useMemo(() => createReactDriver(registry, { editorPlaceholder: true }), [registry]);

  const content = useMemo(() => {
    if (!state) return null;
    const ir = evaluate(state.schema.componentsTree, { mode: 'edit', scope: {}, resolver: registry });
    return driver.renderRoot(ir);
  }, [state, registry, driver]);

  return (
    <div data-lc-canvas style={{ padding: state?.padding ?? 0 }}>
      {content}
    </div>
  );
}

createRoot(document.getElementById('canvas-root')!).render(<CanvasApp />);
