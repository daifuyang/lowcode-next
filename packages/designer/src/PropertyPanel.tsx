import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SetDirective, SetFlag, SetProps, SetText } from '@lowcode-next/model';
import type { Command, DocumentImpl, NodeImpl } from '@lowcode-next/model';
import type { PropMeta } from '@lowcode-next/protocol';
import { MatIcon } from './icons';
import { BoolSetter, JsonSetter, NumberSetter, SelectSetter, TextSetter } from './setters';
import { StyleSetter } from './StyleSetter';
import { Input } from './ui/input';
import styles from './PropertyPanel.module.css';

export interface PropertyPanelProps {
  document: DocumentImpl;
  /** 所有写操作都过宿主注入的通道（带历史），面板自己不碰 Document.apply */
  onCommit: (command: Command) => void;
  /** 面包屑 hover → 画布高亮该节点 */
  onHoverNode?: (nodeId: string | null) => void;
  /** 面包屑点击 → 选中并把画布滚到该节点 */
  onLocateNode?: (nodeId: string) => void;
}

type Tab = 'props' | 'style' | 'advanced';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'props', label: '属性' },
  { key: 'style', label: '样式' },
  { key: 'advanced', label: '高级' },
];

/**
 * 面包屑最多显示 3 级（引擎 renderBreadcrumb 的 `let l = 3` 只向上走 3 层）。
 * 引擎直接用 Fusion Breadcrumb 渲染这 3 项，**没有**省略号项，也没有 tooltip；
 * 本地曾额外加的「…」和 title 提示都是多出来的。
 */
const BREADCRUMB_LIMIT = 3;

/**
 * 属性面板（lowcode-engine 的 SettingsPrimaryPane 对应物）。
 *
 * 结构对齐引擎原版：
 * - 头部：物料图标 + 祖先面包屑（hover 高亮画布、点击选中并定位父级）
 * - 页签：属性 / 样式 / 高级 —— 引擎的 addon-combine 就是这样分组的
 *   （props → 属性；style/className → 样式；condition/loop/key → 高级）
 * - 行形态：label 固定宽度靠左 + 控件占满右侧（引擎的 lc-inline-field）
 *
 * 换选中节点时页签回落到「属性」—— 引擎在 designer.selection.change 里
 * 重置 _activeKey，沿用这个行为：否则改完 A 的样式马上选 B，
 * 面板还停在 B 的样式页，多半不是用户想要的。
 */
export function PropertyPanel({
  document: doc,
  onCommit,
  onHoverNode,
  onLocateNode,
}: PropertyPanelProps) {
  const [tab, setTab] = useState<Tab>('props');

  const selectedId = doc.selection.selectedId;
  const node = selectedId ? doc.getNode(selectedId) : null;

  useEffect(() => {
    setTab('props');
  }, [selectedId]);

  // 未选中节点：引擎 settings-primary-pane 的未选中分支**只渲染一条提示**
  // （lc-settings-notice：居中 12px、padding 50px 15px 0）—— 没有面包屑、
  // 没有页签，也没有「页面概览」。本地曾加的概览/整页 JSON 已按引擎移除，
  // 整页 JSON 在选中任意节点后的「高级」页签里仍有入口。
  if (!node) {
    return (
      <div className={styles.root}>
        <p className={styles.notice}>请在左侧画布选中节点</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Navigator
        node={node}
        doc={doc}
        onHoverNode={onHoverNode}
        onLocateNode={onLocateNode}
      />

      <div className={styles.tabs} role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={styles.tab}
            data-active={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {tab === 'props' ? <PropsTab doc={doc} nodeId={node.id} onCommit={onCommit} /> : null}
        {tab === 'style' ? <StyleTab doc={doc} nodeId={node.id} onCommit={onCommit} /> : null}
        {tab === 'advanced' ? (
          <AdvancedTab doc={doc} nodeId={node.id} onCommit={onCommit} />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 头部导航（对应引擎的 lc-settings-navigator）                          */
/* ------------------------------------------------------------------ */

function Navigator({
  node,
  doc,
  onHoverNode,
  onLocateNode,
}: {
  node: NodeImpl | null;
  doc: DocumentImpl;
  onHoverNode?: (id: string | null) => void;
  onLocateNode?: (id: string) => void;
}) {
  const chain: NodeImpl[] = [];
  let current = node;
  while (current) {
    chain.unshift(current);
    current = current.parent;
  }

  if (chain.length === 0) {
    return (
      <div className={styles.navigator}>
        <span className={styles.navIcon}>
          <MatIcon name="Page" size={16} />
        </span>
        <span className={styles.navTitle}>页面</span>
      </div>
    );
  }

  const visible = chain.slice(-BREADCRUMB_LIMIT);
  const selected = chain[chain.length - 1]!;

  return (
    <div
      className={styles.navigator}
      onMouseLeave={() => onHoverNode?.(null)}
    >
      <span className={styles.navIcon}>
        <MatIcon name={selected.componentName} size={16} />
      </span>
      <div className={styles.crumbs}>
        {visible.map((item, index) => {
          const isCurrent = item === selected;
          return (
            <span key={item.id} className={styles.crumbUnit}>
              {index > 0 ? (
                <span className={styles.crumbSep} aria-hidden="true">
                  ›
                </span>
              ) : null}
              <button
                type="button"
                className={styles.crumb}
                data-current={isCurrent || undefined}
                onMouseEnter={() => onHoverNode?.(item.id)}
                onClick={() => {
                  doc.selection.select(item.id);
                  onLocateNode?.(item.id);
                }}
              >
                {item.parent ? (item.meta?.title ?? item.componentName) : '页面'}
              </button>
            </span>
          );
        })}
      </div>
      {/* 右端的组件名 code 标签（ctag，如「Link」）已移除：面包屑最后一级已
          标明当前节点，再挂一个 componentName tag 是重复信息 */}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 属性                                                                */
/* ------------------------------------------------------------------ */

interface TabProps {
  doc: DocumentImpl;
  nodeId: string;
  onCommit: (command: Command) => void;
}

function PropsTab({ doc, nodeId, onCommit }: TabProps) {
  const node = doc.getNode(nodeId);
  if (!node) return <p className={styles.empty}>节点已不存在</p>;

  const metaProps = node.meta?.props ?? {};
  const declared = Object.entries(metaProps).filter(([key]) => key !== 'style');
  const declaredKeys = new Set(Object.keys(metaProps));

  // 文案：只有当 children 全是字符串时才可编辑。
  // 有元素子节点的话，改这段文本等于删子树，不给这个入口。
  const textNode = !node.hasElementChildren() && node.schema.children !== undefined;
  const text = (node.schema.children ?? []).filter((c): c is string => typeof c === 'string').join('');

  // 根节点（页面）：引擎 Page 的声明 props 只有 style（parse-props 会把它升到
  // 样式页签），属性页签为**空**且没有任何提示文案（settings-primary-pane 只在
  // 整个面板无分组时才提示）。这里对齐：根节点不显示「没有可配置的属性」。
  const isRoot = !node.parent;

  // schema 里存在、但物料没声明的属性 —— 不渲染出来就变成"看不见也改不了"，
  // 手写 schema 时最容易在这里踩坑
  const undeclared = Object.keys(node.props).filter(
    (key) => key !== 'style' && !declaredKeys.has(key),
  );

  return (
    <div>
      {textNode ? (
        <Row label="文案" hint="即 children，纯文本节点才有">
          {/*
            固定用多行：如果按当前长度在 input / textarea 之间切换，
            打到第 25 个字时会换成另一个宿主元素，焦点和输入法状态全丢。
          */}
          <TextSetter
            value={text}
            multiline
            placeholder="输入文案"
            onCommit={(value) => onCommit(new SetText(node.id, typeof value === 'string' ? value : ''))}
          />
        </Row>
      ) : null}

      {declared.length === 0 && !textNode && !isRoot ? (
        <p className={styles.note}>这个物料没有可配置的属性。</p>
      ) : null}

      {declared.map(([key, propMeta]) => (
        <PropRow
          key={key}
          name={key}
          meta={propMeta}
          value={node.props[key]}
          onCommit={(value) => onCommit(new SetProps(node.id, { [key]: value }))}
        />
      ))}

      {undeclared.length > 0 ? (
        <Group title="未声明属性" defaultOpen>
          <p className={styles.note}>
            这些键在 schema 里，但物料 meta 没声明，所以物料实现可能读不到。
          </p>
          {undeclared.map((key) => (
            <Row key={key} label={key}>
              <JsonSetter
                value={node.props[key]}
                onCommit={(value) => onCommit(new SetProps(node.id, { [key]: value }))}
              />
            </Row>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

interface PropRowProps {
  name: string;
  meta: PropMeta;
  value: unknown;
  onCommit: (value: unknown) => void;
}

/**
 * 按 meta 推导控件。
 *
 * 优先级：显式 setter > options 存在 > type。
 * 缺省值只用于占位提示，不写进 schema —— schema 里没写就是"用物料默认"，
 * 这和"显式写成默认值"在导出的 JSON 里应该能区分。
 */
function PropRow({ name, meta, value, onCommit }: PropRowProps) {
  const type = meta.type ?? 'string';
  const options = meta.options;

  let control = null;
  if (type === 'bool') {
    control = <BoolSetter value={value} onCommit={onCommit} />;
  } else if (options && options.length > 0) {
    control = <SelectSetter value={value} options={options} onCommit={onCommit} />;
  } else if (type === 'number') {
    control = <NumberSetter value={value} onCommit={onCommit} />;
  } else if (type === 'object' || type === 'array') {
    control = <JsonSetter value={value} onCommit={onCommit} placeholder="{}" />;
  } else if (meta.setter === 'TextAreaSetter') {
    control = <TextSetter value={value} multiline onCommit={onCommit} />;
  } else {
    control = (
      <TextSetter
        value={value}
        placeholder={meta.defaultValue === undefined ? '' : String(meta.defaultValue)}
        onCommit={onCommit}
      />
    );
  }

  return (
    <Row
      label={meta.title ?? name}
      reset={value === undefined ? undefined : () => onCommit(undefined)}
      resetTitle="恢复默认"
    >
      {control}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* 样式（引擎 StyleSetter V2 的完整复刻，实现在 StyleSetter.tsx）          */
/* ------------------------------------------------------------------ */

function StyleTab({ doc, nodeId, onCommit }: TabProps) {
  const node = doc.getNode(nodeId);
  if (!node) return <p className={styles.empty}>节点已不存在</p>;

  const style = (node.props.style ?? {}) as Record<string, unknown>;

  return (
    <StyleSetter
      style={style}
      onStyleChange={(key, value) => {
        const next = { ...style };
        // 引擎 onStyleChange 把 null 也当「删除该键」，批量通道同样处理
        if (value === undefined || value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
        onCommit(new SetProps(node.id, { style: Object.keys(next).length > 0 ? next : undefined }));
      }}
      onStyleReplace={(value) => onCommit(new SetProps(node.id, { style: value }))}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 高级（对应引擎 addon-combine 的 #advanced 分组）                       */
/* ------------------------------------------------------------------ */

function AdvancedTab({ doc, nodeId, onCommit }: TabProps) {
  const node = doc.getNode(nodeId);
  if (!node) return <p className={styles.empty}>节点已不存在</p>;

  const condition = node.schema.condition;
  const loop = node.schema.loop;
  const loopArgs = node.schema.loopArgs;

  // 引擎 addon-combine 的 isRoot 分支：Page / Component 根节点**不注入**
  // condition / loop / key —— 页面根不可条件渲染、不可循环，给出入口只会
  // 诱导用户写出让整页消失的 schema。这里的两组手风琴对根节点隐藏。
  const isRoot = !node.parent;

  const flags = [
    node.isContainer() ? '容器' : '原子',
    condition !== undefined ? 'condition' : null,
    loop !== undefined ? 'loop' : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      {!isRoot ? (
        <>
          <Group title="条件渲染" defaultOpen>
            <Row label="是否渲染" hint="布尔或 {{ 表达式 }}，空 = 恒渲染">
              <ExpressionInput
                value={condition}
                placeholder="{{ state.show }}"
                onCommit={(value) => onCommit(new SetDirective(node.id, { condition: value }))}
              />
            </Row>
          </Group>

          <Group title="循环" defaultOpen>
            <Row label="循环数据" hint="JSON 数组或 {{ 表达式 }}">
              <ExpressionInput
                value={loop}
                placeholder='["a","b"] 或 {{ items }}'
                onCommit={(value) => onCommit(new SetDirective(node.id, { loop: value }))}
              />
            </Row>
            <Row label="迭代变量名" hint="默认 item">
              <TextSetter
                value={loopArgs?.[0]}
                placeholder="item"
                onCommit={(value) =>
                  onCommit(
                    new SetDirective(node.id, {
                      loopArgs: [typeof value === 'string' ? value : 'item', loopArgs?.[1] ?? 'index'],
                    }),
                  )
                }
              />
            </Row>
            <Row label="索引变量名" hint="默认 index">
              <TextSetter
                value={loopArgs?.[1]}
                placeholder="index"
                onCommit={(value) =>
                  onCommit(
                    new SetDirective(node.id, {
                      loopArgs: [loopArgs?.[0] ?? 'item', typeof value === 'string' ? value : 'index'],
                    }),
                  )
                }
              />
            </Row>
          </Group>
        </>
      ) : null}

      <Group title="显隐与锁定" defaultOpen>
        <Row label="隐藏">
          <BoolSetter
            value={node.hidden}
            onCommit={(value) => onCommit(new SetFlag(node.id, { hidden: value === true }))}
          />
        </Row>
        <Row label="锁定">
          <BoolSetter
            value={node.locked}
            onCommit={(value) => onCommit(new SetFlag(node.id, { locked: value === true }))}
          />
        </Row>
      </Group>

      <Group title="节点信息" defaultOpen={false}>
        <dl className={styles.kv}>
          <dt>id</dt>
          <dd title={node.id}>{node.id}</dd>
          <dt>父节点</dt>
          <dd>{node.parent?.id ?? '—'}</dd>
          <dt>子节点</dt>
          <dd>
            {node.schema.children?.length ?? 0} 项（元素 {node.children.length} 个）
          </dd>
          <dt>标记</dt>
          <dd>{flags.join(' · ')}</dd>
        </dl>
      </Group>

      <Group title="节点 JSON" defaultOpen={false}>
        <pre className={styles.code}>{JSON.stringify(node.schema, null, 2)}</pre>
      </Group>

      <Group title="整页 JSON" defaultOpen={false}>
        <pre className={styles.code}>{JSON.stringify(doc.toSchema(), null, 2)}</pre>
      </Group>
    </div>
  );
}

/**
 * 表达式输入：布尔 / JSON / {{ }} 表达式三态归一。
 *
 * condition 是 boolean|string，loop 是 unknown[]|string，共用一个控件：
 * 输入 true/false 提交布尔，能被 JSON.parse 的提交解析值，
 * 其余按表达式字符串提交。清空 = 删除该键。
 */
function ExpressionInput({
  value,
  placeholder,
  onCommit,
}: {
  value: unknown;
  placeholder?: string;
  onCommit: (value: unknown) => void;
}) {
  const external =
    value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onCommit(undefined);
      return;
    }
    if (trimmed === 'true' || trimmed === 'false') {
      onCommit(trimmed === 'true');
      return;
    }
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        onCommit(JSON.parse(trimmed));
        return;
      } catch {
        // 非法 JSON 按表达式字符串提交，物料端 pick 会兜底
      }
    }
    onCommit(trimmed);
  };

  return (
    <Input
      type="text"
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(external);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        commit(event.target.value);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 公共                                                                */
/* ------------------------------------------------------------------ */

function Row({
  label,
  hint,
  reset,
  resetTitle,
  children,
}: {
  label: string;
  hint?: string;
  reset?: () => void;
  resetTitle?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.row} data-prop={label}>
      <div className={styles.rowHead}>
        <span className={styles.label} title={hint ?? label}>
          {label}
        </span>
        {reset ? (
          <button
            type="button"
            className={styles.reset}
            title={resetTitle ?? '重置'}
            onClick={reset}
          >
            ↺
          </button>
        ) : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

/**
 * 可折叠分组（引擎的 lc-accordion-field）：32px 头、浅底、上下边线、
 * 箭头随折叠旋转。样式/高级页签里，平铺几十行只会让人滚轮滚到手抽筋。
 */
function Group({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={styles.group} data-open={open || undefined}>
      <button type="button" className={styles.groupHead} onClick={() => setOpen(!open)}>
        <span className={styles.groupArrow} data-open={open || undefined}>
          ▸
        </span>
        <span className={styles.groupTitle}>{title}</span>
      </button>
      {open ? <div className={styles.groupBody}>{children}</div> : null}
    </section>
  );
}
