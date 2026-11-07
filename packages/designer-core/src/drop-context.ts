import { containsPoint, locate } from '@lowcode-next/drag';
import type { DropContext, DropTarget, DragPayload, Point, Rect, RectCache } from '@lowcode-next/drag';
import type { DocumentImpl, Node as DocNode, NodeImpl } from '@lowcode-next/model';
import type { MaterialLookup } from './materials';
import { nodeAt } from './dom';

/**
 * designer 侧的落点规则（DESIGN-v1 §7.2）。
 *
 * 拖拽引擎只做几何，"能不能放、要不要下钻、是否自嵌套"全部收在这里（D12）。
 */
export interface DropContextDeps {
  /** 画布根元素，命中测试不越过它 */
  root: () => HTMLElement | null;
  document: DocumentImpl;
  registry: MaterialLookup;
  rects: RectCache;
}

export function createDesignerDropContext(deps: DropContextDeps): DropContext {
  const context: DropContext = {
    resolve(point: Point, payload: DragPayload): DropTarget | null {
      const root = deps.root();
      if (!root) return null;

      // 画布在 iframe 里之后，指针事件也可能来自宿主文档（拖出 frame 边界）——
      // 那边的坐标是宿主视口坐标系，数值上可能落进画布那份高大的矩形里，
      // 造成"明明拖到画布外面、松手却把节点挪到页面根"的误命中。
      // 画布文档的视口范围之外不可能是合法落点（画布内的矩形全是它的视口坐标）。
      const view = root.ownerDocument.defaultView;
      if (view && view !== globalThis.window) {
        if (point.x < 0 || point.y < 0 || point.x > view.innerWidth || point.y > view.innerHeight) {
          return null;
        }
      }

      const { document: doc } = deps;

      // 落在画布之外 → 取消（§10 验收：拖到画布外松手无副作用）
      if (!containsPoint(root.getBoundingClientRect(), point)) return null;

      const draggedIds = payload.type === 'node' ? payload.ids : [];
      const draggedNodes = draggedIds
        .map((id) => doc.getNode(id))
        .filter((node): node is NodeImpl => Boolean(node));

      // 指针还停在被拖节点自己的矩形里 → 还没真正离开原位，不画任何提示。
      // 否则起拖的第一帧就会是一个"禁止拖到自身"的红框，纯粹在误导用户。
      const sourceId = draggedIds[0];
      if (draggedIds.length === 1 && sourceId) {
        const sourceRect = deps.rects.get(sourceId);
        if (sourceRect && containsPoint(sourceRect, point)) return null;
      }

      // 画布空白处不命中任何节点时，退化到画布根容器，
      // 否则用户把物料拖到空白区域会毫无反应
      const hit = nodeAt(point, root);
      const hitNode = hit ? doc.getNode(hit.id) : doc.root;
      if (!hitNode) return null;

      // 指针落在被拖节点自己的子树里 → 禁止，但仍然返回一个 invalid 目标，
      // 让 Overlay 能给出红色反馈（§6.5：不合法也要显示，提升可预期性）
      const intoSelf = draggedNodes.some((node) => node.contains(hitNode));

      // 从命中节点向上找第一个可接受的容器
      let container: NodeImpl | null = hitNode;
      while (container && !isUsableContainer(container, payload, context)) {
        container = container.parent;
      }
      if (!container) return null;

      const containerRect = deps.rects.get(container.id);
      if (!containerRect) return null;

      // slots 是"移除被拖节点之后"的完整子节点列表，命令侧先 remove 再
      // insert(index)，index 必须以它为准。
      const slots = container.children.filter((child) => !draggedIds.includes(child.id));

      // 量不到矩形的子节点（portal 物料、未挂载节点）不能直接丢弃，
      // 否则 measurable 的下标会和 slots 错位，落点就整体偏移一格
      const measurable = slots
        .map((node) => ({ node, rect: deps.rects.get(node.id) }))
        .filter((slot): slot is { node: NodeImpl; rect: Rect } => Boolean(slot.rect));

      const located = locate({
        point,
        container: containerRect,
        children: measurable.map((slot) => slot.rect),
        axis: resolveAxis(root, container, measurable[0]?.node ?? null),
      });

      const index = toSlotIndex(slots, measurable, located.index);

      const valid = !intoSelf && context.canAccept(payload, container.id);

      return {
        containerId: container.id,
        index,
        position: located.position,
        rect: located.rect,
        axis: located.axis,
        valid,
        reason: intoSelf
          ? '不能把节点拖进自己的子树'
          : valid
            ? undefined
            : '该容器不接受此节点',
        point,
      };
    },

    canAccept(payload: DragPayload, containerId: string): boolean {
      const { document: doc } = deps;
      const container = doc.getNode(containerId);
      if (!container || !container.isContainer() || container.locked) return false;

      if (payload.type === 'material') {
        if (!deps.registry.has(payload.componentName)) return false;
        const rule = container.meta?.configure.component.nestingRule;
        return !rule?.childWhitelist || rule.childWhitelist.includes(payload.componentName);
      }

      if (payload.ids.includes(containerId)) return false;

      const dragged = doc.getNode(payload.ids[0] ?? '');
      if (dragged?.contains(container)) return false;

      const rule = container.meta?.configure.component.nestingRule;
      if (rule?.childWhitelist && dragged) {
        return rule.childWhitelist.includes(dragged.componentName);
      }

      return true;
    },
  };

  return context;
}

function isUsableContainer(
  node: NodeImpl,
  payload: DragPayload,
  context: DropContext,
): boolean {
  if (!node.isContainer() || node.locked) return false;
  if (payload.type === 'node' && payload.ids.includes(node.id)) return false;
  return context.canAccept(payload, node.id);
}

/**
 * 主轴（横排 / 竖排）判定 —— 照引擎 `builtin-simulator/host.ts` 的
 * `isRowContainer` + `isChildInline`：
 *
 * - 容器 `display: flex` 且方向为 row / row-reverse，或 `display: grid` → 横向；
 * - 子节点本身是 inline 级（inline-block / inline-flex…）或 float → 横向。
 *
 * **为什么不能只靠矩形推断**：`inferAxis` 要求所有相邻子节点垂直方向重叠过半，
 * 网格（两行三列）里第 2、3 个之间的同行、3、4 之间跨行，条件立刻不成立，
 * 于是整片卡片区域只能上下插 —— 这就是"拖不到元素左右侧"的根因。
 * 引擎也是看 CSS 的：grid 一律按行容器处理。
 */
function resolveAxis(
  root: HTMLElement,
  container: NodeImpl,
  sample: DocNode | null,
): 'x' | 'y' {
  const containerEl = elementOf(root, container.id);
  const childEl = sample ? elementOf(root, sample.id) : null;

  // 子节点的父元素才是真正的排布层（有的物料在根和子节点之间还有一层 wrapper）
  const layoutEl = childEl?.parentElement ?? containerEl;
  if (layoutEl && isRowContainer(layoutEl)) return 'x';
  if (containerEl && isRowContainer(containerEl)) return 'x';
  if (childEl && isInlineLevel(childEl)) return 'x';
  return 'y';
}

function elementOf(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
}

function isRowContainer(el: Element): boolean {
  // 容器元素可能在 iframe 文档里，取它自己 realm 的 getComputedStyle
  const style = (el.ownerDocument.defaultView ?? globalThis.window).getComputedStyle(el);
  const { display } = style;
  if (/flex$/.test(display)) {
    const direction = style.flexDirection || 'row';
    return direction === 'row' || direction === 'row-reverse';
  }
  return /grid$/.test(display);
}

function isInlineLevel(el: Element): boolean {
  const style = (el.ownerDocument.defaultView ?? globalThis.window).getComputedStyle(el);
  return /^inline/.test(style.display) || /^(left|right)$/.test(style.float);
}

/** 收集容器子节点矩形，剔除正在拖拽的节点（保证 index 是"移除后"的语义） */
function toSlotIndex(
  slots: readonly DocNode[],
  measurable: ReadonlyArray<{ node: DocNode; rect: Rect }>,
  pseudoIndex: number,
): number {
  if (measurable.length === 0) return 0;

  const anchor = measurable[pseudoIndex];
  if (anchor) return slots.indexOf(anchor.node);

  // locate 返回的是"插到 measurable 末尾"，映射回 slots 的真实末尾
  const last = measurable[measurable.length - 1]!;
  return slots.indexOf(last.node) + 1;
}
