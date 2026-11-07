import { memo, useEffect, useReducer } from 'react';
import type { DocumentImpl } from '@lowcode-next/model';
import type { AssembledMaterials, RenderMode } from '@lowcode-next/render-react';
import { renderTree } from '@lowcode-next/render-react';

/**
 * 编辑态画布（§12.14）。
 *
 * 它只是把 render 态的内核（`renderTree`）套进编辑器的需要里：
 * **额外订阅文档变化**，然后带上 `mode: 'edit'`（注入空容器占位、错误块更显眼）。
 * 渲染本身一行没变 —— 这正是两个形态共用内核的意义，
 * 「预览所见 = 线上所得」是结构保证的。
 *
 * DOM 落在 iframe 的 document 上（由 `Designer` 的 portal 完成），但内容属于
 * 编辑器这棵 React tree —— 用户组件的 Context、样式、模块单例全部直接可用。
 *
 * 仍然是整树全量重渲染（D14）：文档一变就重算 IR，没有细粒度 diff。
 */

export interface CanvasSurfaceProps {
  document: DocumentImpl;
  /** 装配结果（注册表 + 组件表），由 `createEditor` 传下来 */
  materials: AssembledMaterials;
  /** 画布内边距，由 Designer 传入（与设备档位无关） */
  padding: number;
  mode: RenderMode;
}

export const CanvasSurface = memo(function CanvasSurface({
  document,
  materials,
  padding,
  mode,
}: CanvasSurfaceProps) {
  useDocumentVersion(document);

  const schema = document.toSchema();

  return (
    <div data-lc-canvas style={{ padding }}>
      {renderTree(schema.componentsTree, {
        registry: materials.registry,
        bindings: materials.bindings,
        mode,
      })}
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
