import { useMemo, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import type { ComponentMeta } from '@lowcode-next/protocol';
import { ChevronRight, Search } from 'lucide-react';
import { MatIcon } from './icons';
import { PaneHeader } from './PaneHeader';
import styles from '@lowcode-next/designer-ui/MaterialPanel.module.css';

export interface MaterialPanelProps {
  registry: MaterialMetaRegistry;
  onDragStart: (componentName: string, event: ReactPointerEvent<HTMLElement>) => void;
  /** 页头的窗口动作，由宿主（Designer）提供状态 */
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
}

interface Group {
  name: string;
  items: ComponentMeta[];
}

/**
 * 物料面板（宜搭式卡片网格）。
 *
 * 与行式列表相比，卡片网格（图标在上、名称在下）一眼可扫的物料密度更高，
 * 图标是主要寻址线索 —— 宜搭 / lowcode-engine 的资产面板都是这个形态。
 * 分组可折叠；搜索时自动展开全部分组，否则命中项可能藏在折叠里。
 */
export function MaterialPanel({
  registry,
  onDragStart,
  pinned,
  onTogglePin,
  onClose,
}: MaterialPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * 订阅注册表版本号：宿主在编辑过程中 `use()` 一个新物料包，面板立刻重算。
   *
   * 这行是「运行期插拔物料」的关键 —— 上一版物料表没有任何通知机制，
   * `list()` 结果变了也只有一个 `useMemo` 守着 `[registry]`，实例没换就永远不重算。
   * 现在与属性面板订阅 setter 注册表是同一套写法。
   */
  const version = useSyncExternalStore(registry.subscribe, registry.getVersion);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, ComponentMeta[]>();
    for (const meta of registry.list()) {
      // hidden 物料（页面壳 Page）只在注册表里活着：根节点渲染与顶层拖放
      // 都靠它，但它不是拿来拖的，出现在面板里只会诱导往页面里套页面
      if (meta.configure.component.hidden) continue;
      const name = meta.group ?? '其他';
      const bucket = map.get(name);
      if (bucket) bucket.push(meta);
      else map.set(name, [meta]);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
    // version 参与依赖：物料增删后 groups 必须重算，registry 实例本身是不变的
  }, [registry, version]);

  const query = keyword.trim().toLowerCase();

  const filtered = useMemo<Group[]>(() => {
    if (!query) return groups;
    return groups
      .map((group) => ({
        name: group.name,
        items: group.items.filter(
          (meta) =>
            meta.title.toLowerCase().includes(query) ||
            meta.componentName.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const toggle = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className={styles.root}>
      <PaneHeader
        title="组件库"
        pinned={pinned}
        onTogglePin={onTogglePin}
        onClose={onClose}
      />

      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Search size={13} strokeWidth={2} />
        </span>
        <input
          className={styles.search}
          value={keyword}
          placeholder="搜索组件"
          spellCheck={false}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>没有匹配的物料</p>
      ) : (
        filtered.map((group) => {
          // 搜索态强制展开：命中项藏在折叠分组里等于搜不到
          const isCollapsed = !query && collapsed.has(group.name);
          return (
            <section key={group.name} className={styles.group}>
              <button
                type="button"
                className={styles.groupTitle}
                onClick={() => toggle(group.name)}
              >
                <span className={styles.groupCaret} data-open={!isCollapsed || undefined}>
                  <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className={styles.groupName}>{group.name}</span>
                <span className={styles.groupCount}>{group.items.length}</span>
              </button>
              {!isCollapsed ? (
                <ul className={styles.grid}>
                  {group.items.map((meta) => (
                    <li
                      key={meta.componentName}
                      className={styles.card}
                      data-material={meta.componentName}
                      title={`${meta.title} · ${meta.componentName}`}
                      onPointerDown={(event) => {
                        // 阻止浏览器默认的文本选中，否则拖动时整块面板会被刷蓝
                        event.preventDefault();
                        onDragStart(meta.componentName, event);
                      }}
                    >
                      <span className={styles.cardIcon}>
                        <MatIcon name={meta.componentName} size={24} />
                      </span>
                      <span className={styles.cardName}>{meta.title}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
