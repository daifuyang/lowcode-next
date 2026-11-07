import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { MoveNode, RemoveNode, SetFlag, SetTitle } from '@lowcode-next/model';
import type { Command, DocumentImpl, NodeImpl } from '@lowcode-next/model';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Pencil,
  Search,
  Trash,
  X,
} from 'lucide-react';
import { MatIcon } from './icons';
import { PaneHeader } from './PaneHeader';
import {
  collapsedByDefault,
  flattenVisible,
  INDENT,
  keepPaths,
  nodeLabel,
  nodeText,
  rowBox,
  stepRow,
} from '@lowcode-next/designer-core';
import styles from '@lowcode-next/designer-ui/TreePanel.module.css';

export interface TreePanelProps {
  document: DocumentImpl;
  /** 双击定位到画布 */
  onLocate?: (nodeId: string) => void;
  /** 显隐 / 锁定快捷开关走宿主的提交通道（进历史） */
  onCommit?: (command: Command) => void;
  /** 页头的窗口动作，由宿主（Designer）提供状态 */
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
}

/**
 * 拖拽落点（对齐引擎 `plugin-outline-pane` 的 `Location`）：
 * - `before` / `after`：插到某个兄弟节点的前 / 后（行上半 → before，下半 → after）；
 * - `inside-end`：追加到某个**已展开容器**的子节点末尾（引擎 `drillLocate` 落到
 *   容器 children 末位的那条分支）。
 *
 * `index` 已经换算成"**移除被拖节点之后**该容器内的插入下标" —— `MoveNode`
 * 是先 remove 再 insert，命令侧的 index 必须以移除后的列表为准。
 */
export interface TreeDrop {
  kind: 'before' | 'after' | 'inside-end';
  /** 插入线挂在哪个行上：before 在该行前，after 在该行整棵子树之后，inside-end 在该行子列表末尾 */
  nodeId: string;
  containerId: string;
  index: number;
  valid: boolean;
}

/** 起拖阈值：小于它算点击（和画布拖拽同一个口径） */
const DRAG_THRESHOLD = 4;
/** 未展开容器的悬停展开延时（引擎 `DwellTimer` 的默认节奏） */
const DWELL_DELAY = 500;

/**
 * 大纲树（标准树组件形态）。
 *
 * 交互对齐 lowcode 的 `plugin-outline-pane`：
 * - 单击选中；**双击展开 / 收起该节点的整棵子树**（`expandAllDecendants /
 *   collapseAllDecendants`）；Enter 定位到画布（本项目多给的一个入口）。
 * - 行尾 hover 出四个动作：隐藏、锁定、重命名、删除（引擎同款顺序，
 *   `tree-title.tsx` 的 HideBtn / LockBtn / RenameBtn / DeleteBtn）。
 * - 重命名是内联输入：Enter 保存、Esc 取消、失焦保存（`saveEdit`），F2 也能进。
 * - 编辑态下动作按钮整组隐藏，避免点歪。
 *
 * 视觉上刻意避开「手风琴」的观感 —— 那套是：每行 30px + 通宽分隔线 +
 * 右侧常驻描述，展开后像一块块折叠面板。树该有的样子是：
 *
 * 1. **没有横向分隔线**：行与行之间只靠 hover / 选中的底色区分，
 *    26px 行高更紧凑，层级不会被切成一格一格。
 * 2. **竖向参考线常驻**：每层一根 1px 细线，位置固定在 `GUIDE_X`（6px），
 *    静态也能一眼看出"谁是谁的孩子"；鼠标进入后再略微加深。
 * 3. **选中是品牌色块**：`rgba(0,108,255,.08)` 底 + 品牌色文字，
 *    表达的是"当前节点"，不是"展开的那一节"。
 * 4. **行宽横贯面板**：`padding-left / margin-left` 成对给出（见 tree-layout.ts），
 *    所以底色是整行宽的，深处的行也不会越缩越窄。
 * 5. **节点类型摘要只在 hover / 选中时出现**：它是补信息，不是副标题，
 *    常驻会让每一行都变成"列表项"。
 * 6. **行内动作常驻但透明**：22px 见方，行 hover 时 0.5、按钮自己 hover 时 1，
 *    已隐藏 / 已锁定的那个常亮 0.8，这样 hover 不会引起文字跳动。
 *
 * 展开状态是纯 UI 状态，不进文档、不进历史；重命名 / 删除进文档，可撤销。
 */
export function TreePanel({
  document: doc,
  onLocate,
  onCommit,
  pinned,
  onTogglePin,
  onClose,
}: TreePanelProps) {
  // 默认**只摊开第一层**：容器节点一律收起，根节点保持展开 —— 否则一进页面
  // 就是几十行全铺开，找东西反而要先滚。等价于点一次"全部收起"，见 §7.7。
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
    collapsedByDefault(doc.root),
  );
  const [keyword, setKeyword] = useState('');

  // 换文档（切页面 / 重新加载 schema）时回到默认折叠态。
  // 同一次会话里不动 —— 否则编辑一次就把用户手动展开的层级全收了。
  const docRef = useRef(doc);
  useEffect(() => {
    if (docRef.current === doc) return;
    docRef.current = doc;
    setCollapsed(collapsedByDefault(doc.root));
  }, [doc]);
  /** 正在重命名的节点（一次只能一个，与引擎的局部 editing state 等价） */
  const [editingId, setEditingId] = useState<string | null>(null);
  const selectedId = doc.selection.selectedId;
  const hoverId = doc.selection.hoverId;

  const query = keyword.trim().toLowerCase();

  // 搜索命中的节点 + 它们的祖先。为 null 表示没在搜索（不做裁剪）。
  const keep = useMemo(() => {
    if (!query) return null;
    return keepPaths(doc.root, (id) => {
      const node = doc.getNode(id);
      if (!node) return false;
      const haystack = `${nodeLabel(node)} ${node.componentName} ${nodeText(node)}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [doc, query]);

  const filtering = keep !== null;
  const noMatch = filtering && keep.size === 0;

  /* ------------------------------------------------------------------ */
  /* 拖拽排序                                                            */
  /* ------------------------------------------------------------------ */

  const treeRef = useRef<HTMLDivElement>(null);
  /** 已按下、还没越过起拖阈值的行 */
  const pendingRef = useRef<{ id: string; x: number; y: number } | null>(null);
  /** 真的进入拖拽之后的被拖节点 id（ref：pointermove 里要同步读，不等重渲染） */
  const dragIdRef = useRef<string | null>(null);
  const dropRef = useRef<TreeDrop | null>(null);
  // setTimeout 的返回值：宿主 tsconfig 带 Node types 时是 Timeout 而不是 number，
  // 用 ReturnType 取当前环境的真实类型
  const dwellRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<TreeDrop | null>(null);

  /**
   * 落点判定（复刻引擎 `pane-controller` 的 `getNear` / `drillLocate`）：
   *
   * - 指针在行标题**上半** → 插到该行之前（同父级，`anchor.index`）；
   * - 指针在行标题**下半**：
   *   - 该节点是容器且**已展开** → 落到它子列表的**末尾**（引擎 drillLocate 的
   *     容器末位分支，语义是"成为它的最后一个孩子"，不是"插到它后面"）；
   *   - 否则 → 插到该行之后（`anchor.index + 1`）。
   *
   * 拖到自己的子树里是非法落点（引擎 `checkRecursion`）：照样给插入线，但标红。
   */
  const resolveDrop = useCallback(
    (draggingId: string, x: number, y: number): TreeDrop | null => {
      const tree = treeRef.current;
      if (!tree) return null;

      const under = globalThis.document.elementFromPoint(x, y);
      const rowEl = under instanceof Element ? under.closest<HTMLElement>('[data-tree-id]') : null;
      if (!rowEl || !tree.contains(rowEl)) return null;

      const rowId = rowEl.dataset.treeId;
      const dragged = doc.getNode(draggingId);
      const anchor = rowId ? doc.getNode(rowId) : null;
      if (!dragged || !anchor || rowId === draggingId) return null;

      const parent = anchor.parent;
      const parentId = parent?.id ?? doc.root.id;
      const rect = rowEl.getBoundingClientRect();
      const upperHalf = y < rect.top + rect.height / 2;
      const intoContainer = !upperHalf && anchor.isContainer() && (filtering || !collapsed.has(anchor.id));

      if (dragged.contains(anchor)) {
        return { kind: 'before', nodeId: anchor.id, containerId: parentId, index: 0, valid: false };
      }

      const kind: TreeDrop['kind'] = upperHalf ? 'before' : intoContainer ? 'inside-end' : 'after';
      const containerId = intoContainer ? anchor.id : parentId;
      let index = upperHalf
        ? parent
          ? anchor.index()
          : 0
        : intoContainer
          ? anchor.children.length
          : parent
            ? anchor.index() + 1
            : anchor.children.length;

      // MoveNode 是"先 remove 再 insert"：同容器内往后挪时插入下标要扣掉被移走的那一格；
      // 扣完还和原位相同就是"没动"，不画线也不提交（引擎靠 `pos === 'unchanged'` 做同一件事）。
      if (dragged.parent?.id === containerId) {
        const from = dragged.index();
        if (from >= 0 && from < index) index -= 1;
        if (from === index) return null;
      }

      return { kind, nodeId: anchor.id, containerId, index, valid: true };
    },
    [doc, collapsed, filtering],
  );

  const clearDwell = () => {
    if (!dwellRef.current) return;
    globalThis.clearTimeout(dwellRef.current.timer);
    dwellRef.current = null;
  };

  /** 停在未展开的容器行上会自动摊开它（引擎 `DwellTimer`）—— 否则想拖进去得先松手去点箭头 */
  const scheduleDwell = (id: string) => {
    if (dwellRef.current?.id === id) return;
    clearDwell();
    const timer = globalThis.setTimeout(() => {
      dwellRef.current = null;
      setCollapsed((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, DWELL_DELAY);
    dwellRef.current = { id, timer };
  };

  /** 拖到树的上 / 下边缘时滚一滚，长树里也能把节点挪到视野外的位置 */
  const autoScroll = (y: number) => {
    const tree = treeRef.current;
    if (!tree) return;
    const rect = tree.getBoundingClientRect();
    if (y < rect.top + 24) tree.scrollTop -= 14;
    else if (y > rect.bottom - 24) tree.scrollTop += 14;
  };

  useEffect(() => {
    /** 收起拖拽态；`commit` 为真且落点合法时提交 MoveNode */
    const finish = (commit: boolean) => {
      const id = dragIdRef.current;
      const spot = dropRef.current;
      pendingRef.current = null;
      dragIdRef.current = null;
      dropRef.current = null;
      clearDwell();
      if (!id) return;
      if (commit && spot?.valid) {
        onCommit?.(new MoveNode(id, { containerId: spot.containerId, index: spot.index }));
        doc.selection.select(id);
      }
      setDragId(null);
      setDrop(null);
    };

    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      if (!dragIdRef.current) {
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD) return;
        dragIdRef.current = pending.id;
        setDragId(pending.id);
        // 被拖节点先选中：框跟着它走，松手后选中的就是它
        doc.selection.select(pending.id);
      }

      autoScroll(event.clientY);

      const next = resolveDrop(pending.id, event.clientX, event.clientY);
      const prev = dropRef.current;
      const unchanged =
        prev &&
        next &&
        prev.kind === next.kind &&
        prev.nodeId === next.nodeId &&
        prev.containerId === next.containerId &&
        prev.index === next.index &&
        prev.valid === next.valid;
      if (!unchanged) {
        dropRef.current = next;
        setDrop(next);
      }

      // 悬停展开：只对"未展开、有孩子、且不是被拖节点自己"的容器行生效
      const anchorId = next?.nodeId;
      const anchor = anchorId ? doc.getNode(anchorId) : null;
      const dragged = doc.getNode(pending.id);
      if (
        anchor &&
        dragged &&
        anchor.isContainer() &&
        anchor.children.length > 0 &&
        collapsed.has(anchor.id) &&
        !filtering &&
        !anchor.contains(dragged)
      ) {
        scheduleDwell(anchor.id);
      } else {
        clearDwell();
      }
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragIdRef.current) finish(false);
    };

    globalThis.document.addEventListener('pointermove', onMove);
    globalThis.document.addEventListener('pointerup', onUp);
    globalThis.document.addEventListener('pointercancel', onCancel);
    globalThis.window.addEventListener('blur', onCancel);
    globalThis.document.addEventListener('keydown', onKey);
    return () => {
      globalThis.document.removeEventListener('pointermove', onMove);
      globalThis.document.removeEventListener('pointerup', onUp);
      globalThis.document.removeEventListener('pointercancel', onCancel);
      globalThis.window.removeEventListener('blur', onCancel);
      globalThis.document.removeEventListener('keydown', onKey);
    };
  }, [doc, resolveDrop, onCommit, filtering, collapsed]);

  // 选中变化时把祖先全部展开，否则从画布选中的节点在树里是隐藏的
  useEffect(() => {
    if (!selectedId) return;
    const node = doc.getNode(selectedId);
    if (!node) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let current = node.parent;
      while (current) {
        next.delete(current.id);
        current = current.parent;
      }
      return next;
    });
  }, [selectedId, doc]);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expand = (id: string) =>
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const collapse = (id: string) =>
    setCollapsed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  /** 双击的语义照引擎：展 / 收**整棵子树**，而不是只切一层 */
  const toggleDeep = (node: NodeImpl) => {
    // 搜索态整棵树是强制展开的，折叠会让人以为搜漏了
    if (filtering) return;
    const expanded = !collapsed.has(node.id);
    setCollapsed((prev) => {
      const next = new Set(prev);
      const descendants: string[] = [];
      const walk = (current: NodeImpl) => {
        for (const child of current.children) {
          const childNode = child as NodeImpl;
          descendants.push(childNode.id);
          walk(childNode);
        }
      };
      walk(node);
      const ids = [node.id, ...descendants];
      for (const id of ids) {
        if (expanded) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  /** 根节点没有"自己的名字"可改（行标题恒为"页面"），从根上就不给入口 */
  const startRename = (id: string) => {
    const node = doc.getNode(id);
    if (!node || !node.parent) return;
    setEditingId(id);
  };

  /** `value === null` 是取消；空串是"恢复默认标题"，大纲回落到物料 meta.title */
  const finishRename = (id: string, value: string | null) => {
    setEditingId(null);
    if (value === null) return;
    const node = doc.getNode(id);
    if (!node) return;
    const next = value.trim();
    if (next === (node.schema.title ?? '')) return; // 没改就不占一条历史
    onCommit?.(new SetTitle(id, next || undefined));
  };

  const removeNode = (id: string) => {
    const node = doc.getNode(id);
    if (!node || !node.parent) return;
    const parentId = node.parent.id;
    // 选区落在被删的子树里就回落到父级，否则撤销前后都会指着已经不在的节点
    const current = selectedId ? doc.getNode(selectedId) : null;
    const inside = current ? node.contains(current) : false;
    onCommit?.(new RemoveNode(id));
    if (inside) doc.selection.select(parentId);
  };

  /**
   * 标准树组件的键盘操作：↑↓ 在可见行之间移动，← 收起 / 回父级，
   * → 展开 / 进第一个孩子，Home / End 到首尾，Enter 定位到画布。
   * 行内的显隐、锁定按钮自己吃掉键盘事件，这里不抢。
   */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;

    const ids = flattenVisible(
      doc.root,
      (id) => !filtering && collapsed.has(id),
      keep ?? undefined,
    );
    const node = selectedId ? doc.getNode(selectedId) : null;
    const hasChildren = !!node && node.children.length > 0;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const next = stepRow(ids, selectedId, event.key === 'ArrowDown' ? 1 : -1);
        if (next) doc.selection.select(next);
        return;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        const next = ids[event.key === 'Home' ? 0 : ids.length - 1];
        if (next) doc.selection.select(next);
        return;
      }
      case 'ArrowRight': {
        if (!node) return;
        event.preventDefault();
        if (hasChildren && collapsed.has(node.id)) expand(node.id);
        else if (hasChildren) doc.selection.select(node.children[0]!.id);
        return;
      }
      case 'ArrowLeft': {
        if (!node) return;
        event.preventDefault();
        if (hasChildren && !collapsed.has(node.id)) collapse(node.id);
        else if (node.parent) doc.selection.select(node.parent.id);
        return;
      }
      case 'Enter': {
        if (!selectedId) return;
        event.preventDefault();
        onLocate?.(selectedId);
        return;
      }
      // 标准树组件的重命名键；引擎里没有，但既然重命名按钮有了，
      // 键盘用户也得有个入口
      case 'F2': {
        if (!selectedId) return;
        event.preventDefault();
        startRename(selectedId);
        return;
      }
      default:
        return;
    }
  };

  const allCollapsed = collapsed.size > 0;

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsed(new Set());
      return;
    }
    setCollapsed(collapsedByDefault(doc.root));
  };

  return (
    <div className={styles.root}>
      <PaneHeader
        title="页面结构"
        pinned={pinned}
        onTogglePin={onTogglePin}
        onClose={onClose}
        extra={
          /* 搜索态整棵树是展开的，这个按钮先收起来 */
          filtering ? null : (
            <button
              type="button"
              className={styles.toolBtn}
              title={allCollapsed ? '全部展开' : '全部收起'}
              aria-label={allCollapsed ? '全部展开' : '全部收起'}
              onClick={toggleAll}
            >
              {allCollapsed ? (
                <ChevronsDownUp size={14} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <ChevronsUpDown size={14} strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>
          )
        }
      />
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Search size={13} strokeWidth={2} aria-hidden="true" />
        </span>
        <input
          className={styles.search}
          value={keyword}
          placeholder="搜索节点"
          spellCheck={false}
          aria-label="搜索节点"
          // 方向键属于输入框，不能让它冒到树上去切选中
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {keyword ? (
          <button
            type="button"
            className={styles.searchClear}
            title="清空"
            aria-label="清空搜索"
            onClick={() => setKeyword('')}
          >
            <X size={10} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {noMatch ? (
        <p className={styles.empty}>
          没有匹配的节点
          <span className={styles.emptyHint}>试试组件名，或点 × 清空</span>
        </p>
      ) : (
        <div
          ref={treeRef}
          className={styles.tree}
          role="tree"
          aria-label="节点大纲"
          tabIndex={0}
          data-dragging={dragId ? 'true' : undefined}
          onKeyDown={handleKeyDown}
        >
          {/* 定宽层：宽度取整棵树最宽的那行，于是横向滚动时每一行都同宽，
              底色能一直铺到最右侧（否则滚过去只剩长名字那一行，其余全空） */}
          <div className={styles.treeInner} role="presentation">
            <TreeNode
              node={doc.root}
              depth={0}
              collapsed={collapsed}
              filtering={filtering}
              keep={keep}
              query={query}
              selectedId={selectedId}
              hoverId={hoverId}
              editingId={editingId}
              dragId={dragId}
              drop={drop}
              actions={{
                onToggle: toggle,
                onToggleDeep: toggleDeep,
                onSelect: (id) => doc.selection.select(id),
                onHover: (id) => doc.selection.hover(id),
                onStartRename: startRename,
                onFinishRename: finishRename,
                onRemove: removeNode,
                onRowPointerDown: (event, id) => {
                  // 只有左键、非搜索态、非根节点、未锁定的行能起拖
                  if (event.button !== 0 || filtering) return;
                  const node = doc.getNode(id);
                  if (!node || !node.parent || node.locked) return;
                  // 行内的箭头 / 动作按钮 / 重命名输入框有自己的交互
                  const target = event.target as HTMLElement;
                  if (target.closest('button') || target.closest('input')) return;
                  pendingRef.current = { id, x: event.clientX, y: event.clientY };
                },
                onLocate,
                onCommit,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** 行交互打包传下去：递归只穿一层，不用逐个透传七八个回调 */
interface RowActions {
  onToggle: (id: string) => void;
  onToggleDeep: (node: NodeImpl) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onStartRename: (id: string) => void;
  onFinishRename: (id: string, value: string | null) => void;
  onRemove: (id: string) => void;
  onRowPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void;
  onLocate?: (id: string) => void;
  onCommit?: (command: Command) => void;
}

interface TreeNodeProps {
  node: NodeImpl;
  depth: number;
  collapsed: ReadonlySet<string>;
  /** 搜索态：整棵树按命中结果裁剪，且强制展开 */
  filtering: boolean;
  keep: ReadonlySet<string> | null;
  /** 搜索词（小写），用来给命中的字加底色 */
  query: string;
  selectedId: string | null;
  hoverId: string | null;
  /** 正在重命名的节点 id（只有一个） */
  editingId: string | null;
  /** 正在被拖拽的节点 id（整行半透明） */
  dragId: string | null;
  /** 当前落点（插入线挂在哪） */
  drop: TreeDrop | null;
  actions: RowActions;
}

function TreeNode({
  node,
  depth,
  collapsed,
  filtering,
  keep,
  query,
  selectedId,
  hoverId,
  editingId,
  dragId,
  drop,
  actions,
}: TreeNodeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isSelected = node.id === selectedId;
  const isHovered = node.id === hoverId;
  const isEditing = node.id === editingId;
  // 根节点没有"自己的名字"，也就没有重命名 / 删除
  const isRoot = !node.parent;
  // 搜索态一律展开：命中项藏在折叠里等于搜不到
  const expanded = filtering || !collapsed.has(node.id);
  const children = keep ? node.children.filter((child) => keep.has(child.id)) : node.children;
  const hasChildren = children.length > 0;

  // 选中行滚进可视区：树比面板长，选中深层节点后不滚动会"点了没反应"
  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  const text = nodeText(node);
  const title = nodeLabel(node);

  return (
    <>
      {drop?.kind === 'before' && drop.nodeId === node.id ? <Insertion invalid={!drop.valid} /> : null}
      <div
        ref={ref}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        className={styles.row}
        // 缩进与负外边距成对出现：内容停在 depth * INDENT，盒子却往左伸出同样的宽度，
        // 于是行底色是整行宽的（引擎 tree-title.tsx 同款写法，见 tree-layout.ts）
        style={
          {
            ...rowBox(depth),
            // 行盒要从「树的左边界」量到「树的内容宽度」，所以宽度要补回缩进量
            '--row-indent': `${depth * INDENT}px`,
          } as CSSProperties
        }
        data-selected={isSelected || undefined}
        data-detecting={isHovered || undefined}
        data-editing={isEditing || undefined}
        data-hidden={node.hidden || undefined}
        data-locked={node.locked || undefined}
        data-tree-row={depth}
        data-tree-id={node.id}
        data-dragging={dragId === node.id || undefined}
        onPointerDown={(event) => actions.onRowPointerDown(event, node.id)}
        onClick={() => actions.onSelect(node.id)}
        onDoubleClick={() => actions.onToggleDeep(node)}
        onMouseEnter={() => actions.onHover(node.id)}
        onMouseLeave={() => actions.onHover(null)}
        title={text ? `${title} · ${node.id}\n${text}` : `${title} · ${node.id}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className={styles.caret}
            data-open={expanded}
            aria-label={expanded ? `收起 ${title}` : `展开 ${title}`}
            onClick={(event) => {
              event.stopPropagation();
              actions.onToggle(node.id);
            }}
          >
            <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : (
          <span className={styles.caretEmpty} />
        )}

        <span className={styles.icon}>
          <MatIcon name={node.parent ? node.componentName : 'Page'} size={16} />
        </span>

        <span className={styles.label}>
          {isEditing ? (
            <RenameInput
              initial={title}
              onDone={(value) => actions.onFinishRename(node.id, value)}
            />
          ) : (
            <span className={styles.name}>
              <Highlighted text={title} query={query} />
            </span>
          )}
        </span>

        <span className={styles.actions}>
          <button
            type="button"
            className={styles.act}
            data-on={node.hidden || undefined}
            title={node.hidden ? '取消隐藏' : '隐藏（编辑态仍显示，运行态不渲染）'}
            aria-label={node.hidden ? '取消隐藏' : '隐藏'}
            onClick={(event) => {
              event.stopPropagation();
              actions.onCommit?.(new SetFlag(node.id, { hidden: !node.hidden }));
            }}
          >
            {node.hidden ? (
              <Eye size={16} aria-hidden="true" />
            ) : (
              <EyeOff size={16} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.act}
            data-on={node.locked || undefined}
            title={node.locked ? '取消锁定' : '锁定（画布上不可拖动、不可删除）'}
            aria-label={node.locked ? '取消锁定' : '锁定'}
            onClick={(event) => {
              event.stopPropagation();
              actions.onCommit?.(new SetFlag(node.id, { locked: !node.locked }));
            }}
          >
            {node.locked ? (
              <LockOpen size={16} aria-hidden="true" />
            ) : (
              <Lock size={16} aria-hidden="true" />
            )}
          </button>
          {isRoot ? null : (
            <>
              <button
                type="button"
                className={styles.act}
                title="重命名（F2）"
                aria-label="重命名"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onStartRename(node.id);
                }}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.act}
                data-danger="true"
                title="删除节点（可撤销）"
                aria-label="删除"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onRemove(node.id);
                }}
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </span>
      </div>

      {expanded && hasChildren ? (
        <div
          className={styles.branch}
          role="group"
          data-selected={isSelected || undefined}
          data-branch={depth}
        >
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child as NodeImpl}
              depth={depth + 1}
              collapsed={collapsed}
              filtering={filtering}
              keep={keep}
              query={query}
              selectedId={selectedId}
              hoverId={hoverId}
              editingId={editingId}
              dragId={dragId}
              drop={drop}
              actions={actions}
            />
          ))}
          {/* 追加成该容器最后一个孩子：插入线画在子列表末尾 */}
          {drop?.kind === 'inside-end' && drop.nodeId === node.id ? <Insertion invalid={!drop.valid} /> : null}
        </div>
      ) : drop?.kind === 'inside-end' && drop.nodeId === node.id ? (
        // 空容器没有子列表可挂，插入线直接跟在行后
        <Insertion invalid={!drop.valid} />
      ) : null}

      {/* 插到该节点之后 = 插到它整棵子树之后 */}
      {drop?.kind === 'after' && drop.nodeId === node.id ? <Insertion invalid={!drop.valid} /> : null}
    </>
  );
}

/**
 * 插入线/占位块（引擎 `.insertion`）：一个行高的虚线框。
 *
 * 用"占位块"而不是"1px 横线"，是因为它会**撑开**列表 —— 松手后节点就落在
 * 这块空白的位置上，落点与结果一一对应，不用脑补。无效落点（拖进自己的子树）
 * 换成红色虚线，仍然占位，告诉用户"这里不接受"。
 */
function Insertion({ invalid }: { invalid?: boolean }) {
  return <div className={styles.insertion} data-invalid={invalid || undefined} role="presentation" />;
}

/**
 * 行内重命名输入框。
 *
 * 三个收尾触发都指向同一个 `finish`，用 ref 保证只结算一次：
 * Esc 会先结算再卸载，卸载时这次 blur 不能把"取消"变成"保存"。
 */
function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };

  return (
    <input
      className={styles.renameInput}
      value={value}
      autoFocus
      spellCheck={false}
      aria-label="节点标题"
      // 进编辑态就全选：重命名十次有九次是整名替换，不是改一个字符
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(value)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        // 方向键 / 空格属于输入框，冒到树上会变成切换选中
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

/** 把命中的片段标出来：搜索后一眼能看出"为什么这行被留下来" */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  if (!lower.includes(query)) return <>{text}</>;

  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query, from);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={`${at}`} className={styles.hit}>
        {text.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}
