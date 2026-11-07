import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { SetDirective, SetFlag, SetProps, SetText } from '@lowcode-next/model';
import type { Command, DocumentImpl, NodeImpl } from '@lowcode-next/model';
import {
  buildPropertyModel,
  defaultSetterRegistry,
  isBuiltinSetterKind,
  setterRefProps,
} from '@lowcode-next/designer-core';
import type {
  PropertyRowModel,
  RegisteredSetter,
  SetterContext,
  SetterRegistry,
} from '@lowcode-next/designer-core';
import { MatIcon } from './icons';
import { DESIGNER_FLAVOR, SetterSlot } from './SetterSlot';
import { cn } from './lib/utils';
import { BoolSetter, JsonSetter, NumberSetter, SelectSetter, TextSetter } from './setters';
import { StyleSetter } from './StyleSetter';
import { Input } from './ui/input';
import styles from '@lowcode-next/designer-ui/PropertyPanel.module.css';

export interface PropertyPanelProps {
  document: DocumentImpl;
  /** 所有写操作都过宿主注入的通道（带历史），面板自己不碰 Document.apply */
  onCommit: (command: Command) => void;
  /** 面包屑 hover → 画布高亮该节点 */
  onHoverNode?: (nodeId: string | null) => void;
  /** 面包屑点击 → 选中并把画布滚到该节点 */
  onLocateNode?: (nodeId: string) => void;
  /**
   * setter 注册表（§12.12.6）。缺省用全局默认表 —— 宿主直接调
   * `registerSetter('color', Comp)` 就能生效，不必显式传。
   * 两套编辑器并存时各自 `new SetterRegistry({ flavor })` 注入，互不串味。
   */
  setters?: SetterRegistry;
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
  setters = defaultSetterRegistry,
}: PropertyPanelProps) {
  const [tab, setTab] = useState<Tab>('props');

  // 订阅注册表版本号：宿主在**编辑过程中**注册 / 加载第三方 setter 后，
  // 面板立刻重渲染出新控件，schema 与历史栈都不动（§12.12.6）。
  // 返回值故意不用 —— 这里要的是「变了就重渲染」，行模型由下面的 pure 函数现算。
  useSyncExternalStore(setters.subscribe, setters.getVersion);

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
        {tab === 'props' ? (
          <PropsTab doc={doc} nodeId={node.id} onCommit={onCommit} setters={setters} />
        ) : null}
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

function PropsTab({
  doc,
  nodeId,
  onCommit,
  setters = defaultSetterRegistry,
}: TabProps & { setters?: SetterRegistry }) {
  const node = doc.getNode(nodeId);
  if (!node) return <p className={styles.empty}>节点已不存在</p>;

  // 「哪些属性、用什么控件、文案能不能改、哪些键没声明」全部由 core 决定
  // （§12.13.2）。这里只做：把行模型画出来 + 把写回接成 Command。
  // Vue 版拿的是同一个 `buildPropertyModel`，所以两版显示的属性集合不可能不同。
  const model = buildPropertyModel(node);
  const setProp = (key: string) => (value: unknown) =>
    onCommit(new SetProps(node.id, { [key]: value }));

  return (
    <div>
      {model.text.editable ? (
        <Row label="文案" tall hint="即 children，纯文本节点才有">
          {/*
            固定用多行：如果按当前长度在 input / textarea 之间切换，
            打到第 25 个字时会换成另一个宿主元素，焦点和输入法状态全丢。
          */}
          <TextSetter
            value={model.text.value}
            multiline
            placeholder="输入文案"
            onCommit={(value) => onCommit(new SetText(node.id, typeof value === 'string' ? value : ''))}
          />
        </Row>
      ) : null}

      {model.empty ? <p className={styles.note}>这个物料没有可配置的属性。</p> : null}

      {model.rows.map((row) => (
        <PropRow
          key={row.name}
          row={row}
          node={node}
          doc={doc}
          value={node.props[row.name]}
          onCommit={setProp(row.name)}
          onBatch={(updates) => onCommit(new SetProps(node.id, updates))}
          setters={setters}
        />
      ))}

      {model.undeclared.length > 0 ? (
        <Group title="未声明属性" defaultOpen>
          <p className={styles.note}>
            这些键在 schema 里，但物料 meta 没声明，所以物料实现可能读不到。
          </p>
          {model.undeclared.map((key) => (
            <Row key={key} label={key} tall>
              <JsonSetter value={node.props[key]} onCommit={setProp(key)} />
            </Row>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

interface PropRowProps {
  row: PropertyRowModel;
  node: NodeImpl;
  doc: DocumentImpl;
  value: unknown;
  onCommit: (value: unknown) => void;
  /** 一次写多个字段（四向间距、简写拆合…），在同一个 Command 里只进一条历史 */
  onBatch: (updates: Record<string, unknown>) => void;
  setters: SetterRegistry;
}

/**
 * 行模型 → 控件。
 *
 * 两层映射，顺序不能反：
 * 1. **注册表**：`kind` 命中就用注册的组件（`SetterSlot` 负责同步/异步/动态三态）；
 * 2. **内置**：没命中就按 `control.kind` 走内置控件。
 *
 * 这样内置控件不需要「预先注册」也能工作，所以注册表为空时行为与接线前逐字节一致
 * （M4 的零回归判据）；同时又支持「注册 `text` 覆盖所有文本属性」这种全局替换。
 *
 * 两种失败都要显式报出来（引擎那边是静默空白）：
 * - `flavor-mismatch`：注册了别的框架的实现 —— 直接渲染会炸在别人组件内部；
 * - `missing` 且作者显式声明了非内置 kind —— schema 写了 `setter: 'color'` 却没人实现。
 */
function PropRow({ row, node, doc, value, onCommit, onBatch, setters }: PropRowProps) {
  const { control, label } = row;

  // 查表用的 kind：显式声明优先（`color` 保持 color，不被推导成 text），
  // 没声明则用推导结果 —— 于是「全局替换 text 控件」也成立。
  const kind = row.setterKind ?? control.kind;
  const match = setters.match(kind, DESIGNER_FLAVOR);

  let custom: RegisteredSetter | null = null;
  let issue: string | null = null;

  if (match.status === 'hit') {
    custom = match.entry;
  } else if (match.status === 'flavor-mismatch') {
    issue = `setter「${kind}」只注册了 ${match.entry.flavor} 实现，当前编辑器是 ${DESIGNER_FLAVOR}，已临时回落。`;
  } else if (row.setterKind && !isBuiltinSetterKind(row.setterKind)) {
    issue = `setter「${kind}」还没有实现（meta.setter 写了，但没有 registerSetter），已回落为默认控件。`;
  }

  const ctx: SetterContext = {
    value,
    options: control.options,
    placeholder: control.placeholder,
    multiline: control.multiline,
    onCommit,
    field: row.name,
    meta: row.meta,
    scope: {
      nodeId: node.id,
      componentName: node.componentName,
      props: node.props,
      // 用 getter 而不是直接求值：属性面板一次几十行，而 `toSchema()` 是整页深拷贝。
      // 只有 setter 真读 `scope.page`（联动 / 数据源类）时才付这个代价。
      get page() {
        return doc.toSchema();
      },
    },
    batch: onBatch,
    // 注册项声明的默认参数 < schema 里 `{ componentName, props }` 的声明（后者更具体）
    setterProps: {
      ...(custom?.registration.defaultProps ?? {}),
      ...(setterRefProps(row.meta.setter) ?? {}),
    },
  };

  return (
    <>
      <Row
        label={label}
        reset={row.resettable ? () => onCommit(undefined) : undefined}
        resetTitle="恢复默认"
      >
        {custom ? <SetterSlot entry={custom} ctx={ctx} /> : builtinSetter(control, value, onCommit)}
      </Row>
      {issue ? <p className={styles.setterIssue}>{issue}</p> : null}
    </>
  );
}

/** 内置控件映射表：只换组件，不含任何判断（判断在 core 的 `resolvePropControl`） */
function builtinSetter(
  control: PropertyRowModel['control'],
  value: unknown,
  onCommit: (value: unknown) => void,
): ReactNode {
  switch (control.kind) {
    case 'bool':
      return <BoolSetter value={value} onCommit={onCommit} />;
    case 'select':
      return <SelectSetter value={value} options={control.options ?? []} onCommit={onCommit} />;
    case 'number':
      return <NumberSetter value={value} onCommit={onCommit} />;
    case 'json':
      return <JsonSetter value={value} onCommit={onCommit} placeholder="{}" />;
    case 'textarea':
      return <TextSetter value={value} multiline onCommit={onCommit} />;
    default:
      return <TextSetter value={value} placeholder={control.placeholder} onCommit={onCommit} />;
  }
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
  tall,
  children,
}: {
  label: string;
  hint?: string;
  reset?: () => void;
  resetTitle?: string;
  /** 多行控件（文案 / JSON）行：标签与控件顶部对齐，否则标签悬在文本框中段 */
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn(styles.row, tall && styles.rowTop)} data-prop={label}>
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
