import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createReactDriver, evaluate } from '@lowcode-next/renderer';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import '@lowcode-next/materials/styles.css';
import { createReactEditorMaterials } from './materials';
import { connectCanvasChannel, lockCanvasInteractions } from '@pg/canvas-channel';
import '@pg/canvas.css';

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
  const [materials] = useState(() => createReactEditorMaterials());
  const [state, setState] = useState<{ schema: PageSchema; padding: number } | null>(null);

  // 消息通道与编辑态交互锁：逻辑在 canvas-channel.ts，React / Vue 两版画布共用
  useEffect(
    () => connectCanvasChannel({ onSchema: (schema, padding) => setState({ schema, padding }) }),
    [],
  );
  useEffect(() => lockCanvasInteractions(), []);

  const driver = useMemo(
    () => createReactDriver(materials.renderer, { editorPlaceholder: true }),
    [materials],
  );

  const content = useMemo(() => {
    if (!state) return null;
    const ir = evaluate(state.schema.componentsTree, {
      mode: 'edit',
      scope: {},
      resolver: materials.registry,
    });
    return driver.renderRoot(ir);
  }, [state, materials, driver]);

  return (
    <div data-lc-canvas style={{ padding: state?.padding ?? 0 }}>
      {content}
    </div>
  );
}

createRoot(document.getElementById('canvas-root')!).render(<CanvasApp />);
