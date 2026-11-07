import { memo, useEffect, useMemo, useReducer } from 'react';
import type { DocumentImpl } from '@lowcode-next/model';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import type { ReactBindings } from '@lowcode-next/materials-react';
import { createReactDriver, evaluate } from '@lowcode-next/renderer';
import type { RenderMode } from '@lowcode-next/renderer';

/**
 * 画布内容（§12.14）。
 *
 * 与旧方案的区别只有一句：**它渲染在编辑器的同一棵 React tree 里**，
 * 只是 DOM 落在 iframe 的 document 上（由 `Designer` 的 portal 完成）。
 * 于是用户组件的 Context、样式、模块单例全部直接可用 —— 没有跨文档副本。
 *
 * 仍然是整树全量重渲染（D14）：文档一变就重算 IR，没有细粒度 diff。
 */

export interface CanvasSurfaceProps {
  document: DocumentImpl;
  registry: MaterialMetaRegistry;
  bindings: ReactBindings;
  /** 画布内边距，由 Designer 传入（与设备档位无关） */
  padding: number;
  mode: RenderMode;
}

export const CanvasSurface = memo(function CanvasSurface({
  document,
  registry,
  bindings,
  padding,
  mode,
}: CanvasSurfaceProps) {
  useDocumentVersion(document);

  const driver = useMemo(
    () =>
      createReactDriver(
        {
          resolve: (componentName) => bindings[componentName] ?? null,
          getMeta: (componentName) => registry.getMeta(componentName),
        },
        { mode, editorPlaceholder: mode === 'edit' },
      ),
    [bindings, registry, mode],
  );

  // 每次重渲染都重算：重渲染只由文档变化或宿主换配置引发，没有额外抖动的来源
  const ir = evaluate(document.toSchema().componentsTree, {
    mode,
    scope: {},
    resolver: registry,
  });

  return (
    <div data-lc-canvas style={{ padding }}>
      {driver.renderRoot(ir)}
    </div>
  );
});

/**
 * 订阅文档变化并强制重渲染。
 *
 * 外层 `memo` 让 CanvasSurface 不受 Designer 重渲染波及（props 引用稳定），
 * 所以刷新必须由它自己驱动 —— 否则拖一个组件进去，面板更新了、画布不动。
 */
function useDocumentVersion(doc: DocumentImpl): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => doc.subscribe(bump), [doc]);
}
