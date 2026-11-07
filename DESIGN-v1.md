# LCE · v1 设计方案（协议 + 拖拽引擎）

> 版本：v1.0-draft
> 日期：2026-11-04
> 目标：用一份框架无关的 schema 描述页面，并在画布中流畅地拖拽物料 / 重排节点。

---

## 1. 目标与范围

### 1.1 v1 必须做到

| 能力 | 说明 |
|---|---|
| 协议 | 页面 schema + 物料 meta + setter 引用，可序列化、带版本号 |
| 渲染 | schema → DOM，每个节点带 `data-node-id` |
| 文档模型 | 节点树、命令、选区（撤销重做留接口） |
| 拖拽 | 物料面板拖入画布 + 画布内重排，60fps |
| 设计器壳 | 画布 + 物料面板 + 选中高亮 + 删除 |

### 1.2 v1 明确不做

- 属性面板（只留右侧占位，setter 协议先定好）
- 撤销重做（命令模式已就位，v1.1 接 history）
- 出码
- 多选、复制粘贴
- Vue driver（架构留缝，见 §5.4）
- iframe 画布（架构留缝，见 §7.3）
- 缩放 / 自由布局

### 1.3 一条贯穿始终的原则

> **开发态是应用，交付态才是资源。**
> 本地永远是 `pnpm dev` + HMR，UMD 只在 CI 产出。

---

## 2. 总体架构

```
                        ┌──────────────────────────────┐
                        │        @lowcode-next/designer         │  React UI
                        │  画布 / 物料面板 / 大纲树      │
                        └───────┬──────────────┬───────┘
                                │              │
                ┌───────────────▼──┐      ┌────▼─────────────┐
                │    @lowcode-next/drag     │      │   @lowcode-next/model     │
                │ 指针状态机/几何   │      │ 节点树/命令/选区  │
                └───────────────┬──┘      └────┬─────────────┘
                                │              │
                ┌───────────────▼──────────────▼─────────────┐
                │              @lowcode-next/renderer                 │
                │   求值器 Evaluator → IR → Driver(React)    │
                └───────────────────┬────────────────────────┘
                                    │
                ┌───────────────────▼────────────────────────┐
                │              @lowcode-next/protocol                 │
                │   schema / meta / setter 类型 + zod 校验    │
                └────────────────────────────────────────────┘
```

依赖只能向下，不能反向。`@lowcode-next/drag` **不依赖 model**，只认 `Point / Rect / id`，因此可独立测试、可独立复用。

### 2.1 技术选型

| 领域 | 选型 | 理由 | 刻意不用 |
|---|---|---|---|
| 语言 | TypeScript 5.x，`strict: true` | — | — |
| 运行时 | Node 20+ / 浏览器 ES2022 | — | — |
| 包管理 | pnpm workspace | 硬链接、依赖严格、天然隔离幽灵依赖 | lerna / yarn1 |
| 库构建 | Vite lib mode（rollup） | 一份配置同时产 ESM + UMD | webpack / build-scripts |
| 类型构建 | `tsc -b` + project references | 增量编译，改一个包秒级 | 全量串行构建 |
| 开发 | Vite dev server + HMR | 直接读 `src`，零构建 | 代理劫持线上页面 |
| UI | **React 19.3** | 新项目无历史包袱；antd v6 已支持；`ref` 作为普通 prop 简化 Driver | React 18（仅当必须兼容老物料库）；Vue（driver 层留缝） |
| 状态 | 自研轻量 store + `useSyncExternalStore` | 零依赖、可预测 | MobX / Redux（引入后调试成本高于收益） |
| 数据校验 | zod | 类型与运行时校验同源（`z.infer`） | 手写类型 + 手写校验 |
| ID | nanoid | 短、无冲突 | uuid |
| 样式 | CSS Modules + CSS 变量 | 作用域明确、零运行时 | CSS-in-JS |
| 表达式 | `new Function` + 白名单作用域 | v1 够用，边界清楚 | 直接 `eval`；完整沙箱（v2 换 quickjs） |
| 拖拽 | 自研 PointerEvent 引擎 | 见 §6 | dnd-kit / react-dnd / HTML5 DnD |
| 单测 | Vitest | 与 Vite 同源配置 | Jest |
| E2E | Playwright | 需要真实布局 | — |
| Lint | ESLint + Prettier | — | TSLint |

### 2.2 运行时对象图

```
App
 ├─ MaterialRegistry       物料名 → 组件 / meta / 默认 snippet
 ├─ Document               节点树 + Selection + History
 │    └─ MaterialResolver  ← 由 MaterialRegistry 注入
 ├─ Renderer               Evaluator + Driver，订阅 Document
 ├─ DragManager            指针状态机，调用 DropContext
 └─ DesignerStore          纯 UI 态（面板 tab、hover、拖拽态）
```

**所有对象由工厂函数创建、依赖显式注入，禁止任何模块级单例。**

低代码引擎的 `designer` / `event` / `adapter` 全是模块级单例，直接导致：同页两实例互相污染、微前端无法共存、测试必须 mock 全局。这条是从第一天就要守住的底线。

### 2.3 三条数据流

**① 加载**

```
schema JSON → zod 校验 → migrate → Document 构建 → Evaluator → IR → Driver → DOM[data-node-id]
```

**② 拖拽（高频，零副作用）**

```
pointer 事件 → DragManager → DropContext.resolve → DropTarget → Overlay
```

全程 **不写模型、不触发 React 重渲染**。这是流畅度的结构性保证，不靠"优化"。

**③ 提交（低频）**

```
pointerup → 构造 Command → Document.apply → Notifier → Renderer 重渲染 → Selection 更新
```

### 2.4 响应式模型

- `Document` 内置 `Notifier`，emit `{ type: 'node.add' | 'node.move' | 'props.change' | ..., nodeIds }`
- React 侧统一用 `useSyncExternalStore` 订阅，不引入状态库

**决策 D14：v1 不做细粒度渲染。**

提交变更时整棵树重渲染。理由是**提交是低频事件**：一次拖拽只发生一次，500 节点整树渲染远低于 16ms。而高频的拖拽过程完全不碰渲染。

很多低代码项目一上来就做节点级 diff 和细粒度订阅，结果复杂度先爆炸、性能没提升。**先把高频路径（拖拽）和低频路径（提交）分开，再谈优化。** Notifier 的 payload 已带 `nodeIds`，v2 升级细粒度时无需改接口。

### 2.5 渲染管线

```
PageSchema
  │ zod 校验
  │ migrate（版本迁移）
  ▼
Document ── Evaluator ──> IRNode[] ── Driver ──> 框架节点 ──> DOM
               │
               ├─ 表达式求值（受限 scope：state / props / item / utils）
               ├─ mode: 'edit' | 'runtime'   ← 循环、条件、隐藏的语义在此分叉
               └─ 组件解析（MaterialRegistry.resolve）
```

`Evaluator` 是纯函数：

```ts
evaluate(schema: NodeSchema | Children, ctx: EvalContext): Array<IRNode | string>
```

无副作用、可快照测试。这是整套系统里最适合写测试、也最值得写测试的地方。

### 2.6 构建与调试

```bash
pnpm dev            # Vite：直接读各包 src，HMR，零构建
pnpm build:types    # tsc -b（增量）
pnpm build:lib      # vite build --config vite.lib.config.ts（仅发版）
pnpm test           # vitest
```

```ts
// apps/shared/vite.base.ts（两个 app 共用）
resolve: {
  alias: {
    '@lowcode-next/protocol': resolve(__dirname, '../../packages/protocol/src'),
    '@lowcode-next/model':    resolve(__dirname, '../../packages/model/src'),
    // ...
  },
  dedupe: ['react', 'react-dom'],   // ★ 防双 React
}
```

UMD 只在 CI 的 release 任务里产出，本地永不执行。

### 2.7 扩展点（v1 只留接口，不做体系）

| 接口 | 用途 | v1 |
|---|---|---|
| `Driver` | 换渲染框架 | React 一个实现 |
| `DropContext` | 换画布（同文档 / iframe） | 同文档实现 |
| `Command` | 新增操作 | 4 个实现 |
| `Setter` | 属性编辑 | 只有协议，无 UI |
| 插件 | 面板注册 | **不做**（见 §11） |

### 2.8 测试策略

| 层 | 工具 | 说明 |
|---|---|---|
| Locator / Evaluator / Command | Vitest | 纯函数，毫秒级 |
| DragManager 状态机 | Vitest + 注入假指针序列 | 不依赖真实事件 |
| Overlay / 落点 / 视觉 | Playwright | **jsdom 没有布局**，任何依赖 `getBoundingClientRect` 的断言都必须放这里 |

这条要提前跟团队说清楚：不要在单测里死磕布局相关断言，那是在跟 jsdom 的模型缺陷较劲。

### 2.9 React 19 采用说明

**结论：直接用 React 19（当前 latest 19.3.1），不降级。**

理由：新项目没有历史包袱；`antd` v6 的 peerDependencies 已是 `react >= 18`，原生支持 19；而 React 19 移除的 API 恰好是我们早就不打算用的（见 D8）。

React 19 相对 18 中，与本项目相关的变更：

| 变更 | 对本项目的影响 |
|---|---|
| **移除 `findDOMNode`**（以及 `ReactDOM.render`、`unstable_renderSubtreeIntoContainer`） | 正面。我们的 D8 已改为 `data-node-id` 反查，完全不依赖它 |
| **`ref` 作为普通 prop**，无需 `forwardRef` | 正面。Driver 直传 `ref`，物料包装层少一层 HOC |
| **ref 回调不能再隐式返回值** | 注意。`ref={el => (x = el)}` 这类写法会失效，物料里要写成块级函数 |
| **函数组件移除 `defaultProps`** | 注意。物料默认值统一走 schema / meta，本来就不依赖它 |
| **移除 `propTypes`、字符串 ref、`createFactory`** | 无影响 |
| **`<Context>` 可直接作为 Provider** | 中性，可简化样板 |
| **`use()` + Suspense 支持读取 Promise** | 正面。v2 异步加载物料包可直接用，不必自己写 loading 态 |
| **`<Activity>`（19.2 起）** | 正面。多页面 tab 离屏保活可直接用 |

第三方物料库是唯一风险区，需要逐个确认：

- 依赖 `findDOMNode` 的库（部分老图表库、拖拽库）→ 直接不可用
- 依赖 `defaultProps` 的老组件 → 默认值失效
- 用过 `ref` 隐式返回值的 → 运行时报错
- `antd` v5 需 `@ant-design/v5-patch-for-react-19`；v6 不需要

**落地措施**：CI 里加一条「物料冒烟测试」——对 `componentsMap` 里每个组件渲染一次并做交互快照。这比任何文档都可靠，也能防住未来新增物料的回归。

---

## 3. 协议设计

### 3.1 页面 schema

```ts
interface PageSchema {
  version: string;                 // 协议版本，用于迁移
  componentsMap: ComponentMapItem[];
  componentsTree: NodeSchema;
  dataSource?: { list: DataSourceConfig[] }; // 页面数据源，lowcode 协议同构（§7.11）
  meta?: Record<string, any>;      // 平台自定义
}

/** 数据源配置（lowcode 的 DataSourceConfig 同构，v1 内置 fetch 类型） */
interface DataSourceConfig {
  id: string;                      // 页面内唯一，表达式引用名
  type: 'fetch' | string;          // jsonp / mtop 预留
  description?: string;
  isInit?: boolean;                // 页面加载时自动请求（运行态随 M6 生效）
  options?: {
    uri?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    params?: Record<string, any>;
    headers?: Record<string, string>;
    timeout?: number;              // 默认 5000
  };
}

interface ComponentMapItem {
  componentName: string;           // schema 中引用的名字
  package: string;                 // npm 包名
  version?: string;
  exportName?: string;             // 默认 = componentName
  subName?: string;                // 导出对象里的子属性
  destructuring?: boolean;
}

type Children = Array<NodeSchema | string>;

interface NodeSchema {
  id: string;                      // nanoid，全局唯一
  componentName: string;           // 或内置指令名
  title?: string;                  // 节点标题（大纲显示名），缺省回落物料 meta.title
  props?: Record<string, any>;
  children?: Children;             // 元素 + 文本可混排
  // ---- 渲染指令（框架无关，由求值器展开）----
  condition?: boolean | string;    // "{{ state.visible }}"
  loop?: any[] | string;           // "{{ state.list }}"
  loopArgs?: [string, string];     // ["item", "index"]
  // ---- 编辑态修饰 ----
  hidden?: boolean;                // 编辑态可见、运行态不渲染
  locked?: boolean;
  meta?: Record<string, any>;
}
```

**决策 D1：文本统一用 `children` 里的字符串项，不用 `props.children`。**

理由：低代码平台里 `props.children` 和 `children` 双轨是历史包袱，schema 读写、diff、拖拽都容易出错。统一后 IR 只有一种形态。

**决策 D2：`condition` / `loop` 是节点级指令，不进 `props`。**

它们是"渲染语义"而非"组件属性"，Vue/React 的实现方式也不同。放在节点级，由求值器吃掉，driver 永远看不到。

**决策 D3：v1 不支持具名插槽。**

`{ componentName: "Slot", props: { name: "title" } }` 先只做语法占位，求值器 v1 直接透传为 children。具名插槽到 v2。

示例：

```json
{
  "version": "1.0.0",
  "componentsMap": [
    { "componentName": "Div",    "package": "@lowcode-next/builtin" },
    { "componentName": "Button", "package": "antd", "version": "^5", "exportName": "Button" }
  ],
  "componentsTree": {
    "id": "root",
    "componentName": "Div",
    "props": { "style": { "padding": 24 } },
    "children": [
      {
        "id": "btn_1",
        "componentName": "Button",
        "props": { "type": "primary" },
        "children": ["提交"]
      }
    ]
  }
}
```

### 3.2 物料 meta

```ts
interface ComponentMeta {
  componentName: string;
  title: string;
  group?: string;                  // 物料面板分组
  icon?: string;
  npm?: {
    package: string;
    version?: string;
    exportName?: string;
    subName?: string;
    destructuring?: boolean;
  };
  props: Record<string, PropMeta>;
  configure: {
    component: {
      isContainer?: boolean;         // 是否能放子节点（拖拽的核心判据）
      isModal?: boolean;
      emptyPlaceholder?: boolean;     // 空容器是否注入占位块，缺省开启（见 §5.5）
      rootSelector?: string;         // 量取边界用，默认取根元素
      nestingRule?: {                 // 容器嵌套规则
        parentWhitelist?: string[];
        childWhitelist?: string[];
      };
    };
    supports: {
      style?: boolean;
      condition?: boolean;
      loop?: boolean;
      events?: string[];
    };
    advanced?: {
      callbacks?: {
        onMoveHook?: string;         // 表达式，返回 false 则禁止移动
        onChildMoveHook?: string;
      };
    };
  };
  snippets?: Snippet[];            // 拖入时插入的默认 schema
}

interface PropMeta {
  title?: string;
  type?: 'string' | 'number' | 'bool' | 'object' | 'array' | 'func' | 'reactnode';
  defaultValue?: any;
  setter?: SetterRef;
}

type SetterRef = string | { componentName: string; props?: Record<string, any> };
```

> 注：以上是 v1 初始设计。§12 多框架规范落地后会净化：`PropValueType` 的
> `'reactnode'` → `'node'`、`'func'` 不得进 schema；`SetterRef` 收敛为**语义
> kind 枚举** + JSON `props`，不再接受任意 `componentName` 实现名（理由与替代
> 方案见 §12.4.2 方案评审）。

**决策 D4：`isContainer` 是唯一容器判据。**

低代码引擎里 `isContainer` / `isParental` / `nestingRule` / `container` 多套概念并存，是拖拽 bug 的重灾区。v1 只认 `isContainer` + 可选 `nestingRule`。

### 3.3 版本与迁移

```ts
interface Migration {
  from: string;
  to: string;
  migrate(schema: PageSchema): PageSchema;
}
```

v1 只留注册表和一个 `1.0.0 → 1.1.0` 的空迁移示例。**schema 必须带版本，这一条现在不做，以后一定还债。**

### 3.4 校验

用 zod 定义 runtime schema，加载时校验并给出可读错误（含节点 id 路径）。类型从 zod 推导（`z.infer`），避免类型与校验两套定义漂移。

---

## 4. 文档模型

### 4.1 结构

```ts
class Document {
  readonly id: string;
  readonly root: Node;
  readonly selection: Selection;
  readonly history: History;
  readonly schema: PageSchema;

  getNode(id: string): Node | null;
  apply(command: Command): void;
  toSchema(): PageSchema;
  dispose(): void;
}

interface Node {
  readonly id: string;
  readonly componentName: string;
  readonly meta: ComponentMeta | null;
  readonly parent: Node | null;
  readonly children: ReadonlyArray<Node>;
  props: Record<string, any>;
  hidden: boolean;
  locked: boolean;
  isContainer(): boolean;
  index(): number;
  contains(other: Node): boolean;
}
```

**决策 D5：节点是不可变视图 + 可写 props？**

不。v1 用**可变模型 + 命令**（所有写操作必须走 `apply(command)`），而不是不可变树全量替换。理由：低代码场景节点数可达数千，全树 immutable 更新配合拖拽高频读取会持续分配；命令模式让历史记录、协同、埋点都有唯一收敛点。

### 4.2 命令

```ts
interface Command {
  readonly type: string;
  apply(doc: Document): void;
  revert(doc: Document): void;
  mergeWith?(next: Command): Command | null;   // 用于连续输入合并
}
```

v1 只实现四个：

| 命令 | 用途 |
|---|---|
| `InsertNode` | 从物料面板拖入 |
| `MoveNode` | 画布内重排 |
| `RemoveNode` | 删除 |
| `SetProps` | 属性修改（面板 v2 用，先实现） |

**决策 D6：拖拽引擎不直接改模型。**

拖拽只产出 `DropTarget` 并 emit 事件，由 designer 构造命令。这样拖拽可单测、可回放，也让"拖起 → 中途取消"天然安全。

### 4.3 选区

```ts
class Selection {
  select(id: string | null): void;
  hover(id: string | null): void;
  readonly selectedId: string | null;
  on('change', cb): () => void;
}
```

v1 单选。多选在 v2 改为 `Set<string>`，接口保持不变。

---

## 5. 渲染

### 5.1 三段式

```
NodeSchema ──Evaluator──> IRNode[] ──Driver──> ReactNode / VNode
```

**Evaluator（纯 TS，零框架）** 负责：

1. 表达式求值（`{{ }}`，受限作用域）
2. 展开 `loop` → 复制节点，注入 loopArgs
3. 判定 `condition`
4. 解析组件（通过 componentsMap → material registry）
5. 输出 `IRNode`

```ts
interface IRNode {
  id: string;
  key: string;              // id 或 id + loopIndex
  type: string;             // 组件名，driver 通过 registry 解析
  props: Record<string, any>;
  children: Array<IRNode | string>;
}

interface Driver {
  render(node: IRNode): unknown;          // 框架节点
  renderRoot(nodes: Array<IRNode | string>): unknown;
}
```

**ReactDriver**（v1 唯一实现，约 80 行）：

```tsx
function render(n: IRNode) {
  const Comp = registry.resolve(n.type);
  return createElement(Comp, {
    key: n.key,
    'data-node-id': n.id,          // ★ 拖拽/命中全靠它
    ...n.props,
  }, ...n.children.map(c => typeof c === 'string' ? c : render(c)));
}
```

**VueDriver 的缝**：只需实现 `Driver` 接口，`h(...)` 替掉 `createElement`，`data-node-id` 同样透传。拖拽引擎完全不用改。这句 v1 的粗略判断已由 **§12 多框架渲染规范**细化为完整的包边界、物料绑定契约与「一个画布二选一」的装配规则；本节的三段式与 `Driver` 接口仍是它的基础。

### 5.2 编辑态与运行态语义差异（重要）

| schema 语义 | 运行态 | 编辑态 |
|---|---|---|
| `condition: false` | 不渲染 | **渲染但置灰 + 角标**，否则节点从画布消失无法选中 |
| `loop: [...]` | 展开 N 次 | **只渲染一次**（取第一项），角标提示"循环节点" |
| `hidden: true` | 不渲染 | 半透明渲染，可选中 |

**决策 D7：编辑态一律保证"一个节点对应一个 DOM"，绝不 1:N。**

低代码引擎在编辑态展开循环，导致 `node → DOM` 是 1:many，量取矩形时要合并多个实例，是拖拽和高亮的经典 bug 源。这里直接从源头规避：编辑态循环节点只渲染一次。

### 5.3 表达式沙箱

```ts
evaluate(expr: string, scope: { state, props, item?, index?, utils? }): any
```

v1 用 `new Function` + 白名单全局（禁止 `window`/`document`/`fetch`）。风险可接受（编辑态自己的页面），运行态如需对外部署再换 `quickjs-emscripten`。**该决策记入风险表。**

### 5.4 节点反查

**决策 D8：只用 DOM 属性反查，绝不碰框架内部。**

```ts
function nodeAt(point: Point, root: HTMLElement): { id: string; el: Element } | null {
  const el = root.ownerDocument.elementFromPoint(point.x, point.y);
  const hit = el?.closest('[data-node-id]');
  return hit && root.contains(hit) ? { id: hit.getAttribute('data-node-id')!, el: hit } : null;
}
```

这一条同时解决了 React 19 移除 `findDOMNode`、以及未来 Vue 支持的问题。

### 5.5 空容器占位（编辑态）

**问题**：容器物料的根元素只装 children，一旦没有 children 就没有任何内容撑开盒子。
`Stack` / `Grid` 这类没有内边距的容器会塌成 **宽 0 × 高 0** —— 画布上看不见、点不中、
也拖不进去，表现就是"拖进来一个容器，什么都没发生"。

**参考**：lowcode `packages/react-simulator-renderer/src/renderer-view.tsx` 的
`customCreateElement` 在渲染前检查，命中条件时给 children 塞一个占位 `div`：

```js
// 如果是容器 && 无children && 高宽为空 增加一个占位容器，方便拖动
if (leaf?.isContainer() && !children?.length &&
    (!viewProps.style || Object.keys(viewProps.style).length === 0)) {
  children = <div className="lc-container-placeholder">拖拽组件或模板到这里</div>;
}
```

**落地位置**：`ReactDriver`（框架层才允许造 DOM，Evaluator 保持零框架）。
判定抽成纯函数 `shouldPlacePlaceholder`，可脱离 DOM 单测。

四条条件，缺一不可：

| 条件 | 理由 |
|---|---|
| 是容器（`isContainer`） | 非容器空节点（`Spacer`、空 `Image`）本来就有自己的形态 |
| `emptyPlaceholder !== false` | 自带内容的区块（导航栏 / 首屏 / 特性卡 / 页脚）的 children 只是可选补充，塞灰块会盖住设计 |
| 没有子节点 | 有内容就不需要提示 |
| 没写 `style` | 用户显式写了尺寸/内边距，容器不会塌，占位反而碍事 |

**占位块不是节点**：没有 `data-node-id`，所以 `closest()` 会把它冒泡回容器本体，
命中与落点语义不变；它也不在 schema 里，不会被 `toSchema()` 导出。
配合 `pointer-events: none`，它纯粹是视觉提示。

样式抄 `react-simulator-renderer/src/renderer.less` 的 `.lc-container-placeholder`
（`min-height: 60px`、`rgb(240,240,240)` 底、`1px dotted` 边、`rgb(167,177,189)` 字），
放在 `Designer.module.css` 而非 `materials.css`：运行态根本不会渲染这个元素，
没必要让线上页面背这份样式。

锁定容器换成"锁定元素及其子元素不可编辑"+ `lc-container-locked` 底色，
否则用户会对着"拖拽组件或模板到这里"一直拖却永远落不进去 —— 同样照抄引擎。

---

## 6. 拖拽引擎

### 6.1 分层

```
DragManager        状态机 + 事件路由（零几何、零模型）
├─ PointerSource   指针采样 + rAF 合帧
├─ Locator         纯几何函数（无 DOM、无模型，可单测）
├─ AutoScroller    边缘自动滚动
└─ Overlay         独立 DOM 层，直写 style
        ▲
        │ DropTarget
   DropContext     （在 designer 侧实现：树遍历 + 规则校验）
```

**决策 D9：Locator 是纯函数。**

输入 `{ point, containerRect, childrenRects[], axis, mode }`，输出 `{ index, position }`。不含任何 DOM 调用。可用数字直接单测，覆盖边界情况（空容器、单子节点、横向排列、嵌套）。

### 6.2 状态机

```
        pointerdown(可拖目标)
                │
                ▼
            ┌────────┐  move < 4px
            │ pending│◄──────────────┐
            └───┬────┘               │
   move ≥ 4px   │                    │
                ▼                    │
            ┌────────┐   Esc/settled │
            │dragging│────────────────┼──► idle
            └───┬────┘                │
      pointerup │                    │
                ▼                    │
            ┌────────┐               │
            │ dropping│──────────────┘
            └────────┘
```

- 4px 阈值（可配），避免点击误触
- 监听挂在 `document` 的 **capture 阶段**，防组件内部 `stopPropagation`
- 必挂 `pointercancel` / `window.blur` / `visibilitychange` 兜底，防指针事件丢失导致卡在 dragging

**决策 D10：不用 HTML5 Drag & Drop 做画布内拖拽。**

`dragstart/dragover` 有浏览器原生 ghost、节流机制和 `dataTransfer` 限制，无法做到帧级跟手。仅保留一个 `NativeDndAdapter`（v2）用于**跨 iframe / 从外部浏览器拖入**。

既然不用原生 DnD，就必须**把画布里的原生拖拽按掉**：`<a href>`、`<img>` 在 Chrome 里
按住移动会自己触发 `dragstart`，紧接着一个 `pointercancel` 把指针拖拽直接取消 ——
表现为导航链接、按钮这类渲染成 `<a>` 的物料完全拖不动（实测事件序列
`pointerdown → mousedown → dragstart → pointercancel`）。画布根上 `onDragStart → preventDefault()`
一行解决。

### 6.3 帧循环

```ts
// pointermove 只记录坐标
onPointerMove = (e) => { this.pendingPoint = { x: e.clientX, y: e.clientY }; };

// 每个 rAF 最多算一次
private tick = () => {
  if (this.pendingPoint) {
    const p = this.pendingPoint;
    this.pendingPoint = null;
    this.update(p);              // 命中 → 定位 → 更新 overlay
  }
  this.raf = requestAnimationFrame(this.tick);
};
```

`update(p)` 的代价上界：

| 步骤 | 复杂度 | 是否每帧 |
|---|---|---|
| `elementFromPoint` | O(1) | 是 |
| 容器查找（向上走 `closest`） | O(depth) | 是 |
| 子节点矩形 | O(1) 查缓存 | 是 |
| 矩形缓存重建 | O(n) | 否（仅在结构/滚动/resize 变化时） |

**决策 D11：矩形缓存**

```ts
class RectCache {
  private ro = new ResizeObserver(() => this.invalidate());
  private mo = new MutationObserver(() => this.invalidate());
  private map = new Map<string, Rect>();

  prime(doc: Document): void;        // dragstart 时采集一次
  invalidate(): void;                // 滚动 / resize / 结构变化
  get(id: string): Rect | null;      // 命中缓存，缺失才量取
}
```

低代码引擎在每次 `mousemove` 都对所有子节点 `getBoundingClientRect()`，是强制同步布局；这里改为**dragstart 采集一次 + 失效重建**，这是流畅度的关键差异。

### 6.4 定位算法

```ts
interface DropTarget {
  containerId: string;
  index: number;
  position: 'before' | 'after' | 'inside';
  rect: Rect;                 // 指示线/高亮框
  axis: 'x' | 'y';
  valid: boolean;
  reason?: string;
  point: Point;
}

function locate(input: {
  point: Point;
  container: Rect;
  children: Rect[];           // 有序
  axis: 'x' | 'y' | 'auto';
  allowInside: boolean;
}): LocateResult;
```

**主轴（横排 / 竖排）由 CSS 判定，不靠矩形推断**（照引擎 `builtin-simulator/host.ts`）：

- 容器 `display: flex` 且方向 `row | row-reverse`，或 `display: grid` → **x 轴**；
  子节点自身是 inline 级 / float → 同样按 x 轴（对应引擎 `isRowContainer` / `isChildInline`）。
- 只在调用方没给轴（`axis: 'auto'`）时才退回矩形推断（`inferAxis`）。
  **这个兜底在网格里必然失败**：两行三列时 "2、3 相邻同行、3、4 跨行"，
  条件不成立就整片退化成纵向 —— 这是"拖不到元素左右侧"的根因。

规则（按优先级）：

1. 容器内无子节点 → `inside`
2. 指针落在某子节点矩形内 → 该子节点前/后：横向比"到左上角 / 右下角的曼哈顿距离"，
   纵向只比到上/下边的距离（引擎 `isNearAfter` 原式）
3. 贴着容器主轴边缘（阈值 8px） → 强制首位/末尾
4. 不在任何子节点内 → 取**欧氏距离**最近的子节点（引擎 `distanceToRect`）。
   只比主轴坐标的话，网格里指针落在两行之间时上下两行的距离打平，结果会随机偏到上一行
5. `axis: auto` 由子节点矩形推断：同一行 → x 轴，否则 y 轴

**指示线贴着邻近子节点画**（引擎 `insertion.tsx`）：插到它前面就画它的上/左沿，
后面就画它的下/右沿，长度取它的高/宽，粗细 4px、居中压在边上（`-thickness/2`）。
不拉满容器 —— 网格里拉满会画穿两行，看不出插在哪一格；也不锚到"下一个节点"的起始边，
元素之间有间距时线会跑到间距另一头。

**决策 D12：下钻由 `DropContext` 控制，不由 Locator 控制。**

Locator 只回答"在给定容器里放哪"；"要不要继续往子容器里钻"是业务规则（`isContainer`、`nestingRule`、防自嵌套）。这样几何和规则解耦。

### 6.5 合法性校验

在 `DropContext.canAccept()` 集中判断：

- 目标容器是否 `isContainer`
- 目标是否在拖拽节点自身子树内（`node.contains(target)` → 拒绝）
- `nestingRule` 白名单
- `locked` 节点拒绝
- 物料 `dragFilter` 回调

不合法时仍然更新 Overlay，但显示为"禁止"样式（红色/禁止图标），提升可预期性。

### 6.6 Overlay

独立于 React 的 DOM 层（**决策 D13**）：

```ts
class Overlay {
  private root: HTMLElement;   // position:fixed; inset:0; pointer-events:none; z-index:2147483000
  private line: HTMLElement;   // 4px 指示线（横排时是竖线）
  private cover: HTMLElement;  // 容器高亮
  private ghost: HTMLElement;  // 拖拽影像

  update(t: DropTarget | null): void;
}
```

- 全部用 `transform: translate3d()` + `width/height`，不触发 layout
- `contain: strict; will-change: transform;` 独立合成层
- **直接写 DOM style，不经过框架 state**（低代码引擎走 mobx observer 重渲染，每次 move 都在调度 React）

拖拽影像（ghost）：dragstart 时 `cloneNode(true)` 一次，去除 `data-node-id`，固定尺寸，`opacity: .7`，之后只改 transform。物料拖入时降级为"标签 chip"（组件名 + 图标），避免每次克隆。

`position: fixed` + 屏幕坐标 = **不需要处理画布缩放/滚动的坐标换算**（v1 无缩放）。v2 引入缩放时在此处一次性转换。

### 6.7 自动滚动

```ts
class AutoScroller {
  update(point: Point, viewport: Rect): void;  // 每帧调用
  stop(): void;
}
```

- 边缘 48px 触发，速度二次曲线（越靠边越快，最大 20px/帧）
- 用 `scrollTop += v` 直接滚，不用 smooth
- 滚动后调用 `rectCache.invalidate()`

### 6.8 公共 API

```ts
interface DragManagerOptions {
  root: () => HTMLElement;                 // 画布根元素
  context: DropContext;
  threshold?: number;                      // 默认 4
  overlay?: OverlayMode;                   // 'line' | 'cover' | 'both'
}

interface DragManager {
  start(payload: DragPayload, e: PointerEvent): void;
  cancel(): void;
  on<E extends DragEventName>(name: E, cb: (e: DragEventMap[E]) => void): () => void;
  readonly state: DragState;
  dispose(): void;
}

type DragPayload =
  | { type: 'node'; ids: string[]; source: 'canvas' }
  | { type: 'material'; componentName: string; snippet?: NodeSchema };
```

事件：`dragstart` / `drag` / `dragend({ target })` / `cancel`。

---

## 7. 设计器集成

### 7.1 数据流

```
pointerdown(物料面板/画布节点)
    → drag.start(payload, e)
    → [rAF] dropContext.resolve(point, payload) → DropTarget
    → overlay.update(target)
pointerup
    → command = buildCommand(payload, target)
    → document.apply(command)
    → renderer 重渲染（只有变化的子树）
```

### 7.2 DropContext 实现（designer 侧）

```ts
class DesignerDropContext implements DropContext {
  resolve(point: Point, payload: DragPayload): DropTarget | null {
    const hit = nodeAt(point, this.root());
    if (!hit) return null;
    let container = this.findAcceptableContainer(hit.id, payload);
    if (!container) return null;
    const rects = this.childrenRects(container.id);      // RectCache
    const result = locate({ point, container: rectOf(container), children: rects, axis: 'auto' });
    return { containerId: container.id, ...result, valid: this.canAccept(payload, container) };
  }
}
```

### 7.3 iframe 画布（已落地，对齐 lowcode-engine）

原计划 v1 用同文档 + CSS 隔离、v2 才上 iframe；实际迁移提前完成（对齐调研结论：
大厂低代码画布一律 iframe 而非 Shadow DOM —— shadow 隔离不了 `@media` 断点，
弹层蒙版也会逃逸出 shadow root）。样式污染、滚动、`@media` 全部真实隔离。

三条通道的划分（Designer 的桥接 effect + canvas.tsx 渲染入口）：

| 通道 | 机制 | 说明 |
|---|---|---|
| schema 同步 | `postMessage('lc:schema')` | 文档变化全量推给画布入口，画布里整树重渲染（D14 同粒度，消息天然全量） |
| 画布事件 | 同源直挂 | React 合成事件到不了 frame，pointerdown / pointerover / keydown / scroll 直接挂 iframe document |
| 拖拽 | DragManager 跨文档 | `docs: Set<Document>` 同时挂宿主 + 画布两个文档收 move/up/keydown，坐标天然是各自视口坐标，与画布内量的矩形自洽 |

选中 / 悬停边框与浮动工具条仍画在**宿主**的覆盖层里（`.canvasOverlay`，
`pointer-events: none` 盖在 iframe 上），矩形用 `rectToHost` 做跨 frame 换算
（iframe 视口原点 = `iframeRect.left + clientLeft`）。

跨 realm 的三个坑（都踩过）：

1. **`instanceof` 恒 false**：iframe 元素对宿主的 `HTMLElement / Element` 判断一律
   失败，鸭子类型（`'querySelector' in target`）+ 直接断言；`getComputedStyle`
   要用 `el.ownerDocument.defaultView` 的那份。
2. **点击进 iframe 宿主 window 收 blur**：pointerdown 的默认行为把焦点转移给子
   frame，宿主 window 的 blur 兜底会立刻 cancel 掉刚起拖的画布内拖拽。修法：
   blur 时任一参与文档仍 `hasFocus()` 就不算中断（真正切走窗口时所有文档同时
   失焦才 cancel）。
3. **坐标系错配**：指针拖出 frame 边界后事件落在宿主文档，宿主坐标数值上可能
   落进画布那份高大的矩形里，`containsPoint` 误命中 + `nodeAt` 视口外 miss
   会退化到根容器，节点被"拖出画布外松手 → 挪到页面根"。修法：resolve 先做
   画布视口范围守卫，范围外直接返回 null（语义 = 还没拖进画布）。

### 7.4 框架无关性检查

| 组件 | 框架耦合（按当前代码实测） |
|---|---|
| protocol / model / drag | 否（`drag` 甚至零依赖） |
| Evaluator / `IRNode` / `Driver` 接口 / 物料 meta | 否（纯 TS） |
| `@lowcode-next/renderer` **包整体** | **是**：`react` 写在 `dependencies`，并导出 20 个 React 物料与 `ReactDriver` |
| designer UI | 是（React 19 + shadcn/Radix/Monaco），但只 type-import registry 的 `getMeta` / `has` / `list` |

**编辑态拖拽只依赖 `data-node-id` + `getBoundingClientRect`，因此 Vue 页面作为被拖拽内容时，同一套引擎直接可用。** 但要注意：「ReactDriver 是唯一框架相关层」只在**逻辑边界**上成立，在**包依赖**上不成立 —— 现状只要 import 求值器就会被拉进 React。拆包方案与完整契约见 **§12**；本节表格在 §12 落地后需再次更新。

### 7.4.1 画布高亮：独立边框层

画布上的框有两种含义，靠**线型**区分，不靠颜色深浅：

| 状态 | 标记 | 线 | 出现时机 |
|---|---|---|---|
| hover（detecting） | `data-hovered` | 1px 虚线 `#006cff` + `rgba(0,108,255,.04)` 底 | 鼠标扫过画布节点，或悬停大纲树行 / 浮窗祖先列表 |
| 选中（selected） | `data-selected` | 2px 实线 `#006cff` + `rgba(0,108,255,.09)` 底 | 点击画布节点或大纲树行 |

选中态那层底色是**对引擎的一处有意偏离**（`borders.less` 的 selecting 只有边框）。
引擎的框长在画布坐标系里、节点名和动作条画在框左上角，框被裁一半也认得出；这边的
工具条是 `fixed` 层，选中的又常是「区块」这种比画布可视区还高的节点：左边框被浮动面板
压住、上/下沿在视口外，只剩一条贴着画布右缘的竖线 —— 看上去像根本没选中。底色把选区
铺满，框在不在都看得见（也顺带解释了"从层级里选到区块，选中态的底就没了"：底色原本
只挂在 hover 上，选中后 hover 被清掉，就真的一点视觉都不剩）。

底色取 **9%** 而不是 6%：`lc-section--muted` 这类区块自带浅灰底（`#f7f8fa`），
6% 的蓝叠上去和原图几乎没差，仍然读不出来。9% 比 hover 的 4% 深一档，刚好能一眼
分辨"选中"和"悬停"，又不至于把内容压住。

**框由 `SelectionBorders` 这一层绝对定位的 div 画，不给节点加 `outline`。**

这不是风格问题，是可见性问题。`outline` 画在元素**外侧**（`outline-offset: 1px`），
而画布容器 `.canvas` 为了裁圆角是 `overflow: hidden`。页面根节点、导航栏顶部这些
贴着画布边缘的节点，四周的框线会被整条切掉 —— 表现是"点了、状态栏也显示已选，
但画布上什么都没有"。

引擎的做法（`bem-tools/border-selecting.tsx` + `borders.less`）是画一层独立元素：

```tsx
<div className="lc-borders lc-borders-selecting" style={{ width, height, transform: translate3d(x, y, 0) }} />
```
```less
.lc-borders { position: absolute; pointer-events: none; z-index: 1; border: 1px solid; box-sizing: border-box; }
.lc-borders-detecting { border-style: dashed; background: rgba(0,121,242,.04); }
.lc-borders-selecting { z-index: 2; border-width: 2px; }
```

边框画在自己盒子**内部**（`box-sizing: border-box`），尺寸等于目标元素，
所以祖先怎么裁都裁不到，也不会被目标元素的子节点盖住。本项目的实现照此：

| 项 | 取值 |
|---|---|
| 层 | `.borders`（`position: absolute; z-index: 5; pointer-events: none`），`SelectionBorders` 渲染 |
| 定位 | 相对 `.canvasRoot`；`x = rect.left - hostRect.left - host.clientLeft`（absolute 原点是 padding box） |
| 尺寸 | `width/height` + `transform: translate3d()`，只动合成层，不触发重排 |
| 更新时机 | 选区 / hover 变化 → `useLayoutEffect` **同步**重测一次（换节点要当帧画对）；**滚动（capture）同步重测 + 同步直接写 `transform`**；resize、`ResizeObserver`（容器 + 目标）、`MutationObserver`（结构 / class / style）走 rAF 合并；**CSS 过渡 / 动画期间按帧跟随**（`followTransitions`） |
| 取元素 | **每次 `sync` 重新 `querySelector`**，不缓存元素引用。选中没变但元素被 React 重建（改样式导致重挂、撤销后整棵子树重渲染）时 effect 不会重跑，抓死的旧引用已经脱离文档，量出来是 0×0 —— 就是"有时候选中框没了" |
| 防抖 | 除滚动外都用 rAF 合并；测量只读布局，值不变不 `setState`，否则 MutationObserver 会和自己的 style 变化互相触发 |
| 过渡 | **没有** `width/height` 过渡（引擎也没有）。`transform` 不过渡而尺寸过渡，换选中节点时就会"位置先跳、框再长大"，是可见的闪烁 |

**滚动不能过 rAF**（§7.4.1 实测）：内容在 iframe 的合成层里滚完并绘制，边框层却
画在宿主文档。`scroll → rAF → sync → setState` 要等下一帧才把 transform 写上去，
实测每帧滚 10px 时框**恒差 10px**（整整慢一帧）；滚轮惯性下步长忽大忽小，这个差值
来回变就是「虚线框抖得厉害」。现在 scroll 事件里同步量、同步写 `style`（state 同步
跟进，避免后续重渲染用旧值盖回去），同一实测偏差 10px → 0。`FloatToolbar` 是同一条
链路，一并同步化；其余触发器仍走 rAF 合并，避免一帧多算。滚动时鼠标下的组件会变，
虚线框跳到新组件是预期语义，不是抖动。

`data-selected` / `data-hovered` 仍然写在 DOM 上 —— 供自动化测试、调试和
"选中元素同时也是 hover 元素时只画选中框"这一判断用，但不再承载视觉。

**跟随 CSS 过渡**（`dom.ts` 的 `followTransitions`）：物料的 hover 动效会连续移动
节点矩形 —— `.lc-feature:hover { transform: translateY(-2px); transition: transform .18s }`。
这类位移不产生 scroll、不产生 resize，也不改 class / style 属性，上面四个触发器一个都
不响：鼠标移到选中的卡片上，卡上浮 2px，框钉在原地，看起来就是"背景没跟上"。所以凡是
画布内出现 `transitionrun / transitionend / animationend`，就按帧测量，`transitionend`
之后再采 260ms 收尾（260 > 最长的 180ms 动效），平时一帧都不多采。工具条用的是同一个
helper —— 它也必须跟着动，否则 `bar` 的矩形和节点的矩形差了 2px，层级面板会在鼠标底下
歪一下。

画布自身的 hover 走 `onPointerOver` → `nodeAt` → `selection.hover(id)`；
`hover()` 是幂等的（id 没变直接 return），所以高频冒泡不会引起重渲染。

**选中即滚进视野**（`revealNode`，对齐引擎 `activeTracker.onChange → simulator.scrollToNode`）：
选区一变就把节点滚进画布可视区；判据是「看得见一半以上就不动」，不到一半才滚到上沿对齐
（留 12px），比视口还高的节点按视口高度算，选中整页时不会被拽走。没有这一步，点大纲里
视野外的节点，画布原地不动、框和工具条全在视口之外 —— 表现就是"点了没选中"，而同一个
操作在视野内又一切正常，于是成了"有时候"。

**选中会顺手清掉 hover**：选中是一次"确认"动作，hover 到此为止。不清的话，从层级面板 /
大纲 / 面包屑点选后，那条虚线框会停在原来的节点上，和新的选中框同时存在 —— 选中大区块时
就是"区块里残留一小块虚线加淡蓝底"。之后由画布的 `pointerover` 重新建立。

**悬停「页面」（含根节点的容器）画可视区框，不画真实矩形**（引擎 `border-detecting.tsx`
的 `current.contains(focusNode)` 分支，照搬）。页面根节点的真实矩形是一整幅落地页
（示例页高 2865px）：上下边在视口之外、左边被浮动面板压住，只剩一条贴着画布右缘的
1px 虚线 —— 大纲里悬停"页面"行，画布上什么也看不出来。引擎对这种节点直接画
`DOMRect(0, 0, bounds.width, bounds.height)`，即整个可视区的虚线框，滚动时框永远
贴着画布可视边缘。这里实现为**与真实矩形取交集**：页面比视口矮时仍画它自己的框，
比引擎的无条件画满更稳一点。同类的"区块"节点（高 538~795px）居中滚动后整体可见，
仍然画真实矩形，不在此分支内。

可视区还要再扣掉 `[data-lc-overlay]`（左悬浮面板）的矩形：悬浮模式下面板压在画布
左缘上（面板 49..349，画布从 65 开始），框的左边整条画在面板底下 —— 用户看到的就是
"虚线被遮挡了三边"。扣掉之后框贴着**真正看得见的画布**画，左边正好齐着面板右缘。
引擎的悬浮 dock 有同样的几何重叠，但它没有处理 —— 这里算一处超出引擎的修正。固定
（占位）模式面板不与画布重叠，`data-lc-overlay` 不在文档里，扣减自然为空操作。

**贴画布裁剪边的框线往里收 1px**（`fitInsideClip`）。描边画在盒子内部（border-box），
框贴着 `.canvas`（overflow: hidden）边缘时，那条线正好落在合成层的最后一像素上 ——
真 Chrome 的 GPU 栅格化会把它**整条切掉**：区块 / 页面的右边虚线消失（左边那条却在，
取决于图层设备尺寸的小数部分，呈不对称性）。无头浏览器 / 软件渲染不复现，自动化
截图测试测不出来，是靠有头 Chrome + 设备像素扫描定位的。收 1px 肉眼无感，只收
「贴边」的边 —— 画布中间的框保持像素对齐。

滚动动作放在**选区订阅回调**里（同步、早于这次渲染），这样渲染时的测量拿到的已经是
滚动后的坐标，框不会先错一帧再纠正；元素还没挂上（拖入物料刚 `select`）时等一帧重试。

### 7.5 选中浮动工具条

画布上的高亮框只回答"选中了哪块"，不回答"它在树里的第几层"。所以选中态还要一条工具条
（`FloatToolbar`），**形态、尺寸、色值全部照搬 lowcode-engine，不做二次设计**：

| 元素 | 尺寸 / 颜色 | 引擎出处 |
|---|---|---|
| 工具条容器 | 高 20，`flex-direction: row-reverse` | `bem-tools/borders.less` `.lc-borders-actions` |
| 动作按钮 | 20×20，底色 `#006cff`，hover `#197aff` | 同上 `.lc-borders-action` |
| 节点标题 | 高 20、左右 padding 6、圆角 3、白字 | `node-selector/index.less` `-current` |
| 祖先列表 | 行盒高 22（内含 20 高的胶囊 + 2px 上内边距），底色 `rgba(44,47,51,.8)`，圆角 3 | 同上 `-node-content` |
| 图标 | 16×16，与文字间距 5 | 同上 `svg` 规则 |

定位对应 `border-selecting.tsx` 的 Toolbar：条高 20 + 间隙 1 + 选中框线 2 = 23，
工具条落在节点外 3px；节点上沿放不下就翻到下方，上下都没有就压进节点；
右边界对齐节点右边界，节点右边界不足 160px 改贴左边界（引擎的 `SPACE_MINIMUM_WIDTH`）。

**落位分四档，不能用一个 `clamp` 糊过去**（`placeFloatBar`）：

| 档 | 条件 | 落点 |
|---|---|---|
| 上方 | `anchor.y - 23 >= 画布顶` | 节点上沿外 23px |
| 下方 | 节点底部 + 23 在画布内 | 节点下沿外 3px |
| 框内 | 节点上沿还在画布内（上下都不够） | `anchor.y + 3`，贴着 2px 边线的**内壁** |
| 钉顶 | 节点上沿已滚出画布 | 画布顶 + 1px |

第三档是这条规则里唯一容易写错的地方：早期把"上方"的结果直接 `clamp` 到画布顶，
选中「区块」时工具条正好落在 `y = 画布顶 + 1 = 49`，高 20，**盖住的恰恰是选区上边框**
（`y = 60`）。加上下沿在视口外、左边框被浮动面板压住，四边里就剩右边一条淡竖线 ——
"选了区块，但没有任何选中效果"。现在框内那一档从 `anchor.y + 3` 起，条的上沿贴着
边线内壁，边框完整露出来。

第四档只在节点上沿滚出可视区时命中，此时框的顶边本来就在屏外，钉在画布顶不会压到线。

```
 ┌ 标题在最左、动作在右（DOM 顺序相反，靠 row-reverse 翻） ────────┐
 │ [▣ 堆叠] │ 🔒 📋 🗑                                            │
 └────────────────────────────────────────────────────────────────┘
        │ 鼠标移上标题
        ▼
    ┌ 父级 → 页面（由近及远，最多 5 层）┐
    │ [▣ 堆叠]  │  ← 悬停：画布虚线高亮
    │ [▣ 首屏]  │
    │ [▣ 页面]  │  ← 点击：跳级选中
    └───────────┘
```

面板挂在工具条**下方**（引擎的 Fusion Popup 默认就是向下对齐），所以第一行紧贴工具条、
天然是最近的父级 —— 引擎那份「由近及远」的祖先顺序可以直接用，不需要为落位再排序。

三条约束：

1. **层级是纯函数算的**（`hierarchy.ts`）：`buildHierarchy` 给出根→当前的链路
   （深度、兄弟序号、容器标记），`parentChain` 按引擎 `getParentNodes` 的顺序取祖先
   （父级 → 祖父，最多 5 层）。只吃节点结构字段，可以用普通对象单测 —— 不为了测
   一行缩进去起 Document。
2. **定位是纯函数算的**（`float-bar.ts`）：`placeFloatBar` 算工具条、`placePopup`
   算面板（**优先向下**，下方放不下才翻向上；上下都放不下就钉在下方并夹进视口）。
   工具条用 `position: fixed` + 屏幕坐标，不会被 `.canvas` 的 `overflow: hidden`
   裁掉，也不参与文档流。
3. **只在边缘事件上掺和 React**：拖拽的每帧照旧不碰渲染；但起拖/结束要
   `visibility: hidden` 把工具条藏起来 —— 它是 fixed 层，会让
   `elementFromPoint` 命中不到下面的节点，落点会静默失效。
4. **节点滚出视野就不画**（`anchorOnScreen`）：引擎的条长在画布坐标系里，节点滚走时
   它是"跟着滚走"的。这边是 fixed，不判断就会把条夹到视口边缘，变成一个浮在无关
   内容上的小条 —— 比不显示更让人以为是 bug。判据只有一条：和视口有没有交集。
   **不能连"上沿在视口之上"也判掉**：选「区块」这种比画布还高的节点时，它的上沿经常
   刚好压在视口上方（`revealNode` 只在看得见不到一半时才滚），此时工具条是唯一能确认
   "选中了谁、怎么往上跳"的入口，藏掉之后画布上什么都不剩。
5. **只在画布范围内落位**（`placeFloatBar` 的 `bounds`）：`canvasRoot` 的最近可滚动
   祖先就是 `.canvasStage`，把它的屏幕矩形传进去，`clamp` 的上下界从「整屏」收窄到
   「画布」。节点贴着画布顶时条会被压到画布顶部（贴节点上沿内侧），而不是翻到节点
   底部 —— 后者会让条跑到离节点顶部几百像素外的地方，还压着页脚。顺带解决了条
   飘到应用顶栏上的问题。

`复制` 走 `cloneNodeSchema`（整棵子树重建 id，否则会顶掉原节点），`删除` / `锁定`
走 `RemoveNode` / `SetFlag`，都进历史栈。祖先列表 hover 走 `selection.hover` →
画布虚线高亮，点击跳级选中并**直接跳位**（不做平滑滚动：工具条是 `fixed` + 每帧重测
跟随，滚动动画期间会跟不齐，看起来像在抖）。

面板的开关状态存的是**打开时那个节点的 id**（`openId === selectedId` 才算开着），
不是一个 boolean。选区是外部 store，`select()` 会同步通知，若先提交了"选中变化"
的渲染、再提交"关面板"，中间就会画出一帧"条已跳到新节点、祖先列表还挂在旧位置"
— 点层级跳级时的那下闪烁就是这么来的。用 id 推导后，选中一变面板同帧消失。

hover 视觉照引擎来：行 hover 只把整行降到 `opacity: .8`（深色底 `-node-content` 不变），
真正的反馈交给画布虚线框和大纲树对应的那行；工具条标题（chip）hover 时底色提到
`--color-brand-light` `#197aff`，和动作按钮 hover 同色 —— 引擎在容器 hover 里换的是标题
文字色，这里换成底色，在深色画布上更容易被看见。

#### 7.5.1 "点了没反应 / 选中底没了"的三个成因

这一片的毛病反复出现过几次，最后定位到三件**互不相干**的事，都由"动效让矩形在动"
串起来：

1. **面板行的命中区被 2px 间距切碎。** 引擎写的是 `margin-top: 2px` + `height: 20`，
   视觉上没错，但行与行之间那 2px 点不到；行只有 20px 高，鼠标又在行间移动，落点差
   一像素就掉进缝隙 —— 表现是"连点几次都不切换"。改成**行盒 22 + 上内边距 2**：
   胶囊仍是 20、间距仍是 2、面板总高不变，但命中区连成一片。
2. **用 `click` 触发跳级。** 选中节点的矩形会被动效连续改变，工具条要跟着重测，
   面板随之整体位移 1~2px。`click` 要求按下和抬起落在同一个元素上，一滑就什么都不
   发生。改为 `onPointerDown` —— 按下那一刻的判定才是用户的真实意图，顺便
   `preventDefault()` 吃掉随后的 click，避免穿透到画布。
3. **画布的 `pointerover` 把面板当成画布内容。** 工具条和面板是 `canvasRoot` 的子元素，
   指针在上面走动时 `nodeAt` 命中面板自己（没有 `data-node-id`）→ `hover(null)`：
   悬停祖先行的虚线预览刚亮就被自己清掉，而且每进一行都白白重渲染整棵树 ——
   重渲染要重新测量工具条，面板于是在鼠标底下微动。现在 `handleCanvasPointerOver`
   先看 `event.target.closest('[data-lc-float]')`，命中编辑 UI 直接返回。

3 的病根是"重渲染"，1、2 的病根是"像素级的位移"，两者叠加才让点击稳定落空：
单看哪个都不像 bug。顺带一条正面结论：**测量类 UI 必须跟着 CSS 过渡走**，
见 §7.4.1 的 `followTransitions`。

两处与引擎的有意差异：根节点不挂工具条（它的条会落到页面顶边之外）；没有 `hide`
动作（物料没有模态概念，引擎也只在 `isModal` 时才给这个按钮）。

### 7.6 左栏面板的装载方式：悬浮 / 占位（照 lowcode 的 float / fixed）

lowcode 的左栏有两块区域：`leftFloatArea`（悬浮）和 `leftFixedArea`（占位）。
面板可以在两者之间搬，`skeleton.toggleFloatStatus()` 就是这个动作：

```ts
const isFloat = panel?.parent?.name === 'leftFloatArea';
if (isFloat) { leftFloatArea.remove(panel); leftFixedArea.add(panel); ... }
else         { leftFixedArea.remove(panel); leftFloatArea.add(panel); ... }
preference.set(`${panel.name}-pinned-status-isFloat`, !isFloat);
```

**默认是悬浮**：`plugin-outline-pane/src/index.tsx` 里 `let isInFloatArea = true`，
只有偏好里存了值才会变成占位。本项目照搬这一条 —— 新用户第一眼看到的浮层，
和引擎里打开面板时一样。

| 状态 | 装载方式 | 布局 | 切换方式 |
|---|---|---|---|
| 悬浮（默认） | `leftFloatArea` | 栅格左列 49（只剩图标栏），面板 `position: absolute`、宽 300，盖在画布上 | 点页头图钉 → 占位 |
| 固定 | `leftFixedArea` | 栅格左列 349（图标栏 49 + 面板 300），画布让位 | 点页头图钉 → 悬浮 |

宽度直接对齐 lowcode `workbench.less`：`--left-area-width: 48px` + `--dock-pane-width: 300px`
（引擎里悬浮的 `--dock-pane-width` 与占位的 `--dock-fixed-pane-width` 默认同为 300，这里合并成一个变量）。
引擎在 1860 以上会放大到 452 / 350，那是给代码编辑类面板留的 —— 本项目的树 / 物料都是窄列内容，
放大只剩留白，所以不跟进，统一 300。实现里对应 `--rail-width: 49px`
（48 图标栏 + 1px 面板右边框，与引擎浮层的 `left: calc(48px + 1px)` 同一个口径）。

**图标栏本身**（`ActivityRail`，对应引擎 `leftArea` 的 `.lc-title`）：

**切换无动效**：引擎固定 / 悬浮是两块独立区域各自渲染，切换是瞬切，没有任何
过渡。栅格的 `grid-template-columns` 因此**不加 transition**（加了会变成画布
宽度滑一下，比瞬切更晃眼），浮层出现 / 消失也不做淡入 —— 与引擎逐帧一致。

**全局 tooltip**（`Tooltip.tsx`）：原生 `title` 的延迟（约 1s）和系统样式
（Windows 黄底方块）与界面不搭，引擎用的是 `@alifd/next` 深色 Balloon。这里
在根上挂一个 `TitleTooltip` 监听接管全树的 `title`：悬停 300ms 后在目标下方
（放不下翻上方）弹深色小气泡（12px 白字、圆角 4、小箭头指回目标中心，水平
clamp 进视口），期间把 `title` 暂存摘掉（否则原生提示还会弹），离开时原样
放回。滚动 / 缩放跟随，点击即收，键盘 Tab 聚焦也提示 —— 全项目 40 多处
`title=` 一次升级，无需逐个包组件。

| 项 | 取值 |
|---|---|
| 栏 | 宽 48、背景 `#fafbfc`、顶部留白 12、项间距 0 |
| 每个入口 | 46×46 无圆角（栏宽 48 减两侧各 1px），图标 20×20，命中区沿栏连续 |
| 未激活 | 图标 `#4e5969`（引擎给的是正文色 `--color-text`，不是浅灰） |
| hover | 只把图标提到 `#1f2329`，**不铺底色** |
| 激活 | 只染品牌色 `#006cff`，**无底色块、无左侧指示条**（引擎 `.lc-title.actived` 只有一句 `color`）；语义是"这个面板正在显示"，**面板收起时一个入口都不高亮** |
| 图标形状 | 大纲 `ListTree`、组件库 `LayoutGrid`（lucide，线性 24 视窗） |

入口图标原先一个贴引擎 path（1024 视窗实心）、一个照观感自绘四宫格。两个摆在
一起还算齐，但和面板里后加的线性图标（树箭头、眼睛、锁、铅笔）不是一个体系，
20px 下实心与描边混排会一重一轻 —— 现在整栏与面板内全部走 lucide。

底色块 + 左侧竖条是 VSCode 活动栏的做法，放在 48px 的窄栏里会变成一排"按钮块"，
把图标的层级感压掉 —— 所以这一栏的反馈全部交给颜色。

实现落点：

- `DesignerShell` 吃 `leftOpen`（占位 / 只留图标栏）与 `floatPane`（悬浮层节点）。
  `.body` 是 `position: relative` 的栅格，`--left-width` 默认
  `calc(var(--rail-width) + var(--dock-pane-width))`（49 + 300 = 349），收起时由行内样式退回
  `var(--rail-width)`；悬浮层 `left: var(--rail-width); top: 0; bottom: 0;
  width: var(--dock-pane-width); z-index: 15`，
  阴影只往右侧打（`10px 0 24px rgba(31,56,88,.12)`），进场面做 160ms 的横向淡入。
  宽度只在 `.body` 里维护一份，改口径不用翻 JSX。
- `Designer` 把面板内容写成**一份** `pane`，按状态放进 `left` 或 `floatPane`；
  两种装载互斥，所以不会出现两个面板实例。
- 偏好写 localStorage（`lowcode-next:left-fixed`，`'1'` = 固定），刷新后保持；空值即悬浮。
- 「关闭」= `paneOpen = false`，图标栏还在；**点图标栏当前那个图标**即可收起，
  再点一次打开，点其它图标则直接切面板 —— 对应 lowcode `PanelDock` 的开合，
  而不是"点画布收起"（引擎里点画布不影响浮层面板）。
- **`paneOpen` 默认 `false`（收起）**：引擎默认展开是演示取向；真实项目里首屏
  应该留给画布，结构树属于"要用再开"的面板。悬浮 / 固定装载仍由图钉切换。
- 高亮来自 `active={paneOpen ? leftTab : null}`：面板收起时整栏没有高亮项。
  默认收起 + 高亮只跟 `leftTab` 会得到"面板是关的、大纲图标却亮着"，看不出
  点开的是哪一栏。

**图钉图标画的是"点下去会变成什么"，不是当前状态**（`panel-operation-row.tsx`）：

```tsx
{areaName === 'leftFloatArea' ? <IconFix /> : <IconFloat />}
```

- 悬浮时显示**图钉**（`IconFix`）—— 点它把面板钉住；
- 固定时显示**划了斜线的图钉**（`IconFloat`）—— 点它把面板放回悬浮。

两个图标直接取 `editor-skeleton/src/icons/fix.tsx|float.tsx` 的 path（实心、13 见方）。
固定态**不染品牌色**：这对图形本身已经是反义词，再叠高亮反而看不出"点下去是什么"。

页头是统一的 `PaneHeader`（34 高）：标题吃剩余宽度，右侧依次是面板自己的工具
（大纲树的「全部展开 / 收起」图标）、图钉、关闭；三个按钮 22 见方、组内 2px、组间 6px。

---

### 7.7 大纲树面板

大纲树是左栏第一个入口，也是默认面板 —— 定位、跳级、看结构比"再拖一个物料"更高频。
**交互对齐 lowcode 的 `plugin-outline-pane`**：点选中、双击展收整棵子树、hover 联动画布虚线、
行内四个动作（隐藏 / 锁定 / 重命名 / 删除）、选中自动展开祖先并滚进可视区，视觉按**标准树组件**重做。

| 交互 | 触发 | 说明 |
|---|---|---|
| 选中 | 单击行 | 同步画布选中态，并展开祖先、滚进可视区 |
| 初始态 | 面板首次出现 | **只摊开第一层**：除根节点外的容器全部收起（`collapsedByDefault`），和点一次「全部收起」等价；换文档（切页面 / 重载 schema）时回到这个状态，同一会话里不动 |
| 展收子树 | **双击行** | 已展开则收起该节点及其全部子孙，否则全部展开（`expandAllDecendants / collapseAllDecendants`）；只切一层的入口是行首箭头和 ← / → |
| 定位画布 | Enter | 引擎里选中即滚动画布，这里保留 Enter 作为显式入口（双击已让给展收） |
| 重命名 | 行尾铅笔 / **F2** | 内联输入，**Enter 保存、Esc 取消、失焦保存**；进入即全选 |
| 删除 | 行尾垃圾桶 | `RemoveNode` 命令，可 Ctrl+Z 撤销；选区若在被删子树里则回落到父节点 |
| 隐藏 / 锁定 | 行尾眼睛 / 锁 | `SetFlag` 命令 |
| **拖拽排序** | 按住行拖动（阈值 4px） | 见下；提交 `MoveNode`，进历史 |

**拖拽排序**复刻引擎 `plugin-outline-pane` 的落点规则（`pane-controller` 的
`getNear` / `drillLocate`），在树内自绘指针拖拽（不接画布的 DragManager）：

- **行上半** → 插到该行之前（同父级）；**行下半** → 若该节点是**已展开的容器**
  则落到它子列表**末尾**（drillLocate 的容器末位分支，语义是"成为最后一个孩子"），
  否则插到该行之后；
- 悬停在**未展开的容器行**上 500ms 自动摊开它（引擎 `DwellTimer`），展开后落点
  自动变成"追加为子节点"；
- 拖到**自己的子树**里是非法落点（`checkRecursion`）：插入线照样显示但标红
  （`#f53f3f` 虚线），松手不提交；根节点不可拖、锁定节点不可拖、搜索态不起拖；
- 插入线是**一个行高的虚线占位块**（引擎 `.insertion`：品牌色虚线框 + 微底色），
  不是 1px 横线 —— 它会撑开列表，松手后节点就落在这块空白的位置，落点与结果一一对应；
- index 按"**移除被拖节点之后**"的坐标换算（`MoveNode` 先 remove 再 insert，
  同容器后移要扣掉自己占的一格）；换算后与原位相同 = 没动，不画线也不提交；
- 拖拽中的行 `opacity: .4`、树光标 `grabbing`；拖到树上 / 下边缘 24px 内自动滚动；
  Esc / pointercancel / 失焦取消。

默认折叠是**对引擎的一处有意偏离**（`plugin-outline-pane` 是全展开）：这页展开后 93 行，
一进来就是一片，而大纲的第一步是"找到某个节点"，铺开反而要先滚。根节点保持展开 ——
连根都收起只剩一行「页面」，看起来像树没加载出来。搜索态仍然强制展开（命中项藏在
折叠里等于搜不到），画布选中深层节点时也会自动展开它的祖先，两者都不受默认态影响。

重命名写的是 `schema.title`（与 lowcode 的 `NodeSchema.title` 同义），不是物料 `meta.title`：
前者是"这个节点叫什么"，后者是"这类组件叫什么"。落点比引擎更实一层 ——
引擎把 label 存在大纲 controller 里，刷新即丢；这里进文档、进历史、能随页面序列化
（`SetTitle`，`title` 为空则删键，大纲回落到 `meta.title`）。

第一版照抄了引擎的行样式（30 高 + 通宽分隔线 + 右侧常驻摘要），结果整块看着像
**手风琴列表**：每一层都是等高的横条，层级只能靠右移几像素去猜。这一版把"列表感"去掉：

| 元素 | 取值 | 说明 |
|---|---|---|
| 行 | 高 26、**无分隔线**、字号 12 | 行与行靠 hover / 选中底色切分，不再切成一格一格 |
| 层级步长 | 每深一层 16，根节点 6 的行首内边距 | 步长比列表类组件大，层级差才看得出来 |
| 分支参考线 | 每层 6px 处 1px 竖线，**常驻**（`#edeff3`），进树加深（`#e2e6ec`），选中分支转 `#b9d4ff` | 静态就能看出"谁是谁的孩子"，这是树与列表最直观的分界 |
| 展开箭头 | 12×12，收起 `rotate(-90deg)`、展开 `rotate(0)`，过渡 120ms | 收起时向右，是树控件的惯例 |
| 节点图标 | 16×16，`rgba(31,56,88,.45)`；选中转品牌色 | |
| 选中 / 检测 | 底色 `rgba(0,108,255,.08)` + 文字 `#006cff` / 底色 `rgba(31,56,88,.045)` | 品牌色块表达"当前节点"，不是"展开的那一节" |
| 行内动作 | 22 见方 ×4（隐藏 / 锁定 / 重命名 / 删除），默认 `opacity: 0` → 行 hover `.5` → 按钮 hover `1`；已隐藏/已锁定的那个常亮 `.8`；删除按钮 hover 转红 `#e34d59` | 常驻占位只改透明度，hover 不会引起文字跳动；**选中不常驻**（引擎亦如此），编辑态整组 `display: none`，避免点歪把节点删了 |
| 重命名输入框 | 高 22、`1px #006cff` 边框 + 2px 光环、字重同正文 | 尺寸照引擎 `.tree-node-title-input`，但撑满名字栏（长度不写死，长名字也看得全） |
| ~~内容摘要~~ | **已移除** | 它参与 `max-content` 计算，会让本来放得下的名字把行撑宽、无端冒出横向滚动条；完整文案由行的 `title` 承载 |

关键的一条是**行盒几何**（`tree-layout.ts`）：

```
paddingLeft: depth * 16            // 内容停在第 depth 层
marginLeft: -(depth * 16)          // 盒子往左伸回树左边界
```

两者相抵，内容位置不变而盒子变成整行宽，于是 hover / 选中的底色横贯面板，
深层的行也不会越缩越窄（旧实现用嵌套 `margin-left` 做缩进，第 6 层只剩一半宽）。
行首那 6px **只给根节点**：非根节点若是也加，内容会比竖参考线越偏越多，最后压到箭头上。

`rowBox(depth)` / `contentLeft(depth)` 是纯函数，单测直接断言"内容落点恒为 `depth * 16`"，
以及"参考线落在父级箭头列里、与子级内容之间留出 ≥8px"。

**横向滚动**（对应引擎 `.lc-outline-tree` 的 `overflow-x: scroll`）：

面板 300px 宽（lowcode `--dock-pane-width`），深层节点 `depth * 16` 的缩进加上展开箭头 / 图标 / 行内动作（38 + 44）
之后，留给名字的宽度不到 50px，稍长的命名就放不下。所以名字**不再用省略号截断**，
而是允许横向滚动 —— 与引擎的做法一致（`white-space: nowrap` + 容器横向滚动），
但多了一步：**整棵树按最宽的一行定宽**，避免"滚过去只剩那一行、其余全空"。

```
.tree       { overflow: auto }                       /* 横 / 纵都在这里滚 */
.treeInner  { width: max-content; min-width: 100% }  /* 宽度 = 最宽那行的内容宽度 */
.row        { width: calc(100% + var(--row-indent)) } /* 补回缩进，左右缘对齐到定宽层 */
```

`--row-indent`（`depth * 16`）由渲染时连同 `rowBox(depth)` 一起写进行内样式。
行的 `margin-left: -indent` 把它推到树的左边界，所以宽度必须补回同样的量，
右缘才能落回定宽层的右缘 —— 于是横向滚动时**每一行的底色都连成一片**，
而不是只有长名字那一行延伸、其余行滚出视口。

滚动容器从 `.leftPane` 换成了 `.tree` 本身：`.root` 变成 `height: 100%` 的纵向 flex，
页头与搜索框留在滚动区之外，天然常驻（不必再 `position: sticky`）。
滚动条按面板宽度压细到 8px（`scrollbar-width: thin`），`overscroll-behavior: contain`
避免滚到底部时把整页带动。选中行 `scrollIntoView({ block: 'nearest' })` 只做纵向，
横向位置不动 —— 键盘上下走不会把树横着甩出去。

**键盘操作**（`role="tree"` 容器可聚焦，`tabIndex=0`）：

| 按键 | 行为 |
|---|---|
| ↑ / ↓ | 在**可见行**序列里上下一格（`flattenVisible` + `stepRow`） |
| ← | 展开状态先收起，已收起则回到父节点 |
| → | 收起状态先展开，已展开则进第一个孩子 |
| Home / End | 跳到首 / 尾行 |
| Enter | 定位到画布 |
| F2 | 重命名当前选中节点（引擎没有，标准树的惯例键） |

可见行序列与步进都是纯函数（`flattenVisible` / `stepRow`），单测覆盖了折叠、首尾边界
（到边界原地不动，不丢选中）。焦点落在行内动作按钮上时，方向键不抢事件。

**搜索**（对应引擎的 `views/filter.tsx` + `filter-tree.ts`）：

- 输入框夹在页头与树之间（滚动容器是树，所以它天然常驻），输入即过滤，带清空按钮；
- 命中判断看三处：标题（`schema.title` → `meta.title` → 组件名）、`componentName`、节点文本内容；
- `keepPaths(root, match)` 返回「命中项 + 全部祖先」，渲染时未命中的整枝跳过 ——
  只留命中项会让它在树里没有挂靠点；
- 搜索态**强制展开**（命中项藏在折叠里等于搜不到）、页头的「收起」按钮暂时隐藏；
- 命中片段用淡品牌色底标出（字色不变，避免整行看着像超链接）；
- 键盘导航在同一条过滤后的可见行序列上走，输入框里的方向键不会冒泡到树上；
- 一个都没命中时显示空状态（"没有匹配的节点" + 下一步提示），而不是一棵空树。

`keepPaths` / `flattenVisible(…, keep)` 也是纯函数，单测覆盖"祖先保留 / 兄弟不连坐 /
命中容器不带上孩子 / 空集"四类边界。

树里的图标（展开箭头、眼睛、锁、铅笔、垃圾桶、全部收起）统一取 lucide，
尺寸与线宽见 §7.9。

---

### 7.8 组件库面板（扁平宫格）

物料面板是左栏第二个入口，形态是**扁平宫格**：等宽方格、图标在上、名称在下。

| 项 | 取值 |
|---|---|
| 分组头 | 高 32、13px/600、正文色 `#1f2329`、整行可点（hover 底色 `#f5f6f8` + 圆角 6） |
| 分组箭头 | `ChevronRight` 14px，装在 16 见方的盒子里（旋转时占位不变），展开转 90° |
| 计数 | 11px `#6b7280`、底 `#eef0f4`，右对齐到卡片右缘 |
| 列 | 3 列等宽（`repeat(3, minmax(0, 1fr))`），面板 300 宽时每格约 82 见方 |
| 格子 | `aspect-ratio: 1/1`、圆角 10、白底、**1px 边框 `#e8eaef`** |
| 间距 | `--grid-gap: 16px`（实测偏松，想更紧改 12，不动卡片尺寸） |
| 内容 | 图标 22（`#4e5969`）+ 8 间距 + 名称 12（`#1f2329`，超长省略） |
| hover | 边框 `#bcd2ff` + 底 `#f7faff` + 图标转品牌色 |
| 按下 | 边框 `#006cff` + 底 `#f0f5ff`，光标 `grabbing` |

"扁平"落在两点上：**边界靠线不靠影**（卡片没有 `box-shadow`、没有灰底），
以及**图标不再单独套一层灰底方块** —— 卡片本身已经是容器，再套一层就是"框套框"，
76px 的格子里会显得很挤。

分组头是**标题**而不是标签：早先是 11px + 全大写 + 浅灰 `#98a0ad`，中文在这套规则下
糊成一条小字，压不住下面三列宫格。现在 13/600 + 正文色、整行可点、hover 有底，
折叠箭头从 8px 的 `▸` 字符换成 14px 的 `ChevronRight`。

分组头与宫格的左右内边距都收在 2px（组内 8 + 2 = 10，与搜索框左缘同一条线），
所以分组标题的箭头、卡片、数量三者竖直对齐；组与组之间 8px。

搜索态强制展开全部分组，数量显示的是**命中数**，否则命中项可能藏在折叠里。

### 7.9 图标体系

图形统一用 **lucide-react**（ISC，线性、24 视窗），不再自己写 `path`。自绘的问题是
同一个人不同批次画的线宽、圆角、留白对不齐，一排图标看过去一轻一重。

lucide 的 `stroke-width: 2` 是按 24px 定的，缩到 16px 只剩 1.33px 视觉线宽，
所以按尺寸分档：

| 位置 | 尺寸 | 线宽 | 图标 |
|---|---|---|---|
| 图标栏入口 | 20 | 1.7 | `ListTree` / `LayoutGrid` |
| 页头动作 | 13–14 | 1.8 | `ChevronsUpDown` / `ChevronsDownUp` / `Pin` / `PinOff` / `X` |
| 树行 | 12–16 | 2–2.2 | `ChevronRight` / `Eye` / `EyeOff` / `Lock` / `LockOpen` / `Pencil` / `Trash` |
| 物料宫格 | 22 | 1.7 | `icons.tsx` 里的 componentName → 组件映射表 |

物料那边保留 `MatIcon({ name })` 这层壳：`componentName` 是运行时字符串，
而 lucide 是具名导出、靠 tree-shake 减包，中间必须有一张名字到组件的表。
表里没有的物料回落到首字母徽章，新增物料不至于没有图标。

页头的图钉仍照引擎语义：**图标画的是"点下去会变成什么"** —— 悬浮时是 `Pin`（点它 → 固定），
固定时是 `PinOff`（点它 → 回到悬浮），所以固定态不染品牌色。

---

### 7.10 顶栏（top area）：左品牌 / 中尺寸调整 / 右动作

照引擎 `editor-skeleton/src/layouts/top-area.tsx` 的三区结构，几何也照抄
`workbench.less` 的 `.lc-top-area`：高 48、`padding: 8px 12px 8px 16px`、
**无下边框**（白底顶栏与灰底 body 之间靠 `margin-bottom: 2px` 隔出一条缝，
引擎就是这个做法）；左区自适应宽、中区 `flex: 1` 居中（`margin: 0 8px`）、右区自适应宽。

| 区 | 内容 | 对齐来源 |
|---|---|---|
| 左 | **只有 logo**：品牌蓝圆角块（24，叠层图形）+ 字标「Lowcode Next」，无其它控件 | 引擎 demo 的 logo 插件（logo 图 + 场景名是标签，不是切换器） |
| 中 | **画布尺寸调整**：设备档位（桌面=流式 / 平板 768 / 手机 375）+ 宽度输入（px） | 引擎 demo 顶栏中间的 `lp-simulator-pane`（设备图标 ×3）+ `lp-simulator-width-setter`（NumberPicker + px 后缀） |
| 右 | 撤销 / 重做（**无边框 ghost 图标钮**）+ **保存 / 预览** | 引擎 demo `topArea` right：undo-redo 插件 + `plugin-save-sample` + `plugin-preview-sample`（预览，主色钮）。引擎 save 插件里的「重置页面」是 demo 玩具功能（丢掉编辑结果重载 schema），日常搭建误触代价太高，**不移植** |

尺寸调整的实现口径（**行为逐条照引擎 `@alilc/lowcode-plugin-simulator-select` 源码**，
几何/色值取自其截图像素采样与 DOM 实测）：

- 只有 **3 个设备档**（桌面 / 平板 / 手机），没有"自适应"钮 —— 引擎就没有；
  32×32、组内间距 8、圆角 3，激活铺 `#f2f2f2`，图标恒 `#666`（引擎激活态只换底色不换字色）。
  点档位 = 引擎 `set('device', …)`：**桌面回到进入时的基准宽度**，平板 / 手机给定宽
  768 / 375。档位是"哪个图标亮"（引擎的 `state.active`），输入宽度不改变它。
- 宽度输入 105×30、圆角 4、边框与 px 分隔线 `#c4c6cf`、**px 后缀是浅灰底 `#f2f3f7` 的
  addon**（Fusion NumberPicker `addonTextAfter` 形态）、14px 文字左对齐。组到输入框间距 16。
- **输入框显示的是画布设计宽度**：挂载时量一次可用宽度锁成"纸张宽度"，之后只有
  用户（输入 / 切档）能改，**面板开合、窗口缩放都不改**。**回车才提交**（引擎
  `onPressEnter`，`set('deviceStyle', { canvas: { width } })`），320..3840 夹取；
  Esc / 失焦弹回当前值 —— 引擎不处理这两者，但草稿悬着和"输入框 = 实况"的定位矛盾，
  这里收掉。

**画布是固定宽度的"纸"，不随容器流动**（这是切换面板不抖动的关键）：

宽度一变整页内容重排 —— 落地页 3 列网格塌成 2 列、高度骤变几百 px，视觉上就是
"页面在抖"。引擎把画布放进 iframe（独立文档），这次重排被隔离在 iframe 里，且
demo 内容简单（高度不变）看不出来；实测引擎 demo 切固定时 iframe 照样从 1056 → 755。
我们把约束写在宿主侧：画布宽度 = 设计宽度（挂载时锁定），左栏固定 / 悬浮 / 收起、
窗口缩放都只是**可视窗口**变化（stage 出横向滚动 / 留白），内容坐标纹丝不动 ——
画布高度、滚动位置、选中框全部稳定。定宽 `width + marginInline: auto`：stage 更宽时
水平居中。SelectionBorders / FloatToolbar 都量的是 `getBoundingClientRect()`，
对定宽天然免疫，不需要跟着改。

右区按钮照引擎 demo 的 Fusion 形态：高 28、`padding: 0 12`、圆角 3、字号 12；
普通钮白底 `1px #c4c6cf` 边框 hover 转品牌色，预览是主色钮（品牌蓝底白字）；
撤销 / 重做是 `lc-btn-icon` ghost 形态（无边框、hover 出 `#f2f2f2` 浅底）。

职责边界（引擎同款）：**预览只是回调透传**（`onPreview`），
预览窗口是宿主（playground）的事 —— 文档由宿主创建，
Designer 没有权力换掉自己的 `document`。保存是 Designer 内置能力
（`doc.toSchema()` 导出 JSON 下载，文件名 = `doc.id`；`Ctrl/Cmd + S` 绑定同引擎 demo）。
playground 的预览是独立入口 `preview.html`（干净路径 `/preview`）：schema 经
sessionStorage 传递，用 `createReactDriver(registry)`（无编辑态占位）以
`mode: 'runtime'` 渲染。

原先顶栏里的操作提示文字与「已选」徽章随对齐移除 —— 引擎顶栏没有这两样，
选中反馈已经由画布框 / 大纲 / 属性面板三处承载。

### 7.11 数据源面板（leftArea 的第三个 PanelDock）

对齐引擎的 `@alilc/lowcode-plugin-datasource-pane`：数据源是**图标栏面板**
（`area: 'leftArea'`、`PanelDock`、宽 300、icon `shujuyuan`），排在
大纲树 / 组件库之后 —— 不是顶栏按钮。面板结构与引擎 demo 一致：

```
PaneHeader（数据源 + 图钉/关闭）
├─ 小标「数据源」
├─ 筛选行：类型下拉（全部/fetch…）+ 关键词输入 + 搜索钮（组合输入框，边框 #c4c6cf）
├─ 操作行：新建（带边框 + 下拉箭头）｜排序 / 导入 / 导出（文字钮）
└─ 列表卡片：ID（14/600）+ 类型标签（#f2f3f5 圆角块）
   + 调试 / 编辑 / 删除 / 复制 四个图标钮
```

行为口径：

- **存储**：`PageSchema.dataSource = { list: DataSourceConfig[] }`，与 lowcode 协议
  的 `{ list: [...] }` 同构；`DataSourceConfig = { id, type, description?, isInit?,
  options? { uri, method, params, headers, timeout } }`。文档模型持有编辑态视图
  （`doc.dataSource` / `doc.setDataSource(list)`），`toSchema()` 在非空时写回。

### 7.12 属性面板视觉（对齐引擎设置面板）

右栏样式曾用一套 Tailwind 风格的中性灰 + 靛蓝（#4f46e5）强调色，与整体引擎色系
（rgba(31,56,88,α) 中性色 + #006cff 品牌色）不搭。已按引擎源码逐项对齐
（editor-skeleton 的 components/settings/style.less、components/field/index.less、
layouts/theme.less + less-variables.less）：

| 项 | 引擎值（已照抄） |
|---|---|
| 面板字体 | `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Helvetica, Arial` |
| 导航条 | 高 30、padding 0 16、下边线 `rgba(31,56,88,.1)`（N-7）、图标 16 `rgba(31,56,88,.4)`（N-4） |
| 页签 | 高 40（inner padding 12px 0）、**激活色 = #006cff**、12px |
| 手风琴头 | 高 32、底 `rgba(31,56,88,.06)`（N-8）、上下线 N-7、字重 500、padding 0 12 |
| 行 | label 列 70px（lc-inline-field）、字段外距 12px、内容底部留 50px（lc-settings-pane） |
| 文本 / 占位 | title `rgba(0,0,0,.8)`（D-2）、text D-3、label D-4、placeholder N-5 |
| 输入控件 | 圆角 3（@input-border-radius）、边框 N-5、聚焦 #006cff + 2px 品牌蓝 10% 光晕、开关激活 #006cff |

有意保留的偏离：面包屑右侧的 componentName 等宽字标签（`ctag`）与「节点信息 /
整页 JSON」折叠组是引擎没有的本地增强，配色已并入引擎色板。

样式页签的字段形态（引擎 StyleSetter `showModuleList` 的同款思路）：
**枚举字段给死 options 走 SelectSetter**（display / 方向 / 交叉对齐 / 主轴对齐 /
换行 / 字重 / 文字对齐），自由文本只留给真正的自由值（颜色、`1px solid #eee`
这类组合值）；长度字段保留输入框 + 纯数字自动补 px。枚举项的「默认」提交
`undefined` = 删掉该样式键，与 props 页签的删除语义一致。

样式页签已整体对齐引擎 StyleSetter V2（lowcode-engine-ext
`src/setter/style-setter`，官方设置器仓库）：

- **模块与渲染顺序照抄**：布局 → 文字 → 背景 → 位置 → 边框；原「尺寸」「间距
  与背景」两个本地分组取消，width / height / margin / padding 归入布局
  （引擎 LayoutBox 盒模型就在布局模块里）。
- **枚举取值照抄各模块 zh-CN locale**：布局模式 inline / flex / block /
  inline-block / none（引擎 showDisPlayList）；换行 nowrap / wrap /
  wrap-reverse；对齐多一项 justify；字重标签改引擎样式（400 Normal…）。
- **flex 子字段条件渲染**：主轴方向 / 主轴对齐 / 辅轴对齐 / 换行只在
  `display === 'flex'` 时出现（引擎 pro/layout 的同一行为），字段加 `when` 判定。
- **新增「位置」模块**：定位 static / relative / absolute / fixed / sticky +
  top / right / bottom / left（引擎 pro/position 的 minimal 版，浮动 / 清除
  与九宫格模板未移植）。
- **源码页签换成 CSS 声明编辑**（引擎 CssCode 组件的本地对应物）：styleData ↔
  CSS 文本互转（toLine / toHump 同款驼峰 kebab 互转），合法即实时写回、解析
  失败只报错不提交（引擎靠禁用「保存」按钮表达同一判据）；省掉引擎 cssjson 的
  `#main { }` 包装，只输出声明。
- 有意偏离：gap / maxWidth / minHeight 是引擎布局模块没有的本地字段，保留。

页面根节点的面板行为（对齐引擎两条源码依据）：

- **属性页签为空、无提示**：引擎 Page 物料（lowcode-materials `lowcode/page/meta.ts`）
  声明的 props 只有 `style`，且被 `parse-props` 升到样式页签（`supports.style`）；
  settings-primary-pane 只在**整个面板无分组**时才提示「未找到配置」。所以选中
  「页面」时属性页签是空白页 —— 根节点不显示「这个物料没有可配置的属性」，
  非根节点保留该提示。
- **高级页签不出「条件渲染」「循环」**：`addon-combine` 的 `isRoot` 分支
  （Page / Component）**不注入** condition / loop / key —— 页面根不可条件渲染、
  不可循环。这两组手风琴仅对非根节点渲染；根节点的「显隐与锁定 / 节点信息 /
  JSON」是本地增强，照旧保留。
- **未选中节点只渲染一条提示**：引擎 settings-primary-pane 的 `!settings` 分支
  只输出 `lc-settings-notice`（居中 12px、padding 50px 15px 0、文案
  「请在左侧画布选中节点」）—— 没有面包屑、没有页签。本地曾加的「页面概览」
  （版本/节点数/物料种类/最大深度/根节点）与未选中态的「整页 JSON」按引擎移除；
  整页 JSON 在选中任意节点后的「高级」页签里仍有入口。

### 7.13 setter 控件改用 shadcn/ui（Tailwind v4 接入）

7.12 之后，用户拍板 setter 控件壳从手写 `<input>/<textarea>/<select>/<button>`
整体换成 **shadcn/ui**（Radix 原语 + Tailwind 类名），换取成熟的可访问性
（键盘 / aria / 焦点管理）与后续 `shadcn` CLI 的组件生态。

接入方式（playground 侧管线）：

- `@tailwindcss/vite` 进 playground 的 vite 插件；`styles.css` 变成 Tailwind v4
  入口（`@import 'tailwindcss'` + `tw-animate-css`）。
- **必须显式 `@source`**：本仓库没有 git 根，v4 的自动源探测不可靠；
  designer 以源码形态被 alias 进 bundle，其 ui 组件里的 Tailwind 类名要在
  `@source '../../../packages/designer-react/src'` 里声明才会被编译（**包改名时这条必须同步**，
  写错不报错、只静默漏扫）。
- shadcn 主题令牌在 `styles.css` 的 `:root` 里映射到引擎 DPL 色板
  （--primary #006cff、--input N-5、--ring 品牌蓝 25%、--destructive @brand-danger…），
  所以 shadcn 组件出厂就是 7.12 的引擎观感。
- preflight 全局生效于宿主文档：壳样式全是显式 CSS Modules，实测无回归；
  画布在 iframe 里有自己的文档，完全不受影响。

designer 侧新增（`packages/designer-react/src/ui/`）：

- `lib/utils.ts` 的 `cn()`（clsx + tailwind-merge）；
- `input.tsx` / `textarea.tsx` / `switch.tsx` / `select.tsx` —— shadcn 结构，
  尺寸令牌对齐引擎 setter（高 28 = h-7、圆角 3、12px = text-xs）。

setters.tsx 只换控件壳，语义原样保留：`undefined` = 删除属性回落默认值、
中文输入法 composition 期间只更草稿、聚焦期间不被外部回流顶掉光标、
NumberSetter 半截输入不写 schema、SelectSetter 回填还原原始类型。

两个 Radix Select 的坑（都踩过）：

1. **Item 文本必须包在 `SelectItemText` 里**：Radix 靠它把回显文本注册进
   itemTextMap（也用于生成原生 select 的 option）；漏掉时弹层列表正常、
   键盘导航正常，但 SelectValue 永远是空 span。
2. **触发器回显不依赖注册表**：内容关闭时 ItemText 未挂载、注册表为空，
   首帧 SelectValue 显示空白。这里直接由受控值算出 label 文本放进触发器
   （`<span>{label}</span>`），永远可靠。

范围：只换 setter 控件（含 PropertyPanel 的 StyleInput / ExpressionInput），
面板骨架（页签 / 手风琴 / 导航）保持 7.12 的 CSS Modules。
- **不进撤销栈**：引擎的数据源面板直接改 `doc.dataSource`，不走 history；这里同口径，
  变更以 `doc.dataSource` 事件广播（面板整表替换是编辑粒度）。
- **编辑表单是「详情」浮层，不接管右栏属性面板**（引擎 detail 的同款装载：
  `position: absolute; left: 300px; top: -48px; bottom: -48px; min-width: 600px`，
  白底 + 左右侧框，从数据源面板右缘往画布方向展开、压住画布左半边；
  `z-index: 25` 压过画布浮动工具条）。页头左标题、右确认/取消：
  类型（只读）/ *数据源 ID（查重）/ 是否自动请求（开关）/ *请求地址 / 请求参数
  （键值行 + 添加）/ *请求方法（GET..PATCH）/ 超时时间（毫秒）/ 请求头信息。
  数据源面板收起或切到其它面板时浮层一并关闭；浮层压住画布左缘，所以同样打
  `data-lc-overlay`，「页面」级 hover 框会扣掉这段区域。
- **调试（眼睛）是真实请求**：按 method/params/headers/timeout 发 fetch，响应
  （200 OK + 格式化 JSON）显示在卡片下方，绿/红左边条区分成败 —— 对应引擎的
  调试预览。
- 排序简化为「按 ID 排序」开关（引擎是进入拖拽排序模式）；导入 / 导出是
  `{ list }` JSON 文件的合并导入（按 ID 去重）与整表下载。

**与引擎的差距（有意保留）**：引擎还有 shouldFetch / dataHandler 等函数代码框和
jsonp / mtop 数据源类型 —— 那是数据源引擎（requestHandlerMap + 表达式沙箱）的
运行时能力。v1 没有运行时消费方（§5.1 的表达式求值是占位），先不暴露会误导人的
死配置；`isInit` 的运行态自动请求随 M6 数据源引擎一起生效，面板的眼睛可以先
调试请求本身。

playground 的 landing schema 带了一条示例（`info → /mock/info.json`，引擎 demo
同款），面板打开即有内容可看、可调试。

### 7.14 样式页签完全复刻引擎 StyleSetter V2

7.13 的 shadcn 基座之上，样式页签从「字段表 + 手风琴」整体重写为引擎
StyleSetter V2（`lowcode-engine-ext/src/setter/style-setter`）的**像素级复刻**
（`StyleSetter.tsx` + `StyleSetter.module.css`，PropertyPanel 只剩薄壳）：

- **源码区（CssCode）**：「行内样式」标题 + `{/}` 折叠按钮；**Monaco Editor**
  （`language="css"`）里编辑引擎同款 `#main { }` 包装的 CSS 文本（toLine/toHump
  互转），「保存」按钮 dirty + 合法才可用（引擎 isCanSave 语义），失焦自动保存。
  CSS 补全、校验与「格式化文档」（Shift+Alt+F / 右键菜单）由 css.worker 的
  language service 提供，不自己实现格式化。
- **布局**：布局模式五枚举图标单选（引擎 `icon-a-Display*` 系列），
  display==='flex' 时出现主轴方向/主轴对齐/辅轴对齐三行图标单选 +
  「换行」一行文字单选（引擎 locale 里 flexWrap 三项没有 icon 字段，
  RadioGroup 走 `item.title` 分支）；
  **LayoutBox 3D 盒模型**（`pro/layout/index.less` 逐值移植：#d6e4ff 梯形边框、
  hover #bfd4fb、有值 #bcd1fa，margin 外圈/padding 内缩 25px、八向输入、
  上下键 ±1）；宽度/高度带 px 后缀。左右四个输入必须**显式给宽**：
  `.faceLeft/.faceRight` 自身 `width:0`，只写 `width:100%` 会让这 4 个
  input 实际宽 0px（完全看不见）。现按引擎给 margin 侧 60px / padding 侧
  30px，并分别对中到 20px 梯形条带中心。盒内标签由英文 `MARGIN/PADDING`
  + `scale(.75)` 改为中文「外边距 / 内边距」、11px 常规字重不缩放、
  rgba(0,0,0,.6)——中文再缩放成 7.5px 会糊。
- **文字**：字号/行高同行 → 字重 → 字体 → 文字颜色（色块 + 文本，
  色块弹原生取色器）→ 对齐四图标 → 透明度（滑杆 + 数值，提交 0~1）。
  引擎 locale 的字重项是 `100 Thin … 900 Black`（末两项还漏数值）、字体项
  只有 Helvetica/Arial/serif；中文界面下前者分不清轻重，改成「数值 + 中文名」
  （100 极细 … 900 极粗），字体补上「系统默认 / 苹方 / 微软雅黑 /
  宋体 serif / 等宽 monospace」。value 仍是字符串，写回 schema 不变。
- **背景**（`pro/background`，实现在 `StyleSetterExtras.tsx`）：背景类型
  （颜色 / 图片）是**本地状态**、不写进 style；图片输入做 `url(...)` 包装与回显；
  「尺寸」三态（默认 → 宽/高双值 px|%、contain、cover）、「定位」9 宫格
  （leftTop…rightBottom）+ 左/顶双值、「重复显示」四图标；末尾一条透明度行
  （引擎 font 与 background 两个模块都有，照抄）。双值字段写成 `"w h"` 单键，
  两个都 auto 时删键。
- **位置**（`pro/position` + `positionBox`）：定位下拉；**非 static 才**出现
  30px 梯形边框的 3D 盒（top/right/bottom/left、auto 占位、上下键 ±1）；
  absolute 额外给四角模板（一次写四个方向：0 或删键）；zIndex / 浮动方向 / 清除。
- **边框**（`pro/border`）：圆角「固定 / 分别定义」互斥（写一侧时清另一侧残留键）；
  五方向边框选择器（上/左/全/右/下，选中后才渲染 `${dir}Width` / `${dir}Color` /
  `${dir}Style`）；内外阴影切换在 `boxShadow` 首段增删 `inset`，阴影颜色 /
  x / y / 模糊 / 扩展按五段数组就地写回（inset 时序号 +1）。
- **五个 Collapse 默认全展开**（引擎各模块都是 `defaultExpandedKeys={['0']}`）；
  此前「背景/位置/边框默认折叠、只给两三个输入框」的形态作废。
- **批量提交**：引擎 `onStyleChange(styleDataList)` 一次合并多键；本地在
  `StyleSetter` 里派生 `batch(changes)`，复用 `onStyleReplace` 整体替换通道，
  保证四角模板 / 圆角互斥这类交互只产生一条历史记录。
- 行骨架与枚举文案照抄 `components/row` 与各模块 zh-CN locale：标题 50/55px、
  12px、rgba(0,0,0,.6)、有值 #5584ff；图标单选组（再点已选项 = 取消）。
- 控件壳全部 shadcn（Input/Select/Slider/Button，新增 `ui/button.tsx`、
  `ui/slider.tsx` 与 `@radix-ui/react-slider`）。

**Monaco 接入**（`monaco-setup.ts` + `MonacoCssEditor.tsx`）：本地打包
`monaco-editor@0.57` + `@monaco-editor/react@4.7`，`loader.config({ monaco })`
不走引擎的 CDN（引擎是 `@alilc/lowcode-plugin-base-monaco-editor` → 0.33.0）。
`self.MonacoEnvironment.getWorker` 按 label 分派 `css/scss/less` → css.worker、
其余 → editor.worker；Vite 8/rolldown 解析不了带 `?worker` 的 bare specifier，
worker 走 `../node_modules/monaco-editor/esm/vs/...` 相对路径导入。
editor options 照抄引擎 `css-code/index.tsx` 的 defaultEditorOption +
base-monaco-editor `INITIAL_OPTIONS`（fontSize 12 / tabSize 2 / formatOnPaste /
autoIndent advanced / 行号与 minimap 关 / 按行数自动撑高）。Monaco 是 lazy
chunk（`React.lazy`），只在展开源码区时加载，不进主 bundle。
引擎 `parseToCssCode` 用 `cssjson.toCSS`（每层一个 tab 缩进），本地
`styleToCssCode` 对齐这个缩进；反解析保留更安全的判据：失败返回 null 拦截提交
（引擎 catch 后返回 `{}`，语法写错会静默清空样式）。

**图标与 placeholder 直接复用引擎资源**：样式面板原先自绘 SVG / 用 lucide
凑图标，形状与引擎对不上。现在从 `lowcode-engine-ext/src/components/custom-icon.tsx`
的 iconfont scriptUrl（`font_2761185_ccl8ob63gmj.js`）提取 70 个 `<symbol>`
的 path，离线存进 `packages/designer-react/src/EngineIcons.tsx`（`EngineIcon` +
`engineIcons`），运行时不依赖阿里 CDN；图标名逐项照抄各模块
`locale/zh-CN.json` 的 `icon` 字段（含 `icon--quanbubiankuang`、
`icon-yuanjiaofangkuang`、`icon-a-Justify*`、`icon-qingchuzuoce` 等），
源码区 CSS 图标也换成引擎的 `icon-CSS`。
placeholder 原先散着 6 种灰（#b6bcc6 / #a9aeb8 / #c9cdd4 /
rgba(0,0,0,.45) / rgba(31,56,88,.3) / rgba(31,56,88,.4)），统一为引擎
Fusion Next `.next-input input::placeholder` 的 `#999999`（small 档 12px，
disabled 为 #CCCCCC）：`styles.css` 加 `--lc-placeholder` +
`--color-placeholder` 令牌，shadcn 控件走 `placeholder:text-placeholder`，
各 CSS Module 的 `::placeholder` 走 `var(--lc-placeholder, #999999)`。

**小数值输入 = shadcn Input + 单位后缀（引擎 NumberPicker `innerAfter`）**：
`components/number/index.tsx` 的 `getInnerAfter()` 有两种形态——`unit` 传字符串
（全局默认 `unit:'px'`）返回纯文本 `px`；传数组（背景 `['px','%']`）返回
`Select hasArrow={false} hasBorder={false} autoWidth={false} style.width=24`，
只显示单位文字、点击切换，「没有下拉箭头」。本地旧实现用 24px 原生
`<select>` 绝对定位盖在 Input 上：浏览器自带箭头吃掉约 14px，`px` 被裁成
`p`；Input 还得预留 26px 右内边距，窄面板下 `auto` 这类 placeholder 也被挤断。
现统一收敛为 `NumberField`（`StyleSetter.tsx` 导出，`UnitNumberInput` 与
`StyleSetterExtras.MultiPropNumber` 共用）：外壳复用 shadcn Input 的
Tailwind 令牌（border/radius/12px/placeholder/disabled + `focus-within`
光晕），内部仍是 `<Input>`（只把边框与 ring 让给外壳），单位后缀是同一行
内的真实 flex 单元——单单位渲染 `span`（#666 / 12px / 右 padding 4px，
照抄 `.next-input-inner-text` + `.next-input-control`），多单位渲染
`appearance:none` 的 24px `<select>`，文字完整、无箭头、可切换。
输入框不再留右内边距，290px 窄面板下 `auto` / `输入图片url` /
`rgba(0,0,0,0.8)` 全部实测不截断。

**有意偏离**：不做 useComputedStyle 画布计算值预填；控件壳用 shadcn
（Input/Select/Slider），折叠箭头等面板 chrome 仍用 lucide；ColorInput 用原生
取色器代替 SketchPicker 弹层；css `var(...)` 绑定只禁用输入、不渲染引擎的
ghost 文本；7.12 时代的 gap/maxWidth/minHeight 本地字段从界面移除
（仍可经源码区手写）。

**折叠卡片对齐 Fusion Next Collapse 出厂值**（`@alifd/next/dist/next.css`
逐值核对，引擎仓库本身没有覆盖 collapse）：卡片 `border:1px solid #DCDEE3`
+ `border-radius:3px` + `overflow:hidden`；头部 `#F2F3F7`、hover `#EBECF0`、
`padding:8px 12px 8px 28px`、14px normal `#333`，箭头绝对定位 `left:12px`
（10px 细线 Chevron，折叠 rotate(-90deg)）；内容区白底 `padding:12px 16px`；
每个模块是独立 Collapse，卡片间距 8px。此前「整卡浅灰、无边框无分隔」的
形态作废。源码编辑器的字体/行高/padding 由 Monaco options 管理，容器只保留
边框与 `:focus-within` 聚焦态。

**面包屑与排版**（`PropertyPanel` / `StyleSetter.module.css`）：引擎
`settings-primary-pane.tsx` 的 `renderBreadcrumb()` 用 `let l = 3` 只向上走
3 层，交给 Fusion `Breadcrumb` 渲染 —— **没有省略号项**，`Title` 组件也
不带 tooltip；本地曾多画一个「…」并给每级加 `title`，已删。分隔符按
`.next-breadcrumb-separator`（#A0A2AD、`margin:0 8px`），文本 12px/16px、
祖先 #666 / 当前 #333 / hover #5584FF、字重 normal。
属性面板 `.root` 补上引擎 Fusion `body` 的基座（12px / 1.2857 / #333 /
`Roboto, "Helvetica Neue", Helvetica, Tahoma, Arial, "PingFang SC",
"Microsoft YaHei"`）——之前不设 font-size，继承了宿主 14px，所有没显式
写字号的 `<button>` 都大 2px，分段组尤其明显。按钮单选组按
`.next-radio-button-medium`（高 28、label 12px/400/#333、边框 #C4C6CF、
hover #F2F3F7、选中 #5584FF）对齐。**文字项不与图标项共用等分规则**：
引擎 `components/row/index.less` 的 `.next-radio-wrapper { flex:1 }` 只让
图标项均分整行；Fusion RadioButton 的 label 本身按内容宽度排，实测原 setter
「尺寸」组是 48 / 64 / 64px（合计 176，行内右侧留白），即 `min-width:48px`
+ `padding:0 8px` + `flex:0 1 auto`（不 grow，剩余空间留在行尾）。本地此前
三项等分各 58.7px，4 字的「等比填充」两侧只剩 5px，视觉拥挤；现改为按内容
宽度，图标组仍按引擎 less 等分。

**分段组的组件来源（16:58）**：用户指出它本质上是 radio 的 group 变体，
改用 shadcn/ui `ToggleGroup`（Radix，`@radix-ui/react-toggle-group`，
`ui/toggle-group.tsx`）。`type="single"` 时 Root 是 `role="radiogroup"`、
Item 是 `role="radio"` + `aria-checked` + 方向键漫游；再点已选中项 Radix
会把 value 置空并触发 `onValueChange('')`，与引擎 `onRadioItemClick` 提交
null 同款，故删掉手写 button 与 `checked` 状态，选中态 CSS 改用
`[data-state='on']`。**整组 `flex-wrap:nowrap` + `white-space:nowrap`**
（引擎 `.radiogroup-style` 同款）：文字项 `flex:0 1 auto` 在窄面板下靠
flex-shrink 收进一行（176px 行宽实测 48 / 65 / 65，三项 y 全等），此前误加
`flex-wrap:wrap` 让第三项掉到第二行、边框散成上下两截。视觉规格仍由
`StyleSetter.module.css` 覆盖成 Fusion 色值/尺寸，不套 shadcn 默认外观。

激活页签按
`.next-tabs-tab.active { font-weight: normal }` 去掉 500（12px 中文用 500
会合成加粗反而糊）。折叠分组头保留引擎 `lc-field-head` 的 500。
**16:00 那轮没有新增组件或依赖**：面包屑仍是原生 button + CSS Module，
盒模型 8 个透明输入改为复用现有 shadcn `Input`（`cn()` 覆盖边框/圆角/ring）；
16:58 这轮按用户要求新增 shadcn `ToggleGroup`（1 个组件文件 + 1 个 Radix
依赖），仍不引入 Fusion 或自造控件。

**demo 根节点不写 `background` 简写（17:16）**：`apps/shared/src/schemas/landing.ts`
根节点原有一行 `background:'#ffffff'`，而属性面板会写 `backgroundSize` 这类
非简写属性，React dev 在删除 `backgroundSize` 时必报
`Removing backgroundSize when conflicting property background is set`。白底
本就由画布文档 `canvas.css` 的 `html/body { background:#fff }` 提供，这行是
冗余的，删掉即可。**不能**改成 `backgroundColor`：背景模块的
`useEffect([signature])` 按引擎 `initData()` 在每次 style 变化反推 `bgType`，
`backgroundColor` 恒有值会把用户选的「背景图片」弹回「颜色填充」。删掉后
`bgType` 初始仍为 null，UI 初始态不变。

**CSS 结构收敛**：LayoutBox 原本按上/下/左/右各写一条 hover 与有值态规则
（8 条重复），改为每个面共用一个 `--face-color` 变量，`faceSet` /
`:hover` 只改变量（`:hover` 特异性更高，天然覆盖有值态，与引擎 less 里
规则先后顺序的效果一致）。

页签根节点 `.setter` 带 `padding:12px 12px 0` —— `.body` 没有水平内边距，
属性/高级页签的行各自带 margin，样式页签必须自己给，否则内容贴边。

---

## 8. 包结构与构建

```
lowcode-next/
├─ packages/
│  ├─ protocol/        类型 + zod 校验 + 迁移
│  ├─ model/           节点树 + 命令 + 选区
│  ├─ renderer/        求值器 + IR + Driver 契约 + ReactDriver
│  ├─ drag/            拖拽引擎
│  └─ designer/        设计器 UI（React）
├─ apps/
│  └─ playground/      Vite 应用，直接吃源码，HMR
├─ pnpm-workspace.yaml
├─ tsconfig.base.json   （composite: true，供 tsc -b 增量）
```

- 包间引用用 `workspace:*`，`tsconfig` 走 **project references**，`tsc -b` 增量编译，改一个包只重建下游
- 本地永远 `pnpm dev`（Vite 直接读 `src`），不跑包构建
- 发版时才 `pnpm build:lib` 产出 ESM + UMD

---

## 9. 里程碑

| # | 内容 | 预估 | 产出 |
|---|---|---|---|
| M0 | workspace + Vite playground + protocol 类型/zod | 2d | `pnpm dev` 可跑 |
| M1 | Evaluator + IR + ReactDriver + `data-node-id` | 3d | schema 能渲染出页面 |
| M2 | Document/Node/Command | 3d | 可插入/移动/删除节点 |
| M3 | Locator 纯函数 + 单测 | 2d | 几何逻辑全绿 |
| M4 | DragManager 状态机 + Overlay + RectCache | 4d | 画布内可拖动 |
| M5 | 物料面板 + DropContext + 落点提交 | 3d | 物料可拖入 |
| M6 | 选中高亮 / 删除 / 空态 / 错误提示 | 2d | 可用 Demo |

合计约 **19 人日**（不含属性面板）。

**建议顺序**：M0 → M1 → M3 → M4 可以并行于 M2 → M5。M3 先写是因为纯函数没有依赖，能提前把最难的几何逻辑验证掉。

---

## 10. 验收标准

- [ ] 从物料面板拖 Button 到画布，实时显示插入线，松手落在正确位置
- [ ] 画布内拖动节点，可跨容器、可同容器重排
- [ ] 拖到自身子孙节点内被拒绝，且给出视觉反馈
- [ ] 拖到非容器节点，自动落到最近的可容纳祖先
- [ ] 拖到画布外松手 = 取消，无副作用
- [ ] 500 节点页面拖动时稳定 60fps，Performance 面板无长任务（>50ms）
- [ ] 同一 schema 序列化 → 反序列化 → 渲染结果一致
- [ ] Locator 单元测试覆盖：空容器、单子、横排、竖排、边界吸附、嵌套

---

## 11. 风险与决策记录

| 风险 | 影响 | 应对 |
|---|---|---|
| 表达式用 `new Function` | 安全 | 运行态对外部署时替换为 quickjs；v1 仅限自有页面 |
| `elementFromPoint` 在跨域 iframe 不可用 | 架构 | v2 iframe 方案需在 iframe 内运行同一套 drag 引擎，而非跨域代理 |
| 组件根节点不透传 `data-node-id` | 命中失败 | 物料必须把 attrs 透传到**唯一根 DOM**；禁止 `display:contents` 包裹（不生成盒子，rect 为 0，见 `react-driver.tsx` 注释）。契约见 §12.4 |
| 可变模型 + 命令 | 协同/回放 | 命令已是唯一写入口，后续接 OT/CRDT 只需在 `apply` 处拦截 |
| 矩形缓存失效不全 | 落点偏移 | 滚动/resize/MutationObserver 三重失效 + dragstart 强制 prime |
| 物料双框架维护 | 长期成本 | meta 共享一份、组件按框架各一套，`createBindingRegistry` 在装配期校验集合相等；见 §12.4 |

### 待确认（3 项）

1. **画布 v1 是否确定用同文档 + CSS 隔离**（不上 iframe）？影响 M4 的实现量。
2. **物料面板与画布的拖拽是否要求"拖入时有缩放/旋转视觉"**？v1 建议只做位移。
3. **是否需要在 v1 就支持把节点拖到画布外（例如删到垃圾桶）**？建议 v2。

---

## 12. 多框架渲染规范（Framework Adapter Contract）

> **状态：已定稿 —— 最终架构见 §12.12，设计时双框架见 §12.13。** 本节定义
> 「拖拽引擎不锁框架、React/Vue 各自接物料接口、一个画布二选一、自定义 setter
> 可运行时加载」的落地契约。§5.1 的三段式与 `Driver` 接口仍是基础；本节与旧文
> 冲突时以本节为准，§12.12 / §12.13 与前面冲突时以它们为准。落地按 §12.8 的
> M0~M5 + §12.13.7 的 M-L3-1~5。
>
> 唯一已落地的代码是 `packages/designer-core/src/setter-registry.ts`（契约骨架，**尚未
> 接线**）：注册表为空时 `PropRow` 仍走原 if/else 链，行为与现在完全一致。

### 12.1 目标与非目标

**目标**

1. `protocol` / `model` / `drag` / 求值器 / 设计器的业务规则，完全不知道画布用的是
   React 还是 Vue。
2. 物料的**描述（meta）只有一份**，组件实现按框架各写一套，通过统一绑定接口接入。
3. 一次装配只启用一套框架：画布、预览、物料注册表、驱动必须同源。
4. 切换**画布**框架时，宿主设计器、拖拽引擎、属性面板、schema 数据**零改动**。
5. 设计时逻辑（session / 命令 / 命中 / 样式解析 / 属性行解析）只有一份；编辑器 UI
   可整体换成 Vue，换的是视图层，不是规则（§12.13）。

**非目标（明确不做）**

- 同一画布内按节点混用 React / Vue 物料，或运行时热切换框架。
- 同一编辑器实例内混用两套框架的视图（React 面板里挂 Vue 控件、或反之）。
  **注意**：编辑器 UI 本身**可以**是 Vue（§12.13 已定稿），只是要整套换，不是混挂。
- 把 setter **控件实现**做成跨框架组件（一套实现跑两个框架）。控件按编辑器
  flavor 各一份实现，框架中立的是**契约**（`SetterKind` / `SetterContext` / 值
  `normalize·validate·serialize`）、**注册表注入点**与 **flavor 维度**（§12.4.2、
  §12.13.5）。
- 把 Vue 组件塞进 React 属性面板（「Vue 编辑器 + Vue setter」是 §12.13 的正规路径，
  跨框架混挂不是）。「Vue **物料**要一个特殊控件」不受此限，本期就支持（§12.4.2）。
- 跨框架复用组件实现（React 组件不塞进 Vue registry，反之亦然）。
- 让物料组件参与编辑态交互（点击、拖拽、选中全走宿主原生 DOM 监听）。

### 12.2 三条硬约束

| # | 约束 | 可检验形式 |
|---|---|---|
| C1 | **框架知识只在 adapter 层** | `packages/{protocol,model,drag,renderer-core,designer-core}/src` 内 grep 不到 `from 'react'` / `from 'vue'` / `ComponentType` / `VNode` / `reactnode` |
| C2 | **一个画布一个框架** | 装配期确定 `kind`；`createBindingRegistry` 与 `createDriver` 校验 `kind` 一致，不一致直接抛错 |
| C3 | **DOM 是唯一跨框架协议** | 只靠 `data-node-id` / `data-edit-flags` / `[data-lc-canvas]` + `getBoundingClientRect()`；不传框架事件、不传组件实例、不读虚拟 DOM |

C3 是拖拽引擎能不锁框架的根本原因：`drag` 包零依赖、只认 `Point` / `Rect` /
字符串 id（见 §6.1），`DropContext.resolve` 的落点判断也只看 `Document` +
`ComponentMeta` + DOM 矩形，与渲染框架无关。

### 12.3 包边界

| 包 | 内容 | 运行时依赖 | 框架 |
|---|---|---|---|
| `@lowcode-next/protocol` | `PageSchema` / `NodeSchema` / `ComponentMeta` / `defineMaterial` | `zod` | 无 |
| `@lowcode-next/model` | `Document` / `Command` / `History`，靠 `MaterialResolver` 注入 | `protocol` | 无 |
| `@lowcode-next/drag` | `DragManager` / `Locator` / `RectCache` / `Overlay` | **零** | 无 |
| `@lowcode-next/renderer-core` **（新）** | `evaluate` / `IRNode` / `Driver` / `EvalContext` / `MaterialResolver` / `MaterialMetaSource` / `builtinMaterialMetas` | `protocol` | 无 |
| `@lowcode-next/renderer-react` **（由现 renderer 拆出）** | `createReactDriver` / 20 个 React 物料 / `reactBindings` / `materials.css` | `core` + `protocol`，`react` 为 **peer** | React |
| `@lowcode-next/renderer-vue` **（新）** | `createVueDriver` / Vue 物料 / `vueBindings` | `core` + `protocol`，`vue` 为 **peer** | Vue 3 |
| `@lowcode-next/setter-contract` **（可并入 protocol）** | `SetterKind` / `SetterContext` / `SetterRegistration` / 每个 kind 的 `normalize·validate·serialize`（纯函数） | `protocol` | 无 |
| `@lowcode-next/setter-react` **（M4 后按触发条件拆）** | 内置 React 控件 + 默认注册表；拆包时依赖 `ui-react` | `contract` + `protocol`，`react` 为 **peer** | React |
| `@lowcode-next/ui-react` **（仅在拆 setter 包时需要）** | shadcn 控件壳（Input / Textarea / Select / Switch / Slider / Button / ToggleGroup）+ 编辑器 CSS 变量 + tailwind 预设 | `react` 为 **peer** | React |
| `@lowcode-next/designer-core` **（新，§12.13）** | `DesignerSession` / 命令网关 / 拖拽装配 / iframe 桥 / `style`·`props`·`tree` 纯函数 / `dom`·`drop-context`·`float-bar`·`hierarchy`·`tree-layout`·`clone` / setter 注册表 | `core`（type-only）/ `model` / `drag` | 无 |
| `@lowcode-next/designer-ui` **（新，§12.13）** | 14 个 `*.module.css` + `tokens.css` + DOM 契约 + `IconName` 语义表（**不含组件**） | 无 | 无 |
| `@lowcode-next/designer-react` | 编辑器 UI（React + shadcn/Radix/lucide/Monaco） | `designer-core` / `designer-ui`，`react` 为 **peer** | React |
| `@lowcode-next/designer-vue` **（新，§12.13）** | 编辑器 UI（Vue 3 + shadcn-vue/Reka/@lucide/vue/Monaco） | `designer-core` / `designer-ui`，`vue` 为 **peer** | Vue 3 |
| `apps/playground-react` / `playground-vue` | 装配层：各绑一个 `designer-*`，加载 adapter、拼装宿主与画布；共用 `apps/shared` | 一个 `designer-*` + `core` + **一个** adapter | 每个 app 固定一种 |

**依赖方向**（单向，禁止回指）：

```
protocol → model → designer-core ──→ designer-react | designer-vue
    ↓        ↓          ↑(type only)
renderer-core ──────────┘
    ↓
renderer-react | renderer-vue   ← 只在画布 / 预览入口加载
```

`designer-core` 对 `renderer-core` 只有 type-only 依赖（`MaterialMetaSource`），
两个方向都不允许运行时 import —— 设计时与画布之间只交换 `PageSchema` 和 DOM。

硬性要求：

- `react` / `vue` 一律写成 `peerDependencies` + `devDependencies`，**禁止**放进
  `dependencies`（现状 `@lowcode-next/renderer` 把 `react` 写成 dependencies，
  导致 Vue 项目引入求值器也会被强装 React，这是 M1 要解决的首要问题）。
- `@lowcode-next/renderer` 保留为 `renderer-react` 的**兼容别名**（re-export），
  避免全仓 import 一起改；别名层不得再导出 `builtinMaterials` 这类混合结构。
- `materials.css` 的 class 名属于 DOM 契约，React / Vue 两套物料必须共用同一份
  CSS（放 `core` 的静态资源或独立 `@lowcode-next/materials-css`，见 §12.11）。
- 所有框架绑定包（`renderer-react` / `renderer-vue`，以及将来可能的 setter 绑定）
  与 core **同仓维护、锁步版本号**，同版本发布并在装配期校验版本一致。这是
  **可实现的治理目标**，不是补救措施：`@ark-ui/react` / `@ark-ui/vue` 同为
  `5.40.0`、同一 `gitHead`、同在 `chakra-ui/ark` 仓的 `packages/*`，官方同时维护
  React / Vue / Solid / Svelte 四套绑定（§12.4.2 范式评估 2）。
- 依赖位置按**两类**区分，不要混为一谈：
  - 框架运行时本体（`react` / `react-dom` / `vue`）→ 必须 `peerDependencies`；
    Ark UI 同样只把 `react >=18` / `vue >=3.5` 放 peer。
  - 框架无关的 core / 机器包 → 可以放 `dependencies`，**前提是锁步同版本**；
    Ark UI 的 60+ 个 `@zag-js/*@1.47.0` 全在 dependencies，npm dedupe 后仍只有一份。
- 反面实证（§12.4.2）：`lexical` core 已 0.53.0，社区 `lexical-vue@0.18.0` 硬钉
  `lexical: 0.50.0`。真正导致装出两份 core 的是**版本钉死不一致**，不是 core 放在
  `dependencies`；上一版规范把两个原因合并叙述，此处更正归因。
- **拆 setter 包的成本实测**（决定它不该现在拆）：`setters.tsx` 253 行 +
  `setters.module.css` 24 行本身不大，但 `designer-react/src/ui/*` 共 297 行、被
  `PropertyPanel` / `StyleSetter` / `StyleSetterExtras` / `setters` **4 个文件**引用，
  且 `--lc-placeholder` 等皮肤变量现在由 `apps/shared/src/styles.css` 提供
  （M-L3-2 会收进 `designer-ui/tokens.css`，宿主仍可覆盖）。要让
  `setter-react` 不反向依赖 `designer`（否则成环），必须先抽 `ui-react` —— 拆分
  顺序因此是 `ui-react → setter-react → designer`，三个包一起动才成立。

### 12.4 物料接口（本规范的核心）

> **已落地（2026-11-07）。** 本节下面的接口是按理想形态写的，实现时的命名与它有两处差异，
> 以 §12.13.10 为准：
> - `createMetaRegistry(packages)` 收的是**物料包**（`{ id, metas }`）而不是裸 `ComponentMeta[]`；
> - `createBindingRegistry` 没有出现 —— 绑定由各框架包自己提供（`materials-react` 的
>   `reactPackage()` / `materials-vue` 的 `vuePackage()`），两边共用 `assertMetaBindings()` 校验。
>
> 另外 `MaterialMetaSource` / `FrameworkKind` 也没有单独定义：注册表就是
> `MaterialMetaRegistry`，宿主要以「有没有这个物料」注入时用 `designer-core` 的
> 结构化子类型 `MaterialLookup`（§12.13.2）就够了。

**描述与实现必须分离。** 现状 `builtinMaterials: MaterialDefinition[]` 把
`{ meta, component: ReactComponentType }` 绑在一个数组里，`component` 还是 React
的 `ComponentType` —— 这是 designer 无法脱离 React 的直接原因。

```ts
// ── renderer-core：框架中立 ──────────────────────────────────────
export type FrameworkKind = 'react' | 'vue';

/** designer / Document 只需要元数据，永远不碰组件 */
export interface MaterialMetaSource {
  getMeta(componentName: string): ComponentMeta | null;
  has(componentName: string): boolean;
  list(): ComponentMeta[];                 // 注意：返回 meta，不是 definition
}

/** 画布 driver 才需要解析组件 */
export interface MaterialRegistry<C = unknown> extends MaterialMetaSource {
  readonly kind: FrameworkKind;
  resolve(componentName: string): C | null;
}

export function createMetaRegistry(metas: ComponentMeta[]): MaterialMetaSource;

export function createBindingRegistry<C>(
  metas: ComponentMeta[],
  bindings: Record<string, C>,
  kind: FrameworkKind,
): MaterialRegistry<C>;

/** 物料描述：两套框架共用同一份，放在 core */
export const builtinMaterialMetas: ComponentMeta[];

/** 物料绑定：各框架各自实现，key 必须是 componentName */
export type MaterialBindings<C> = Record<string, C>;
```

`createBindingRegistry` 必须做**启动时全量校验**：`metas` 的名字集合与
`bindings` 的 key 集合必须完全相等，缺一个或补一个都抛错并列出差集。理由很实在：
Vue 侧少实现一个物料时，画布不会报错，只会渲染出「未注册物料」的兜底块，用户
拖进去才发现白屏 —— 这种问题必须在装配期暴露。

**两套物料实现都必须满足的 6 条契约**（违反即拖拽/选中失效）：

1. **唯一根 DOM 元素**，并把 `data-node-id`、`data-edit-flags` 以及所有
   `data-*` / `aria-*` 透传到该根元素。React 侧沿用 `passthrough()`；Vue 侧用
   `inheritAttrs: false` + 显式 `v-bind="$attrs"`（多根组件同理，必须指定唯一根）。
2. **禁止**用 `<div data-node-id style="display:contents">` 包一层来「代劳」：
   `display:contents` 不生成盒子，`getBoundingClientRect()` 全是 0，命中框和
   指示线会整体失效。§11 风险表里的旧应对是错的，以实现为准（见 `react-driver.tsx`
   开头注释）。
3. `props.style` 收 `Record<string, string | number>`（camelCase 对象，React 与
   Vue 的 `:style` 都原生支持），并且**必须**用 `styleOf` / `str` / `num` / `bool` /
   `pick` 的等价物做白名单收口 —— schema 的 props 是不可信 `unknown`。
4. 业务 props（level / gap / tone…）**不得**落到 DOM；只放行 `data-*` / `aria-*`。
5. 组件内**不得**绑定框架事件来做编辑态交互；点击、拖拽、键盘由宿主在 iframe
   文档上挂原生监听（§7.3 桥接）。
6. `NodeSchema.props` 里**禁止**出现 `className`、`onClick`、`ReactNode` / VNode
   等框架专有值；schema 序列化后必须能被另一套框架原样渲染。这是「同一份 schema
   两种框架都能跑」的前提。

**协议净化项**：`PropValueType` 现有 `'reactnode'` 是协议层的 React 泄漏（当前无
调用方），改为 `'node'`，可保留一个 `@deprecated` 别名过渡。

### 12.4.1 setter / 编辑器 UI 的归属（**契约不变，实现按 flavor 分家**）

**结论：setter 不需要改成「无框架组件」，但它的契约必须无框架。** 它属于**设计时**，
不接触物料组件、`Driver` 或虚拟节点；输入是纯数据的 `PropMeta`，输出是纯数据的
`Command`。所以：

- **契约层**（`SetterProps` / `SetterContext` / 语义 kind）**无框架**，写在
  `protocol`，两套编辑器共用；
- **实现层**按编辑器 UI 的 flavor 各一份（React 用 shadcn，Vue 用 shadcn-vue），
  由注册表按 flavor 解析（§12.13.5）。

不追求「一套 setter 跨框架运行」—— 那需要自造 mount/dispose 宿主，与整树重渲染、
输入法/焦点、Context 桥接全都冲突，已否（§12.4.2）。

| 层 | 内容 | 框架要求 |
|---|---|---|
| 协议 / 数据 | `ComponentMeta` / `PropMeta` / `SetterRef` / `PageSchema` / `Command` | **必须无框架**（`protocol` / `model`） |
| 设计时逻辑 | session / 命令网关 / 命中 / 样式解析 / 属性行解析 / setter 注册表 | **必须无框架**（`designer-core`，§12.13） |
| 设计时 UI | `PropertyPanel` / `StyleSetter` / `StyleSetterExtras` / `setters` / `ui/*` | **按 flavor 一份**：`designer-react`（shadcn/Radix）· `designer-vue`（shadcn-vue/Reka） |
| 运行时物料 | `reactBindings` / `vueBindings` | 各一套，props 契约中立 |

**数据链**（现状已满足，无需改造）：

```
ComponentMeta(纯数据) → PropertyPanel 按 PropMeta.type/options/setter 选控件
  → onCommit(unknown) → SetProps / SetText / SetFlag / SetDirective(纯数据)
  → PageSchema → postMessage(lc:schema) → 画布 adapter
```

全仓核对：`designer` 对 `renderer` 只有 3 处 **type-only** import
（`MaterialRegistry`，M2 换成 `MaterialMetaSource`），**没有任何运行时 import**；
`PropertyPanel` 的 import 只有 `protocol` 的 `PropMeta`、`model` 的 `Command`、
`./setters`、`./ui/*`（shadcn）和 CSS Module。所以切换 `RENDERER_KIND` 时，
属性面板、样式页签、面包屑**零改动**。同一份 `ComponentMeta` 同时被 React 物料
与 Vue 物料使用，setter 也照样能编辑 Vue 物料的属性 —— 这正是 §12.4 描述/实现
分离的直接收益。

**继续用 shadcn/ui 的边界**（延续既有约定「lowcode 只是参考、不引入额外组件、
保持统一 shadcn UI」）：

- `packages/designer-react/src/ui/*`（Input / Select / Slider / Switch / ToggleGroup /
  Button / Textarea，底层 Radix）**只允许 designer 内部引用**；Radix 依赖留在
  `designer/package.json`，不进 `renderer-core`、不进任何 adapter。
- `renderer-react` 的物料**不得**从 designer 或 shadcn 取控件：物料是可独立发布的
  运行时资产，designer 的 shadcn 组件还带编辑器皮肤。物料要按钮就用原生元素或
  自己的 UI 实现。
- Vue adapter 同样不得引入 shadcn —— 它是运行时，不是编辑器。
- **两套编辑器 UI 各用自己框架的 shadcn 对应物**：React 侧 `shadcn/ui`（Radix），
  Vue 侧 `shadcn-vue`（Reka UI）。两者是同一套设计语言的两个移植，不是两套设计；
  共用一份 CSS Module 与 token 保证版式一致（§12.13.2）。**不得**换成 Element Plus
  / Ant Design Vue / Ark UI 成品组件 —— 那会同时破坏视觉一致与「不引入额外组件」，
  也让两版无法共享样式文件。
- **跨框架范式参照不得变成组件替换**：Ark UI / Zag.js 只作为 §12 的**架构参照**
  （core + 薄 adapter、锁步版本，见 §12.4.2），不作为运行时依赖引入。Ark UI 是
  headless 零样式，若以「支持多框架」为由把 `designer-react/src/ui/*` 从 shadcn/Radix
  换掉，会直接破坏已对齐 lowcode-engine 的视觉（Radix Select 的 Portal、
  ToggleGroup 的 #5584FF 选中态、统一 placeholder 色等），也违反「保持统一
  shadcn UI、不引入额外组件」的既有约定。
- 若要做 **Vue 版编辑器 UI**：不是「重写一套控件」那么简单 —— 先把设计时逻辑抽成
  `designer-core`，再写 `designer-vue`。顺序、契约与判据见 §12.13。

**本规范内 setter 侧只有 3 项收口**（都在协议 / 约束层，不改控件实现）：

1. `PropValueType` 的 `'reactnode'` → `'node'`（§12.4 协议净化）；`'func'` 明确为
   「**不允许**存进 schema」——setter 产出的值必须是 JSON 可序列化的纯数据，
   函数 / React 元素 / VNode 会在序列化往返中丢失，Vue 侧也无法还原。当前
   `PropertyPanel` 的 `BoolSetter` / `NumberSetter` / `SelectSetter` / `JsonSetter` /
   `TextSetter` 已符合，`'reactnode'` / `'func'` 也没有消费方。
2. `SetterRef` 保持纯数据形态（见 §12.4.2 推荐方案：收敛为**语义 kind 枚举**
   + JSON `props`，而不是任意组件实现名）；setter 的实现与映射表只存在于
   designer（design-time 解析），adapter 不得提供或覆盖 setter 实现。Vue 物料要
   特殊控件，办法是在共享 `ComponentMeta` 里写 `setter: 'color'` 这样的语义 kind，
   designer 映射到内置 shadcn 控件，而不是让画布框架参与。
   **注意：写本节时映射表尚未实现、`SetterRef` 是未接线的协议**；现已由 M4 接线
   （§12.12.6 末），本节保留作为决策依据。方案取舍见 §12.4.2。
3. 样式页签产出的 `style` 必须是 camelCase 普通对象（React `style` 与 Vue `:style`
   都吃），不得产出 `className` / 框架事件 / CSS-in-JS 对象。

### 12.4.2 自定义 setter 扩展点与「Vue setter」的边界

**先把三种容易混为一谈的问法分开**：

| 问法 | 结论 | 归属 |
|---|---|---|
| Vue **物料**要一个特殊属性控件 | 支持，且**不需要**用 Vue 写控件 | 本期目标 |
| 用 **Vue 组件**实现自定义 setter，挂进 React 设计器 | 技术上可行，本期不做 | v2 演进 |
| 整个编辑器 UI（含全部 setter）改成 Vue | 另一套产品、另一份规范 | 不做（§12.4.1） |

#### 现状核查：`SetterRef` 曾经是未接线的协议（M4 已接线）

这一条是回答「后续支持吗」的前置条件。`protocol/src/material.ts` 定义了
`SetterRef = string | { componentName, props? }`，但全仓消费只有
`PropertyPanel.tsx:300` 的一处字符串硬比较 `meta.setter === 'TextAreaSetter'`：

- **没有 `SetterRegistry`**，`componentName` 无法按名查找；
- **`SetterRefObject.props` 零消费**，对象形态实际不可用；
- `PropRow` 是 if/else 硬分派，且 setter 判断排在 `options` / `type` **之后**，
  与函数注释声明的「显式 setter > options > type」优先级不符。

也就是说：**当时连 React 自定义 setter 都不支持**。在 meta 里写任何非
`TextAreaSetter` 的名字都会被静默忽略、回落成 `TextSetter`。谈 Vue setter 之前，
得先有「自定义 setter 扩展点」这一层。

**容易混淆的一点**：仓库里确实有 `MaterialRegistry`（`renderer/src/registry.ts`），
但它注册的是 `{ meta, component }`（**物料实现**），不是 setter 控件。当前完整链路：

```text
renderer/materials/index.ts:56   builtinMaterials（20 个 {meta, component}）
  → App.tsx:86                  createMaterialRegistry(...)  // Map<componentName>
  → App.tsx:100                 createDocument(schema, registry)
  → model/node.ts:29            this.meta = resolver.getMeta(...)
  → PropertyPanel.tsx:203       node.meta?.props → 过滤 style → declared.map
  → PropertyPanel.tsx:287       PropRow 的 if/else 硬分派
```

setter 控件由 `designer-react/src/setters.tsx` **静态导出 5 个组件**（`Text` / `Number` /
`Bool` / `Select` / `Json`），`PropertyPanel` 顶部硬 import，**没有任何按名查找**。
实际分派顺序曾是 `bool → options → number → object/array → setter ===
'TextAreaSetter' → 默认 Text`，与注释声明的优先级不符：带 `options` 的属性写
`setter` 永远不生效（**已于 M-L3-2 修，见 §12.12.6**：现在显式 `setter` 最优先，
且对象形态 `{ componentName }` 也认）。物料 meta 里写了 `setter` 的只有 2 处
（`renderer/src/materials/blocks.tsx:116` 的 `FeatureCard.desc`、`:208` 的
`CodeBlock.code`），值都是 `'TextAreaSetter'`。`props.style` 被 `PropsTab` 过滤，
由 `StyleTab` 单独处理，不走 `PropRow`。M2 把 registry 换成 `MaterialMetaSource`
时不要误以为这里已经有一套 setter 注册机制。

#### 方案评审：中立扩展点（`SetterHost`）值不值得做

最初设想是引入框架中立的挂载契约（`SetterContext` + `mount(el, ctx): dispose`），
React 控件用 `createRoot` 适配、Vue 控件用 `createApp` 适配，宿主只认接口不认框架。

| 好处 | 说明 |
|---|---|
| 协议干净 | `SetterRef` 纯数据，宿主接口里没有 `ReactNode` / `VNode` |
| 框架隔离 | 框架知识集中在适配层，未来加 Vue / Web Component 不改协议与宿主 |
| 修掉静默回落 | 建立注册表后，未注册的 setter 名字不再被无声忽略 |
| 概念一致 | 与 §12.4 的「描述 / 实现分离」同构 |

**但代码核查后判定不采纳**，坏处是实的、收益是未来的：

| 坏处 | 依据 |
|---|---|
| 自造微前端容器 | `mount` / `dispose` / ctx 重放是一套自己发明的生命周期协议，只为「默认不做」的 v2 付现成本（YAGNI） |
| 与现有重渲染模型打架 | `Designer` 靠 `doc.subscribe(refresh)` 整树重渲染；每个 setter 一个 `createRoot` 后，适配层要自己把新 ctx 推进每个 root，`setters.tsx` 已处理的中文输入法 composition 与聚焦时光标跳动很容易被重新踩出来 |
| 焦点 / Portal 需重验 | `ui/select.tsx` 的 Radix `SelectContent` 走 Portal，跨多个独立 root 的焦点归还、Esc 关闭链要额外验证 |
| 类型安全退化 | `SetterProps` 的强类型在 `value: unknown` 的命令式边界丢失；DevTools 里从一个 root 变成多个 |
| 当前连桥接收益都没有 | 全仓 `designer-react/src` grep 不到 `createContext` / `useContext` / `Provider`，没有 Context 需要跨 root 桥接（若将来加主题 / i18n 才会成为问题） |
| 破坏 schema 自描述 | 允许注入「组件实现名」后，换一个编辑器（Vue 版、服务端预览、文档生成）都得提供同名实现，否则属性不可编辑 —— 等于把刚从物料抽掉的耦合又搬进 setter |

#### 推荐方案 A：语义 kind + 声明式 meta + 内置映射 + 可注入注册表

关键区分：**「协议中立」≠「宿主渲染机制中立」**。框架边界应该画在
`protocol` 这一层，不需要画进 `PropertyPanel` 内部 —— `SetterRef` 里永远只有
一个字符串，designer 的映射表用 React 类型**不构成任何泄漏**。

1. **`SetterRef` 从「组件实现名」收敛为「语义 kind」**：有限枚举
   `'text' | 'textarea' | 'number' | 'bool' | 'select' | 'json' | 'color' | 'icon' | 'spacing' | 'expression' | ...`，
   而不是 `'ColorSetter'` 这种任意组件名。`props` 只允许 JSON 纯数据。
   语义 hint 与实现无关：任何框架的编辑器都能各自实现同名 `color` 控件，
   schema 保持自描述、可移植。
2. **优先扩展描述而非注入实现**：颜色、图标、间距、单位、数据源绑定这类需求，
   先增强 `PropMeta` 的声明式字段（`options` / `min` / `max` / `step` / `unit` /
   `format` / `multiple` / `dataSource`），让内置控件组合覆盖；确实不够再加一个
   内置 kind，而不是开一个组件注入口。
3. **内置映射表 + 可注入注册表**：默认是
   `Record<SetterKind, SetterRegistration>`，`PropertyPanel` 按 kind 查表、查不到给
   明确诊断再回落内置分派；按 kind 优先于 `options` / `type`，顺带修正上面那处
   优先级不符（属 bug fix，单独记录）。注册表**可被宿主注入覆盖**，这是自定义
   setter 的正式入口（形态见下节）；注册项与 `SetterContext` 属于**公开契约**，
   写进 `protocol`，不再只是 designer 的内部实现细节。
4. **归属**：映射表只在 `designer`；adapter / 物料不得提供、覆盖或按需下载
   setter。`SetterRef` 的解析发生在 design-time，画布完全不参与。

| 收益 | 说明 |
|---|---|
| 零额外抽象 | 5 个现有控件不动，无 `createRoot`、无生命周期协议、无 Context 桥接 |
| 现有交互零回归 | 输入法 composition、聚焦草稿、整树重渲染同步、Radix Portal 焦点全部原样保留 |
| 类型安全 | `SetterProps` 强类型贯通，映射表编译期检查 kind 完整性 |
| schema 自描述 | 换任何框架的编辑器只需实现同一组语义 kind，不依赖某份组件实现 |
| Vue 物料照常支持 | 共享 `ComponentMeta` 写 `setter: 'color'` 即可，Vue 物料与画布 `kind` 都不参与 |

**阶段 1 纳入 M4**：只做 `SetterRef` 净化 + 声明式 meta + 内置映射表 +
`registerSetter()` 注入点；注册表未命中时走现有分派，行为不变。

#### 自定义 setter：四种消费方与「独立 render」的两种形态

用户提议「setter 也按框架走自己的独立 render」。这个方向在**包边界**上成立、在
**运行时挂载**上不成立 —— 必须拆开看，否则会把上面刚否掉的 `SetterHost` 又请回来。

**先看能力缺口**（`designer-react/src/setters.tsx:25`）：`SetterProps` 只有 5 个字段
`value / options / placeholder / multiline / onCommit`。用它写自定义 setter 做不了
下列任何一件事，而这些正是「需要自定义」的典型场景：

| 缺什么 | 缺了做不了 |
|---|---|
| `meta`（`min` / `max` / `step` / `unit` / `format`） | 单位数值输入、范围滑块、格式化显示 |
| `field`（属性名） | 数据源绑定、按属性名走不同规则 |
| 节点 / 页面只读快照 | 「条件显示」「联动其他属性」类 setter |
| `batch()` | 一次写多字段（间距四向、边距简写），且只进一条历史 |
| `disabled` | 页面锁定 / 只读态下正确禁用控件 |

所以「支持自定义 setter」的真实成本不在渲染方式，而在**一次性把 `SetterContext`
设计够** —— 它一旦对外发布就是破坏性变更，比包名难改得多。`batch` 有现成通路：
`SetProps` 接受 `Record<string, unknown>`，`mergeWith` 按 `nodeId + 排序键` 合并
（`commands.ts:132`），多键写仍是**一条**历史记录；`StyleSetter.tsx:238` 的
`batch` 就是同款做法。

**「独立 render」有两种形态，只有一种对**：

| 形态 | 含义 | 判定 |
|---|---|---|
| R1 实现独立 | setter 实现按框架分包（`setter-react` / `setter-vue`），由**各自框架的编辑器直接渲染** | ✅ 采纳。这正是 Ark UI / Zag 绑定层的形态，也是你提的方向 |
| R2 容器独立 | 每个 setter 用 `createRoot` / `createApp` 单独挂载，自建 `mount(el, ctx)` 生命周期 | ❌ 不作为默认路径。R1 **不需要**它：React 版编辑器里 setter 就是普通 React 组件，没有额外渲染机制 |

**四种消费方，解法不同**（这是上一轮方案 A 的盲点）：

| 消费方 | 场景 | 解法 | 本期 |
|---|---|---|---|
| A 编辑器团队 | 加颜色 / 图标 / 间距 / 表达式控件 | 新增**内置 kind** + 控件实现，随编辑器发布，保证皮肤与值契约一致 | ✅ |
| B 物料作者（本仓） | 某物料要特殊控件 | 共享 `ComponentMeta` 写 `setter: 'color'`（语义 kind、JSON 纯数据）；**不需要**自带实现 | ✅ |
| C 业务方 / 第三方 | 公司设计系统的取色器、带远程搜索的选人器 | `registerSetter()` 注册进注入的注册表；schema 只存 kind 名，**换实现不改 schema、不需迁移** | ✅ 注册表可注入即可，**不必拆包** |
| D 非本框架实现 | Web Component、遗留 Vue2 控件、带自有 DOM 的富文本 | 写一个薄 React 包装组件（`ref` + `customElements` / 原生挂载）走 `{ component }`，**不需要**内建挂载契约 | ✅（配 `{ load }` 按需拉） |

关键判断：**C 类不需要拆包**。第三方 setter 若是纯 React 组件，它只需要 React +
自己的 UI，连 `designer` 都不用 import，类型从 `protocol` 的 `SetterContext` 拿。
拆 `setter-react` 的收益是「复用我们的 shadcn 控件壳 + 独立版本治理」，不是
「能不能自定义」—— 这两件事经常被混为一谈。

**注册项形态：把「独立 render」落在可选接口上，而不是默认路径上**：

```ts
type SetterRegistration =
  | { component: ComponentType<SetterContext> }                              // 默认快路径
  | { load: () => Promise<SetterModule | SetterComponent> }                   // 编辑中按需加载
  | { dynamic: (ctx: SetterContext) => SetterComponent | SetterRegistration }; // 引擎 isDynamic 等价物

interface SetterRegistry {
  register(kind: SetterKind, entry: SetterRegistration | SetterComponent, source?: string): void;
  /** 未注册返回 undefined —— 调用方必须给诊断，不允许静默回落 */
  get(kind: string): RegisteredSetter | undefined;
  /** 版本号 + 订阅：注册发生在编辑过程中时，面板靠它刷新 */
  getVersion(): number;
  subscribe(listener: () => void): () => void;
}
```

默认路径（`component`）零额外抽象，就是今天的 5 个控件；`{ load }` 只在首次用到时
才拉包，`{ dynamic }` 只给「按上下文换控件」的场景。**内建 `mount` 契约被彻底去掉**
—— 非本框架实现用一个薄 React 包装组件即可。与「所有人先付」的 `SetterHost` 相反，
成本只落在用到的人身上，这也是「自定义 setter」能同时满足「可插拔」和「零回归」的
原因。

**值契约跟着 kind 走**：每个 kind 自带 `normalize / validate / serialize` 三个纯
函数（放 `protocol`，可单测）。好处是同一 kind 换实现（React / Vue / 第三方）时
行为一致，第三方写入非法值时能在提交前拒绝并提示，而不是等物料渲染时静默回落。

#### 被否备选与触发条件

| 备选 | 判定 | 触发条件 |
|---|---|---|
| `SetterHost` 自造挂载契约（**全局强制**） | 不采纳 | 非本框架实现用薄 React 包装组件接入即可（上节 D 类），不内建 `mount`；若真出现「同一属性面板必须混挂多框架 setter」，更该整组替换编辑器 UI |
| Web Component（Custom Elements + CustomEvent） | v2 备选 | 若需要**第三方**跨框架提供 setter，浏览器原生生命周期 + Shadow DOM 隔离比自造 `SetterHost` 标准；代价是要引 WC 链、shadcn 包壳别扭、跨 Shadow DOM 的输入法与焦点更麻烦 |
| Vue 组件实现 setter 挂进 React 面板 | v2，默认不做 | 见下 |
| 整套 Vue 版编辑器 UI | 不做 | 另一套产品、另一份规范（§12.4.1） |
| Lexical 式 `setter-core` / `setter-react` / `setter-vue` 三包 | 见下方范式评估 | 两个触发条件任一成立才拆：① 第三方要**复用我们的控件壳**（否则只需注入注册表）；② 有**独立 Vue 版编辑器**产品 |

#### 范式评估：能不能照搬 Lexical 的 core + 框架绑定包

先核实范式本身（2026-11-06 查 npm registry）：Lexical 官方 API 文档写的是
「Framework Agnostic Core — ... with **official React bindings**」，实际只有
`@lexical/react` 是官方（Meta 6 名 maintainer）。Vue 侧是社区单人维护的
`lexical-vue`，实测版本差：

| 包 | 版本 | 关键事实 |
|---|---|---|
| `lexical`（core，官方） | **0.53.0** | Meta 维护，GitHub Actions trusted publisher |
| `lexical-vue`（社区） | **0.18.0** | `dependencies` 里**硬钉** `lexical: 0.50.0` 及整套 `@lexical/*@0.50.0`，落后 core 3 个 minor；且 core 放在 `dependencies` 而非 `peerDependencies`，会与宿主的 0.53.0 装成两份 |

也就是说「core + 各框架包」最大的现实成本不是设计，而是**绑定包版本漂移 +
core 被复制多份**。但这是**维护策略**问题，不是范式固有缺陷：下方 Ark UI 的实测
证明官方同仓维护多套绑定可以完全锁步。另补一处归因更正 —— 导致装出两份 core
的是**版本钉死不一致**（0.50.0 vs 0.53.0），不是把 core 放进 `dependencies`；
框架无关的 core 放 dependencies 只要版本一致就能 dedupe。§12.3 已按这两类依赖
分别约束。

**对引擎整体：方向正确，且 §12 已经是这个结构。**

| Lexical | 本项目 |
|---|---|
| `lexical` core（EditorState / 节点 / 命令 / 自研 DOM reconciler） | `protocol` / `model` / `drag` / `renderer-core`（schema / Command / 纯 DOM 命中） |
| `@lexical/react` | `renderer-react` |
| `lexical-vue`（社区） | `renderer-vue`（**同仓自建**，避免漂移） |
| 同一应用只装一套绑定 | `VITE_RENDERER_KIND` 装配期二选一（§12.7） |

**对 setter：不照搬三包拆分**，因为厚薄比例正好相反。Lexical 的 core 自己操作
contenteditable DOM、持有可序列化状态，绑定层只做「接响应式状态 / 注册插件 /
桥接 decorator node」；而我们 setter 的状态全在 `Document`（已在 `model`），
剩下几乎全是 UI —— `setters.tsx` 的中文输入法 composition、受控草稿、光标保护，
以及 `ui/*` 的 Radix 控件。**Lexical 自己也没把输入控件放进 core**，它们就在
`@lexical/react` / `lexical-vue` 里。再抽一个 `setter-core` 只会与 `protocol` /
`model` 重复分层：语义 kind、`PropMeta`、值 normalize / validate / serialize 本就
是纯数据契约，放 `protocol` 即可。

实测拆包成本：`designer-react/src/ui/*` 的 7 个控件不只被 `setters.tsx` 引用，
`PropertyPanel` / `StyleSetter` / `StyleSetterExtras` 都在 import；`--lc-placeholder`
等编辑器皮肤变量由 `apps/shared/src/styles.css` 提供、散落在 8 个 CSS Module。
拆出 `setter-react` 要连带搬 shadcn + Radix 依赖与 CSS 变量归属，designer 其余面板
全部改 import，收益却只是把「已经在 protocol 的契约」换个包名。

**值得借的是 Extensions 那层**：Lexical 新版 `defineExtension` 是框架无关的
（同一个 `RichTextExtension` 在 React / Vue / Svelte 通用），绑定包只负责渲染。
对应到 setter 就是方案 A 的自然延伸 —— **共享「行为契约」（kind 枚举 + 值
normalize / validate / serialize + 联动规则，纯函数、可单测），UI 控件由各框架
编辑器按同一组 kind 自己注册**。这样 Vue 侧若真要做独立编辑器，`setter-contract`
可直接复用，不必重写规则，也不必把 React 控件挂进 Vue 面板。

由此新增两条硬约束（适用于所有 `*-react` / `*-vue` 绑定包）：
1. 同仓维护、**锁步版本号**：core 与所有绑定包同版本发布，装配期校验一致；
2. 一个装配只引入**一套**绑定包，禁止宿主同时 import 两个框架的绑定（§12.7）。

#### 范式评估 2：Ark UI / Zag.js —— 更贴近的正面参照

用户提议参考 `ark-ui.com/docs`。核实后确认，它比 Lexical 更贴合 §12 的诉求：
**公共 core + 官方同仓维护的多框架包 + 各自引入**，且实测不存在版本漂移。

**包结构实测**（2026-11-06 查 npm registry）：

| 包 | 版本 | 关键事实 |
|---|---|---|
| `@ark-ui/react` | **5.40.0** | `repository.directory: packages/react`；`peerDependencies: react >=18 / react-dom >=18` |
| `@ark-ui/vue` | **5.40.0** | `repository.directory: packages/vue`；`peerDependencies: vue >=3.5` |
| 两者共同点 | — | 同为 `chakra-ui/ark` 仓、**同一 `gitHead` `9a3f857e`**、同批 maintainer、同版本发布；官方同时维护 React / Vue / Solid / Svelte 四套绑定 |
| `@zag-js/core` | **1.47.0** | 描述「A minimal implementation of xstate fsm for UI machines」；`dependencies` 只有 `@zag-js/utils` + `@zag-js/dom-query`，**零框架依赖** |
| 两包的 `@zag-js/*` | 全部 **1.47.0** | 各 60+ 个机器包（`dialog` / `select` / `slider` / `toggle-group` / `radio-group` / `color-picker` …）版本逐一相同，**唯一差异是 `@zag-js/react` vs `@zag-js/vue` 这一个适配包** |

**Zag 的三层职责**（官方文档 `overview/installation`、`overview/whats-a-machine`）：
`machine()` 用有限状态机描述状态 / 转换 / context（只操作 DOM、框架无关）→
`connect(service, normalizeProps)` 产出 prop getters（`getRootProps()` 等，含
ARIA / `data-*` / 事件）→ 各框架适配器提供 `useMachine` + `normalizeProps`，
只做「响应式接线 + props 格式归一」（React `onKeyDown` vs Vue `onKeydown`、style
数值 vs 带单位字符串）。官网 about 页原话是「state machines that interact solely
with the DOM. Framework-specific adapters handle events and state management」，
Zag 官网则是「Machines handle the logic. You handle the UI」。

**对引擎整体：印证 §12，并给出「薄适配层」的量化尺度。** 框架差异应收敛到
**一个**适配包，其余（schema / Command / 命中规则 / `shouldPlacePlaceholder` /
DOM props 契约）全在 core。§12.3 的 `renderer-react` / `renderer-vue` 也应做到
「除框架适配文件外逐一同构」。`normalizeProps` 与现有 `evaluator` 产出纯数据
`IRNode`、adapter 只做 `createElement` / `h()` 归一是同构思路，**不需要新增一层**。

**对 setter：结论不变，且论证更强。** Zag 明确把「UI / 输入控件」留在框架层，
core 里只有交互状态机；我们 setter 的状态已在 `Document`，剩下的中文输入法
composition、受控草稿、光标保护、Radix Portal 焦点恰恰属于「You handle the UI」
那部分。Zag 要摊平状态机成本靠的是 45+ 个复杂组件（DatePicker / ColorPicker /
TreeView …），当前 setter 只有 5 个基础输入控件（`Text` / `Number` / `Bool` /
`Select` / `Json`），引入状态机是过度设计。因此 **方案 A 与 Ark UI 同构而非相反**：
`setter-contract`（kind 枚举 + 值 normalize / validate / serialize，纯函数）对应
Zag 的 machines，各框架编辑器的控件映射表对应 adapters。

**借 / 不借清单**：

| 借 | 说明 |
|---|---|
| 同仓锁步版本的治理目标 | 从「防漂移的补救」升级为有正面实证的可达目标；§12.3 已按两类依赖重写 |
| 「框架差异收敛到一个适配包」的验收尺度 | 写进 §12.9，两套 adapter 除适配文件外应逐一同构 |
| 行为契约与渲染分离 | 方案 A 的 `setter-contract` 定位对齐 Zag machines |

| 不借 | 理由 |
|---|---|
| 状态机 / `connect` prop getters | 5 个基础控件，YAGNI；`Document` 已是唯一状态源 |
| 60+ 个细粒度机器包 | 规模不匹配，一个 `renderer-core` 足够 |
| Ark UI 组件本身 | headless 零样式，会破坏已对齐 lowcode-engine 的 shadcn 皮肤（§12.4.1 红线） |

**触发条件**（两个，任一成立才拆）：① 第三方要复用我们的 shadcn 控件壳 ——
只自定义控件本身用注册表注入即可，不必拆包；② 有独立 Vue 版编辑器产品。
Ark UI 证明它在**治理上可行**，但决定因素仍是**有没有第二个消费方**，不是技术
可行性；本期没有，故 M1~M5 不拆。同时确认上一轮留的分支：Ark UI 范式对应的是
「独立 Vue 版编辑器引 `setter-vue`」，**不是**「在 React designer 里按需挂 Vue
setter 包」—— 后者仍是阶段 2 已否的路径。

#### 阶段 2：Vue 写的 setter（v2，默认不做）

推荐方案下 Vue setter **不是**加一个适配层就完事 —— 它需要自己的一套控件，
代价不在技术而在一致性：

| 代价 | 说明 |
|---|---|
| 三份运行时共存 | 宿主 React + setter Vue + 画布框架，与「一次装配只启用一套框架」的初衷相悖 |
| shadcn 皮肤无法复用 | `designer-react/src/ui/*` 是 React/Radix；Vue setter 自带控件会让同一属性面板出现两种视觉 |
| 隔离与生命周期 | 样式沙箱、卸载 unmount、值外溢同步、输入法 composition、焦点管理都要重做 |
| 收益为零 | setter 是设计时资产，与画布框架正交；Vue 物料只需要语义 kind |

**结论（回答「setter 需要适配 Vue 吗」）：本期不需要，也不产出任何 Vue 适配
代码** —— 不建 `setter-vue` 包、不写 Vue 控件、不在 designer 里加载 Vue runtime。
Vue 团队要用编辑器，走 §12.7.1 的 iframe 嵌入，属性面板仍是 React + shadcn。

更合理的路径是**做独立 Vue 版编辑器 UI，按同一组语义 kind 实现自己的控件**
（schema 不变、协议不变），而不是往 React 面板里挂 Vue setter。因此新增约束：
**一个编辑器实例内只启用一种 setter 实现族**（默认 React + shadcn），不允许
混挂。这与 §12.2 C2 同思路，但作用域是设计时 UI，不是画布。

**对「二选一」语义无影响**：C2 约束运行时画布，setter 属于设计时空，两者正交。
Vue setter 若落地，画布仍可以是 React，反之亦然。

### 12.5 驱动与 adapter 接口

`Driver<Output>` 保持不变（§5.1），补一层 adapter 把「挂载」也收进框架实现：

```ts
export interface DriverOptions {
  /** 编辑态才注入空容器占位；运行态必须关掉 */
  editorPlaceholder?: boolean;
}

export interface RendererAdapter<Output = unknown> {
  readonly kind: FrameworkKind;
  readonly bindings: MaterialBindings<unknown>;
  createDriver(registry: MaterialRegistry, options: DriverOptions): Driver<Output>;
  /** 挂载到画布根，返回卸载函数；整树重渲染时先 dispose 再 mount */
  mount(container: HTMLElement, output: Output): () => void;
}

export function loadAdapter(kind: FrameworkKind): Promise<RendererAdapter>;
```

- `createReactDriver` / `createVueDriver` 都是 `createDriver` 的具体实现：
  `createElement(Component, props, ...children)` ↔ `h(Component, props, children)`，
  `key` / `data-node-id` / `data-edit-flags` 语义一致。
- `shouldPlacePlaceholder` 与 `flagString` 属于**框架中立规则**，挪进 `core`，
  两套 driver 共用，避免两份判断漂移。
- `mount` 存在的理由：`createRoot` / `createApp` 是框架 API，画布应用不该知道。
- `Driver.renderRoot` 的输出只在本框架内流转，**绝不跨 postMessage 传递**。

### 12.6 画布宿主契约（保持现状，不许框架化）

| 项 | 约定 |
|---|---|
| 装载 | 同源 iframe，`canvas.html`；`canvasUrl` 由宿主给出（现为 `new URL('canvas.html', location.href)`） |
| 握手 | 画布 → 宿主 `lc:canvas-ready`；宿主 → 画布 `lc:schema`（全量 schema + padding） |
| 根节点 | `[data-lc-canvas]`，`position:relative; display:flex; flex-direction:column` |
| 更新 | schema 每次变化整树重渲染（D14）；编辑态 `mode:'edit'` 保证 1 节点 ↔ 1 DOM（D7） |
| 拦截 | 画布原生监听：`dragstart` 阻止、`a[href]` 点击阻止导航 |
| 隔离 | 画布文档不加载设计器代码；设计器不加载画布物料代码 |

`canvas.html` 是**装配边界**：换框架只换这个入口加载的 adapter，宿主文件不动。

### 12.7 装配与「二选一」

```ts
// apps/shared/src/framework.ts —— 构建时常量，便于 tree-shake
export const RENDERER_KIND: FrameworkKind =
  import.meta.env.VITE_RENDERER_KIND === 'vue' ? 'vue' : 'react';

// ① 宿主侧（index.html）：只要 meta，不加载任何 adapter
const metaSource = createMetaRegistry(builtinMaterialMetas);
const document = createDocument(schema, metaSource, page);
<Designer document={document} metaSource={metaSource} ... />

// ② 画布侧（canvas.html）：只加载选中那一个 adapter
const adapter = await loadAdapter(RENDERER_KIND);
const registry = createBindingRegistry(
  builtinMaterialMetas, adapter.bindings, RENDERER_KIND,
);
const driver = adapter.createDriver(registry, { editorPlaceholder: true });
const ir = evaluate(schema.componentsTree, { mode: 'edit', scope: {}, resolver: registry });
const dispose = adapter.mount(canvasRoot, driver.renderRoot(ir));
```

约束：

- `loadAdapter` 用动态 `import()` 按 `kind` 分支，配合构建时常量替换，保证产物里
  **只有一套**框架实现；另一套不进 bundle。
- `createBindingRegistry` 校验 `registry.kind === adapter.kind`；`Document` 与
  `Designer` 只持有 `MaterialMetaSource`，拿不到 `resolve`，从类型上杜绝宿主触碰组件。
- `Designer` 现有 `registry` prop 类型改为 `MaterialMetaSource`（名称可保留）。
  改动面很小：全仓只有 `getMeta` / `has` / `list` 三处调用
  （`Designer.tsx:311`、`drop-context.ts:118`、`MaterialPanel.tsx:43`），且都是
  type-only import；`list()` 返回值从 `MaterialDefinition[]` 改成 `ComponentMeta[]`
  后，面板里 `.meta` 这一层解包去掉即可。
- 预览页（`/preview`，独立 HTML 入口）与画布用**同一个** `RENDERER_KIND`，
  `sessionStorage` 只传 schema（框架无关），运行态 `mode:'runtime'`、`editorPlaceholder:false`。
- **禁止**：一个 `Document` 挂两个 adapter、按 `componentName` 分派到不同框架、
  运行时通过 URL 热切换 `kind`（连 dev 也不留 URL 覆盖 —— 两个 flavor 就是两个
  server，见 §12.13.6）。

#### 12.7.1 Vue 宿主的接入形态

「Vue 怎么引入」要按**消费方**分，三种情况互不相同：

| 消费方 | 引入什么 | 需要 designer 吗 | 何时可用 |
|---|---|---|---|
| ① 生产渲染：Vue 业务系统把 `PageSchema` 渲染成页面 | `renderer-vue` + `renderer-core`（纯运行时） | 不需要 | M5 才有 `renderer-vue` |
| ② 设计端：Vue 团队要用这个编辑器 | `designer-react` 以 iframe / 路由懒加载嵌入 | 需要 | 现在就有 |
| ③ 整套 Vue 版编辑器 | `designer-vue` + `designer-core` + `designer-ui` | 需要 | **已定稿，见 §12.13**（M-L3-3~5） |

**① 生产渲染：纯 Vue 应用里只有 Vue，没有 React。**

```ts
// Vue 应用入口（目标态，M5 落地）
import { evaluate, createBindingRegistry, builtinMaterialMetas } from '@lowcode-next/renderer-core';
import { createVueAdapter } from '@lowcode-next/renderer-vue';
import schema from './page.json';

const adapter = createVueAdapter();          // 内部即 createApp，业务方不直接调 Vue API
const registry = createBindingRegistry(builtinMaterialMetas, adapter.bindings, 'vue');
const driver = adapter.createDriver(registry, { editorPlaceholder: false });
const ir = evaluate(schema.componentsTree, { mode: 'runtime', scope: {}, resolver: registry });
const dispose = adapter.mount(document.getElementById('app')!, driver.renderRoot(ir));
```

调用序列与 §12.7 的画布装配**完全一致**，差别只有 `mode: 'runtime'`、
`editorPlaceholder: false`、以及不经过 `loadAdapter` 的运行时分支。

这条路径里 `react` **完全不在依赖树中** —— 前提是 M1/M3 把 `renderer` 的 `react`
从 `dependencies` 挪到 `peer`，并把求值器拆进 `renderer-core`。这正是 M1 的首要目的。

**② 设计端：Vue 宿主嵌 React 编辑器，两种方式。**

| 方式 | 做法 | 代价 | 建议 |
|---|---|---|---|
| iframe 独立部署 | 编辑器单独构建/部署一个页面，Vue 应用 `<iframe src=".../designer">` | 跨文档只能走 `postMessage`；多一次文档加载 | **推荐**：样式与运行时天然隔离，Monaco 不进业务主包，可独立发版 |
| 同页路由懒加载 | `const Designer = lazy(() => import('@lowcode-next/designer'))` | Vue 应用同时装 Vue + React 两套 runtime；tailwind preflight 与全局样式要收敛 | 次选：仅当必须共享登录态 / DOM 上下文 |
| 微前端（qiankun / wujie） | 子应用挂载 | 沙箱、路由、样式都要额外治理 | 不推荐，收益不抵成本 |

iframe 方式的交换契约只有两个纯数据消息：

```ts
// Vue 宿主 → 编辑器
frame.contentWindow.postMessage({ type: 'lc:load', schema }, editorOrigin);
// 编辑器 → Vue 宿主
window.addEventListener('message', (event) => {
  if (event.origin !== editorOrigin) return;
  if (event.data?.type === 'lc:save') api.savePage(event.data.schema); // PageSchema
});
```

**③ 三层运行时共存是合法的，别把 C2 理解成「整页只能一个框架」。**

C2（§12.2）约束的是**一个画布一个框架**，而画布本身在 iframe 里，所以下面这种
组合完全成立，也是 Vue 团队的常态：

```text
Vue 业务系统（vue runtime）
  └─ iframe #1 编辑器（react runtime：designer + shadcn/Radix + Monaco）
       └─ iframe #2 画布（RENDERER_KIND 决定：vue 或 react runtime）
```

反过来，若 Vue 团队只想要编辑器、暂时不需要 Vue 物料，把画布 `kind` 设为 `react`
更省 —— 少一份 runtime，等 `renderer-vue` 稳定再切。切换只改构建时常量，编辑器与
schema 都不动。

**构建注意（M5 前必须处理）**：

- `apps/shared/vite.base.ts` 的 `resolve.dedupe` 目前是 `react` / `react-dom` /
  `vue`（两个 app 共用一份配置），加新适配时必须同步
  （响应式会失效，症状比 React 双份更隐蔽）。
- `canvasUrl` 是 `new URL('canvas.html', location.href)`（`Designer.tsx:124`），
  Vue 版入口沿用同名 `canvas.html` 即可无缝替换，`Designer` 不用改。
- Monaco 只属于编辑器，不进 `renderer-react` / `renderer-vue`；iframe 部署下它
  天然不进业务主包。

**与 setter 的关系**：①② 都**不需要** Vue 版 setter —— ① 是纯运行时、没有属性面板；
② 的属性面板是编辑器内的 React + shadcn 控件，编辑的是共享 `ComponentMeta`，与画布
`kind` 无关。③（`designer-vue`）需要 Vue 控件：复用 `setter-contract`，按 flavor 注册
第二份实现，重写的是控件而非规则（§12.13.5）。

**两条路线的成本差**：② 是今天就能用的 iframe 集成，改动量近乎为零；③ 是
M-L3-1~5 的完整轨道（Vue 视图层 ≈ 7 400 行）。**先问「是嵌入还是要自建编辑器」，
再决定走哪条** —— 这是本节最重要的判断，不要因为「支持 Vue」四个字就默认走 ③。

### 12.8 迁移步骤（每步独立可验证、前四步零行为变化）

| 步 | 内容 | 验收 |
|---|---|---|
| M0 | 本节规范冻结，确认 §12.11 决策点 | 无代码改动 |
| M1 | 新建 `renderer-core`：搬 `evaluate` / `IRNode` / `Driver` / `MaterialResolver` / `shouldPlacePlaceholder` / `flagString` / `builtinMaterialMetas`；`renderer` 保留别名层 | React 画布视觉零回归 |
| M2 | `designer` 的 `registry` 改为 `MaterialMetaSource`，去掉对具体类的 type import | 130 单测 + 拖拽/命中/属性面板回归 |
| M3 | `renderer-react` 收敛为 `RendererAdapter`，`react` 从 dependencies 改 peer；`canvas.html` / `preview` 走 `loadAdapter` | 产物中 react 只由宿主提供 |
| M4 | 协议净化 `'reactnode'` → `'node'`、收紧 `'func'` 与 setter 产出值约束（§12.4.1）；`SetterRef` 收敛为语义 kind + JSON `props`、增强 `PropMeta` 声明式字段、写 `SetterContext` / `SetterRegistration` / 每个 kind 的 `normalize·validate·serialize` 进 `protocol`、建内置映射表 + `registerSetter()` 注入点（§12.4.2 方案 A，未命中时走现有分派，零行为变化）；补「物料契约」检查（唯一根 + attrs 透传 + 无框架专有 props） | 同一 schema 序列化往返一致；内置 setter 视觉与输入法交互零回归 |
| M5 | 新建 `renderer-vue`，实现 `createVueDriver` / 20 个物料绑定 / `mount` | 见 §12.10 |

M1~M4 每一步都要跑 `npx tsc -b`、`npx vitest run`、`pnpm build` 与 5173 浏览器
冒烟（0 error / 0 warning / 0 pageerror / 无 Vite overlay）；按项目约定，期间
**不新增测试用例**，最后统一补齐。

**设计时（L3）另有独立轨道** `M-L3-1`~`M-L3-5`，见 §12.13.7。它与上表并行、互不
阻塞，唯一交汇点是 `designer-core` 导出的 session 与 setter 契约 —— 因此
`M-L3-1`（抽 core）应排在 `M4`（setter 接线）之前，否则 setter 接线要写两遍。

### 12.9 验收标准（多框架）

- [ ] `packages/{protocol,model,drag,renderer-core}/src` grep 不到 React / Vue 字样
- [ ] `KIND=react` 与 `KIND=vue` 加载同一 `landingSchema`，去掉框架私有属性后，
      `data-node-id` 的序列与层级完全一致
- [ ] 两种 `KIND` 下：拖入物料、跨容器移动、选中/悬停框、面包屑、属性面板改样式
      行为一致；滚动时虚线框不抖动（§7.4.1）
- [ ] `createBindingRegistry` 在缺/多一个物料绑定时抛错并列出差集
- [ ] `registry.kind !== adapter.kind` 时抛错
- [ ] 两套 adapter 的框架差异收敛到**一个**适配包：core 与所有绑定包版本一致，
      除 `create*Driver` 类适配文件外逐一同构（Ark UI / Zag 参照，§12.4.2）
- [ ] 产物检查：Vue 构建不含 `react-dom/client` 的画布路径，React 构建不含 Vue runtime
- [ ] 同一 `ComponentMeta` 在两种 `KIND` 下，属性面板控件集合与写回的 `props`
      完全一致；`PropertyPanel` / `setters.tsx` 不出现按 `kind` 分支、不 import adapter
- [ ] `SetterRef` 是有限语义 kind 枚举、可 JSON 序列化往返；未知 kind 有明确诊断，
      不静默回落成 `TextSetter`；协议内不含组件引用 / VNode / `ReactNode`
- [ ] `meta.setter` 的 kind 优先于 `options` / `type`（修正现优先级 bug）：带
      `options` 的属性写 `setter` 必须生效
- [ ] `SetterContext` 只含纯数据与回调，无 `ReactNode` / `VNode` / 组件实例；
      `batch()` 多键写入只产生**一条**历史记录（`SetProps` 按 `nodeId + 排序键` 合并）
- [ ] 同一 `SetterKind` 换实现（`registerSetter()` 覆盖内置）不改 schema、不需
      数据迁移；第三方 setter 写入非法值时被该 kind 的 `validate` 拒绝并有可见提示
- [ ] 编辑器两个 flavor 互不污染：`designer-react` 的产物 grep 不到 `vue`，
      `designer-vue` 的产物 grep 不到 `react` / `react-dom`；两者只共享
      `designer-core` / `designer-ui`（§12.13.6）
- [ ] 同一 `SetterKind` 在 React 与 Vue 各有实现时，`registry.match(kind)` 在各自
      flavor 下命中自己那份；只注册了别的 flavor 时报 `flavor-mismatch`（可见诊断，
      不渲染、不静默回落）——§12.13.5
- [ ] Vue 宿主接入只依赖 `renderer-vue` / `renderer-core` 与 `PageSchema`（纯运行时
      场景不需要任何编辑器包，§12.7.1）

### 12.10 风险

| 风险 | 应对 |
|---|---|
| 两套物料行为漂移 | meta 共享 + `shouldPlacePlaceholder` 等规则进 core + §12.9 的 DOM 序列比对 |
| 框架绑定包版本漂移（core 升级、Vue 包落后） | 同仓锁步版本 + 装配期版本校验（§12.3）；反面参照 `lexical-vue` 硬钉旧 core，正面参照 Ark UI 四套绑定锁步 5.40.0 / Zag 1.47.0 |
| 把「跨框架范式」当成替换 shadcn 的理由 | Ark UI / Zag 只作架构参照，不进依赖；`designer-react/src/ui/*` 固定 shadcn/Radix（§12.4.1 红线） |
| Vue 多根组件丢 attrs | §12.4 契约第 1 条 + M4 的物料契约检查 |
| Vue 主应用与 adapter 各装一份 vue（`dedupe` 漏配） | `resolve.dedupe` 补 `vue`；产物检查两份 runtime（§12.7.1） |
| Vue 宿主同页嵌 React 编辑器导致样式互相污染 | 默认 iframe 独立部署，同页懒加载仅作次选（§12.7.1） |
| `list()` 返回值变更影响面板 | M2 一并改，调用点只有 3 处 |
| 动态 import 把两套框架都打进产物 | 构建时常量替换 + 产物检查（§12.9） |
| Vue setter 与 React 版视觉不一致、实例内混挂多框架 | §12.13 两条硬约束：两版 import **同一个 `*.module.css` 与 token**（版式天然一致）+ 注册表按 flavor 解析（一个实例只启用一族实现） |
| 两套编辑器 UI 行为漂移（同一 schema 两版表现不同） | 逻辑全在 `designer-core`；判据是「命令序列 → `doc.toSchema()` 字节一致」，测 core 不测 UI（§12.13.7） |
| 为「支持 Vue」先写 Vue 版、后补 core | 顺序写进 §12.13.7：M-L3-1 必须先行；否则 `style`/`props`/`tree` 规则复制两份，之后必然分叉 |
| 把「iframe 嵌编辑器」误升级成「自建 Vue 编辑器」 | §12.7.1 的成本对比先摆出来：iframe 近乎零成本，双框架是 ≈7 400 行视图层 |
| meta 里写了自定义 `setter` 名字但被静默忽略 | M4 建内置映射表 + `registerSetter()` 注入点 + 未知 kind 显式诊断（§12.9） |
| 自定义 setter 开成组件注入口，破坏 schema 自描述 | 方案 A 用语义 kind + 声明式 `PropMeta`，不由协议携带实现名；注册表键是 **kind**，不是组件名（§12.4.2） |
| 第三方 setter 写入不合法值，画布静默回落 | 每个 kind 自带 `normalize` / `validate` / `serialize` 纯函数，提交前校验并给可见提示（§12.4.2） |
| `SetterContext` 成事实公开 API 后难改 | 一经发布即按公开契约对待：只允许新增可选字段，不删字段、不改既有语义；与绑定包同走锁步版本（§12.3） |
| 把「按框架分 setter 包」误当成自定义的前置条件，过早拆三个包 | §12.3 已记实测成本（`ui/*` 297 行 / 4 处引用）；C 类消费方用注入注册表即可。**`ui-react` 仍不拆**；`designer-core` / `designer-ui` 不是「按框架分」，而是「逻辑 / 样式 与 视图分」，由 §12.13 触发 |
| 表达式沙箱（M6）引入框架对象 | `EvalContext.scope` 只允许纯数据，求值器留在 core |

### 12.11 决策记录（7 项；第 6、7 项已按用户决策定稿，其余按建议默认）

> 第 6 项已由用户拍板：**参考 lowcode 的注册表逻辑，支持自定义 setter 在编辑中
> 加载**，已写入 §12.4.2 与 §12.12.5~12.12.6。其余 5 项维持建议值（可单独推翻，
> 不阻塞 M1 开工）。
>
> Ark UI / Zag.js 已按用户建议**采纳为架构参照**（只借「core + 薄适配层 +
> 同仓锁步版本」的结构，不引入任何运行时依赖、不替换 shadcn），落在 §12.3 /
> §12.4.1 / §12.4.2 / §12.9 / §12.10；**不新增第 7 项待确认**。

1. **Vue 实现形态**：建议 Vue 3.5+ `defineComponent` + `h()`（与 React driver 同构、
   无需 SFC 编译链），而不是 `.vue` 单文件模板。**仅约束画布物料**；编辑器 UI
   （`designer-vue`）用 SFC —— 模板量大、构建期编译、与运行时无关（§12.13.8）。
2. **物料 CSS 归属**：建议抽成独立 `@lowcode-next/materials-css`，两个 adapter 都
   只 import 同一份（class 名是 DOM 契约，不能两套各写一份）。
3. **包命名**：建议保留 `@lowcode-next/renderer` 作为 React 实现的兼容别名，新增
   `renderer-core` / `renderer-vue`；激进方案是彻底改名，代价是全仓 import 变更。
4. **二选一的粒度**：建议构建时 `VITE_RENDERER_KIND` 常量（可 tree-shake）；dev
   可加 URL 覆盖，但产物里不允许运行时切换。
5. **编辑器宿主是否允许嵌进 Vue 业务系统**：建议允许（独立 React 应用，iframe /
   微前端，只交换 `PageSchema`），但本节不把它纳入「二选一」语义。
6. **自定义 setter 的扩展点形态 —— 已定稿**（用户决策：参考 lowcode 注册表逻辑，
   支持自定义 setter 在编辑中加载）：`registerSetter` / `loadSetters` 运行时注册 +
   带版本号的 observable 注册表，属性面板订阅刷新；注册项三种形态 `{ component }` /
   `{ load }` / `{ dynamic }`，**不内建 `mount`**（非 React 实现用薄包装组件）。
   `SetterContext`（`value` / `field` / `meta` / `scope` / `batch` / `disabled`）与每个
   kind 的 `normalize·validate·serialize` 写进 `protocol` 作为公开契约；key 推荐语义
   kind，lowcode 旧组件名走别名表。**不采纳** `SetterHost`。包拆分
   （`ui-react → setter-react → designer`）仍按触发条件，本期不拆。
   契约落在 `packages/designer-core/src/setter-registry.ts`，**M4 已接到属性面板**
   （§12.12.6 末；注册表为空时行为与接线前完全一致）。
7. **L3 是否支持 Vue —— 已定稿**（用户决策：**L3 也要支持 Vue**）：L3 拆四件
   —— `designer-core`（零框架：session / 命令网关 / 拖拽装配 / iframe 桥 / 样式解析 /
   属性行解析 / 大纲算法 / setter 注册表）+ `designer-ui`（共享 CSS Module 与 token，
   不放组件）+ `designer-react` + `designer-vue`；setter 契约加
   **flavor** 维度（`SetterRegistry({ flavor })` + `match()` 三态）。顺序不可颠倒：
   先 M-L3-1 抽 core，再写第二套 UI。全文见 §12.13，落地判据见 §12.13.7。

### 12.12 最终架构（定稿）

> 本节是 §12 的收敛版：把前 11 小节的决策压成**一张分层图 + 一份包清单 + 四条不锁
> 架构的保证 + 一张扩展点表**。与前面表述冲突时，以本节为准；细节仍回看对应小节。

#### 12.12.1 一句话

**内核只认数据与 DOM，框架知识只落在适配器包，setter 是设计时可插拔资产。**

三条推论，也是「不锁系统架构」的实际含义：
1. 换渲染框架 = 加一个 adapter 包，协议 / 模型 / 拖拽 / 设计器零改动；
2. 换 setter 实现 = 注册表换一项，schema 零迁移；
3. 换编辑器 UI 框架（如 Vue 版）= 加 `designer-vue`，**只重写视图层**，复用
   `designer-core` 与全部契约（定稿见 §12.13）。

#### 12.12.2 分层

```text
┌─ L4 装配 ────────────────────────────────────────────────────────┐
│ apps/playground-react / -vue：各绑一个 designer-*，画布仍 React     │
│ · 共用 apps/shared（画布 / 预览 / schema / 样式 / Vite 基座）       │
│ · 注入 setter 注册表（按 flavor）                                   │
└───────────────┬──────────────────────────────┬───────────────────┘
                │                              │
   ┌────────────▼─────────────┐   ┌────────────▼─────────────────┐
   │ L3 设计时（视图层二选一）  │   │ L2 适配（框架唯一落点）        │
   │ designer-react │ designer-vue                            │
   │ 属性面板 / 大纲 / 浮条 /  │   │ renderer-react │ renderer-vue │
   │ Monaco / setter / shadcn  │   │ createDriver · bindings      │
   └────────────┬─────────────┘   └────────────┬─────────────────┘
                │  session + setter 契约（纯数据）│
   ┌────────────▼──────────────────────────────▼─────────────────┐
   │ L3-core designer-core（零框架）：DesignerSession / 命中 /     │
   │ 拖拽装配 / iframe 桥 / 样式解析 / 大纲算法 / setter 注册表     │
   ├──────────────────────────────────────────────────────────────┤
   │ L1 内核（零框架）                                             │
   │ protocol · model · drag · renderer-core                      │
   │ schema / Command / 命中 / IR / 求值 / 值 normalize·validate   │
   └──────────────────────────┬──────────────────────────────────┘
                              │
   ┌──────────────────────────▼──────────────────────────────────┐
   │ L0 宿主：同源 iframe 画布 · 业务应用 · 任意框架宿主（iframe）  │
   └─────────────────────────────────────────────────────────────┘
```

依赖**单向向下**，禁止回指：`L1` / `designer-core` 不认识 `L2/L3` 的视图层；
`designer-react` / `designer-vue` 只依赖 `designer-core` 的公开导出；`L0` 只通过
`postMessage` 与 DOM 契约通信。

#### 12.12.3 包清单

| # | 包 | 层 | 依赖 | 框架 | 状态 |
|---|---|---|---|---|---|
| 1 | `protocol` | L1 | `zod` | 无 | 现有 |
| 2 | `model` | L1 | `protocol` | 无 | 现有 |
| 3 | `drag` | L1 | 零 | 无 | 现有 |
| 4 | `renderer-core` | L1 | `protocol` | 无 | **M1 拆出** |
| 5 | `renderer-react` | L2 | `core`，`react` 为 peer | React | **M3 收敛** |
| 6 | `renderer-vue` | L2 | `core`，`vue` 为 peer | Vue 3 | **M5** |
| 7 | `designer-core` | L3-core | `protocol` / `model` / `drag` | 无 | **已拆出（M-L3-1）** |
| 8 | `designer-ui` | L3 | 无（只放 CSS + 图标数据；**无构建、无 TS 工程**） | 无 | **已拆出（M-L3-2）** |
| 9 | `designer-react` | L3 | `designer-core` / `designer-ui`，`react` 为 peer | React | 现有（M-L3-1 已改名） |
| 10 | `designer-vue` | L3 | `designer-core` / `designer-ui`，`vue` 为 peer | Vue 3 | **M-L3-3 已交付只读骨架**；属性面板 / 数据源见 M-L3-4~5 |
| 11 | `apps/playground-react` / `playground-vue` | L4 | 各绑一个 `designer-*` + **一个** adapter，共用 `apps/shared` | 每个 app 固定一种组合 | 现有（2026-11-06 拆成两个 app） |
| 12 | `setter-contract` | L1 | `protocol` | 无 | 可并入 protocol |
| 13 | `setter-react` / `ui-react` | L2/L3 | 见 §12.3 | React | 条件拆分 |

第 12、13 项是**条件包**，不是本期交付物：`setter-contract` 先作为 `protocol` 内的
类型与纯函数存在；`setter-react` / `ui-react` 只在「第三方要复用控件壳」时拆
（成本实测见 §12.3）。注意 `designer-core` / `designer-ui` **不是**条件包：
它们是「L3 支持 Vue」的前置条件，不拆就只能复制逻辑（§12.13.1）。

#### 12.12.4 四条硬保证（可验收，不是口号）

| # | 保证 | 判据 |
|---|---|---|
| G1 | 内核与设计时核心无框架 | `packages/{protocol,model,drag,renderer-core,designer-core}/src` 里没有 `from 'react'` / `from 'vue'` / `@radix-ui` / `lucide` 的 **import**（注释里提到框架名不算） |
| G2 | 框架差异收敛到一个适配包 | 两套 adapter 除 `create*Driver` 适配文件外逐一同构；core 与绑定包锁步版本 |
| G3 | DOM 是唯一跨框架协议 | 命中/高亮/拖拽只依赖 `data-node-id` / `data-edit-flags` / `[data-lc-canvas]` + `getBoundingClientRect`，不认组件树 |
| G4 | 新增框架零渗透 | 新增 adapter 只需实现 `RendererAdapter`（`createDriver` + `bindings` + `mount`）+ 一套物料；协议 / 模型 / 设计器 / setter 均不改 |

再加两条设计时约束：

| # | 保证 | 判据 |
|---|---|---|
| G5 | setter 只认语义 kind | schema 里只有 kind 名，没有组件引用；换实现不改 schema、不需迁移 |
| G6 | 设计时逻辑只有一份 | `designer-core` 之外不允许出现 `Command` 构造 / 历史栈操作 / 命中计算 / 样式字符串解析；两版 UI 只做「订阅快照 + 渲染」（§12.13.4） |

#### 12.12.5 四类扩展点

| 扩展点 | 契约 | 注册 / 装配方式 | 新增时改动 | 运行时可 |
|---|---|---|---|---|
| 物料的 React 实现 | `ComponentMeta` + `reactBindings` | adapter 装配期 `createBindingRegistry` | 加 adapter 包 | 否 |
| 物料的 Vue 实现 | 同上 + `vueBindings` | 同上，`kind=vue` | 加 adapter 包 | 否 |
| **自定义 setter** | `SetterKind` + `SetterContext` + `SetterRegistration`（带 flavor） | `registerSetter` / `loadSetters` | **零改动** | **是** |
| 数据源 | `DataSourceConfig` | 宿主传 `document.setDataSource` | 零改动 | 是 |
| 渲染框架 | `RendererAdapter` | 构建时 `VITE_RENDERER_KIND` | 加 adapter 包 | 否 |
| 编辑器 UI 框架 | `DesignerSession` + DOM/CSS 契约 | 看 app 依赖哪个 `designer-*`（`package.json`） | 加 `designer-*` 包 + 一个 app（§12.13） | 否 |

「运行时可」这一列是这套架构与 lowcode 原版的关键差异：lowcode 的 `registerSetter`
是启动期一次性写入，注册后属性面板不会响应；本地把注册表做成**带版本号的
observable**，`PropertyPanel` 用 `useSyncExternalStore` 订阅，所以「编辑中加载」成立。

#### 12.12.6 自定义 setter 的解析与加载链路

**解析**（每次渲染属性行）：

```text
meta.setter
  → setterKindOf()            // 归一：'TextAreaSetter' → 'textarea'，对象形态取 componentName
  → registry.match(kind)      // 注册表构造时绑定 flavor（'react' / 'vue'）
      ├─ { status:'hit', { component } } → 直接渲染（默认路径，零额外开销）
      ├─ { status:'hit', { load } }      → 首次用到才 import()，pending 渲染占位
      ├─ { status:'hit', { dynamic } }   → 按 ctx 求值，结果再走上面两支（只递归一层）
      └─ { status:'missing' | 'flavor-mismatch' } → 可见诊断 + 按 type 回落内置控件
                                                    （**不静默**）
```

优先级：**注册表命中 > 显式 `setter` > `options` > `type`**。

其中的 `setter` 一层已修（原实现排在最后、且只比较字符串字面量 `'TextAreaSetter'`，
导致「带 `options` 的属性写 `setter` 不生效」与「`{ componentName }` 对象形态不认」
两个坑）。现在由 `designer-core` 的 `resolvePropControl` 统一决定：先用 `setterKindOf`
把声明归一成语义 kind（认对象形态与旧组件名别名），命中内置 kind 就直接用，否则才走
`options` / `type` 推导。**一个函数、两套编辑器共用** —— 这正是把规则搬进 core 的收益。
非内置 kind（如 `color`）此处退回类型推导，由属性面板在**查注册表命中后**覆盖
（M4 已接线，见本节末）。

**加载**（编辑过程中）：

```text
registerSetter / loadSetters
  → registry.emit()（version++）
  → PropertyPanel 的 useSyncExternalStore 快照变化
  → 重新渲染属性行，新控件出现
  → schema 不变、历史栈不变
```

API 形态对齐 lowcode，另加 flavor 与异步入口：

```ts
// React 编辑器：注册表绑 flavor，注册代码不用重复写框架名
const setters = new SetterRegistry({ flavor: 'react' });
registerSetter('color', ColorSetter, { registry: setters });
registerSetter({ icon: { load: () => import('./IconSetter') } }, undefined, { registry: setters });

// 编辑中批量（第三方包按框架分入口）
await loadSetters(async () => (await import('@acme/lc-setters')).react, { registry: setters });
```

**M4 落地状态（已完成）**：

| 项 | 结果 |
|---|---|
| 行模型 | `PropertyRowModel` 新增 `setterKind`（`meta.setter` 归一后的**原始意图**，与推导出的 `control.kind` 分开：`color` 不会被悄悄当成 `text`）；新增 `isBuiltinSetterKind()` |
| 查表键 | **`kind = row.setterKind ?? control.kind`**。显式声明优先，所以「注册 `text` 全局替换所有文本控件」也成立；作者写了 `color` 就按 `color` 查，查不到才好报错 |
| 订阅 | `PropertyPanel` 用 `useSyncExternalStore(setters.subscribe, setters.getVersion)`；`setters` prop 缺省 `defaultSetterRegistry`，宿主 `registerSetter(...)` 无需传参即可生效 |
| 渲染 | 新增 `designer-react/src/SetterSlot.tsx`：`{ component }` 直接渲染 / `{ load }` 首次用到才 `import()`（`WeakMap` 按注册项对象缓存，热替换即失效）/ `{ dynamic }` 每次按 ctx 求值（只下钻一层）。失败渲染原因，**不静默空白** |
| flavor | `DESIGNER_FLAVOR = 'react'`；`match(kind, flavor)` 三态，`flavor-mismatch` 渲染诊断并临时回落，不会把 Vue 组件塞进 React 树 |
| 诊断 | 两条：① flavor 不匹配；② `setterKind` 非内置且未注册（`meta.setter` 写了但没人实现）。都独占一行、红底，见 `PropertyPanel.module.css` 的 `.setterIssue` |
| 零回归 | 注册表为空时 `match` 返回 `missing` → 走原内置映射；`FeatureCard.desc` / `CodeBlock.code` 的 `TextAreaSetter` 归一为 `textarea`（内置），行为与接线前一致 |
| 演示 | playground `?setter=demo`：`main.tsx` 里**动态 `import()`** 一个覆盖 `textarea` 的实现并注册，验证「编辑器已跑起来之后注册 → 面板立刻刷新」。不加参数则不注册任何东西 |

`scope.page` 用 getter 而不是直接求值：属性面板一次几十行，而 `toSchema()` 是整页深拷贝；
只有 setter 真读 `scope.page`（联动 / 数据源类）时才付这个代价。

Vue 编辑器把 `flavor: 'vue'` 换成自己的值、注册 `/vue` 入口即可，**契约一字不改**。
框架无关实现（Web Component、只吐 DOM 的渲染函数）不传 flavor，落到 `'*'`，
两套 UI 都能取到。

与 lowcode 注册表的四点差异（都是修正，不是偏离）：

| lowcode | 本地 | 原因 |
|---|---|---|
| 启动期注册，面板不响应 | 版本号 + 订阅，运行时可注册 | 「编辑中加载」是本期明确需求 |
| `isDynamic` 布尔标记区分组件/动态 setter | 用**字段名** `component` / `load` / `dynamic` 区分 | 两者运行时都是函数，标记在自定义组件上会误判 |
| `getSetter` 查不到返回 null，面板静默空掉 | 未注册渲染可见诊断并回落 | 静默失败最难查 |
| key 是任意组件名 | key 推荐语义 kind，旧组件名走别名表 | schema 自描述、可移植 |
| 表只有一份，实现钉死在引擎自己的 UI 框架 | 实现带 **flavor 标签**，注册表按 flavor 解析 | L3 双框架（§12.13），且能显式报出「拿 React setter 给 Vue 用」 |

React 版 `setters.tsx` 的 5 个内置控件**不需要改**：`SetterContext extends
SetterProps`，现有控件直接接收新上下文（多出来的字段不读）。Vue 版按同一份
`SetterProps` 另写 5 个等价控件（§12.13.5）——**契约一份，实现按 flavor 一份**。

#### 12.12.7 二选一的边界（不要和「不锁架构」混为一谈）

| 层 | 是否随 `kind` 切换 | 变量 | 说明 |
|---|---|---|---|
| 画布 / 预览渲染 | **是**，构建时二选一 | `VITE_RENDERER_KIND` | 产物里只有一套框架 runtime |
| 设计器 UI（含 setter） | **是，但独立**，由 app 决定 | `package.json`（没有变量） | 与画布框架正交，四种组合都合法（§12.13.6） |
| 协议 / 模型 / 拖拽 / 求值 / 设计时逻辑 | 否 | — | 本来就没有框架 |

两个变量**互不牵连**：`react` 编辑器 + `vue` 画布（Vue 团队自建物料、复用 React
编辑器）和 `vue` 编辑器 + `react` 画布都成立 —— 它们之间只交换 `PageSchema` 与
DOM 契约，没有 import 关系。

「Vue 宿主 → React/Vue 设计器（iframe）→ 任一框架画布」三层 runtime 共存是
**合法**的：C2 约束的是「一个画布一个框架」，不是「一个页面只能有一个框架」。
设计器被嵌进业务系统时走 iframe，只交换 `PageSchema`（§12.7.1）。

#### 12.12.8 落地顺序与每步的零回归判据

| 步 | 内容 | 判据 |
|---|---|---|
| M1 | 抽 `renderer-core`，`react` 改 peer | 画布渲染结果逐 DOM 一致 |
| M2 | `designer` 只依赖 `MaterialMetaSource` | 属性面板/大纲/拖拽行为不变 |
| M3 | React 收敛为 `renderer-react` | 同上，产物仍单框架 |
| M4 | 协议净化 + setter 注册表 + 编辑中加载 | **注册表部分已接线**（§12.12.6 末）；未注册任何 setter 时行为**完全不变**（`match` 返回 `missing` 即走原内置映射）。协议净化未动 |
| M5 | `renderer-vue` + `vueBindings` | 同一 schema，`data-node-id` 序列与层级一致 |

setter 这一步（M4）的判据可以更强：**注册表为空时 `PropRow` 走的就是原来那条
分派链**（`match` → `missing` → 内置映射），所以视觉与输入法行为零回归；只有显式
注册后才切到注册的实现。接线时把原来的 if/else 抽成了 `builtinSetter()` 一个函数，
分支顺序与原来逐字一致。

**L3 双框架是另一条正交轨道**（`M-L3-1`~`M-L3-5`，见 §12.13.7）：它只动设计时，
不碰画布与协议。两条轨道可以并行，唯一交汇点是 `designer-core` 对外导出的
session 与 setter 契约 —— 所以 `M-L3-1` 必须在 `M4` 接线之前落地，否则 setter
接线要写两遍。

#### 12.12.9 什么时候才该动这套架构

反向约束，防止过度设计：

| 触发 | 动作 |
|---|---|
| 出现第二个**渲染**框架 | 加 adapter，G4 自然满足（Vue 已验证路线） |
| 非浏览器运行时要渲染（SSR / 小程序 / 原生） | adapter 增加 `mount` 环境分支，core 不动 |
| 第三方要**分发** setter 包并复用控件壳 | 拆 `ui-react` → `setter-react`（顺序不可颠倒，否则成环） |
| 需要多编辑器实例隔离 | `new SetterRegistry()` 注入，已支持（对应引擎 `viewName` 分库） |
| 需要 Vue 版编辑器 UI | **已定稿**：拆 `designer-core` + `designer-ui` + `designer-vue`，见 §12.13 |

除以上五种，保持现状。

### 12.13 L3 双框架（designer-core + designer-react / designer-vue）

> 用户决策：**L3 也要支持 Vue**。本条推翻 §12.4.1 原先的「设计时 UI 固定 React」，
> 但**不推翻**它的核心论点 —— setter 的**契约**必须无框架（纯数据进、`Command` 出），
> **实现**按编辑器 flavor 各一份。与 §12.12 冲突处以本节为准。

#### 12.13.1 先说清代价：为什么不能「直接写个 Vue 版」

现状核查（`packages/designer-react/src`，抽包前）：

| 指标 | 数值 | 含义 |
|---|---|---|
| `.tsx` 文件 / 行数 | 22 个 / **7 377 行** | 视图层体量 ≈ 内核的 2 倍 |
| `.module.css` | 14 个 | 版式全在 CSS Module 里，不在组件属性里 |
| hook 调用 | **187 处** | 状态几乎全部挂在组件内 |
| 单文件最重 | `Designer.tsx` 878 行 / **48 处 hook**；`StyleSetter.tsx` 975；`TreePanel.tsx` 971；`StyleSetterExtras.tsx` 928 | 逻辑与视图交织 |
| 已分离的纯逻辑 | 7 文件 / **1 025 行**（`dom` 144、`drop-context` 212、`float-bar` 180、`hierarchy` 98、`tree-layout` 100、`clone` 41、`setter-registry` 250） | 可直接搬进 core |

但真正的问题不是「行数要写两遍」，而是**下面这些规则现在埋在视图文件里**：

| 规则 | 现在住在哪 | 复制一份的后果 |
|---|---|---|
| 样式字符串 ↔ 样式对象（`removeUnit` / `toKebab` / `toCamel` / `styleToCssCode` / `parseToData`） | `StyleSetter.tsx` 5 个私有函数 | 一个编辑器能存进 `0px`、另一个存进 `0`，同一 schema 渲染不同 |
| 多值简写拆合（`splitUnit` / `multiPart` / `pairValue` / `addUnit`） | `StyleSetterExtras.tsx` 9 个私有函数 | 四向边距在两版里合并顺序不一致，历史记录键不同 |
| 大纲折叠默认值 / 节点标签（`nodeLabel` / `nodeText` / `collapsedByDefault`） | `TreePanel.tsx` | 打开同一页面，两版默认展开的层级不同 |
| 属性行过滤与排序（去 `style`、按 `PropMeta` 分组） | `PropertyPanel.tsx` 的 `PropsTab`/`PropRow` | 同一物料两版显示的属性集合不同 |
| 提交网关（`commit` → `History.execute` → `onSchemaChange`） | `Designer.tsx` 的 `useCallback` | 一版能撤销、一版漏了历史 |

结论：**不做 `designer-core` 直接写 Vue 版 = 把上表复制第二份**。之后任何一侧修 bug
都会让两版行为分叉，而且分叉无法用「DOM 一致」判据兜住（DOM 一样、行为不同）。
所以顺序不可颠倒：**先抽 core，再写第二套 UI**。

#### 12.13.2 三层拆分

```text
designer-core   (零框架)  DesignerSession · 命令网关 · 拖拽装配 · iframe 桥
                          命中/滚动 · 大纲算法 · 样式解析 · 属性行解析 · setter 注册表
      ▲                    ▲
      │ 公开导出            │ 公开导出（同一份 CSS Module 文件 / 同一份 token）
designer-react          designer-vue
(shadcn/Radix/lucide)   (shadcn-vue/Reka/@lucide/vue)
      │                    │
      └──── 各自只做「订阅快照 + 渲染」，不含任何写操作 ────┘
```

`designer-core` 的组成（新写的只有 `session` 与三个纯函数模块，其余是搬家）：

| 模块 | 内容 | 来源 |
|---|---|---|
| `session.ts` | `DesignerSession`：device / canvasWidth / draft / historyState / dragging / 左栏页签 / 钉住 / 数据源编辑 / revision；`commit` / `undo` / `redo` / `save` / `select` / `selectQuietly` / `hover` / `removeSelected` / `locate` / `attachFrame` / `dispose`。拖拽装配、iframe 桥、reveal 作为私有方法收在同一个类里（**不再拆 `drag.ts` / `bridge.ts` / `reveal.ts`**：它们共享 10 个私有字段，拆文件只会来回传 `this`） | 从 `Designer.tsx` 抽出 |
| `materials.ts` | `MaterialLookup`（只要 `has` / `getMeta`）+ `defaultInsertTemplate` | 新增（解掉对 `MaterialRegistry` 具体类的依赖） |
| `style.ts` | `removeUnit` / `toKebab` / `toCamel` / `styleToCssCode` / `parseToStyleData` / `splitUnit` / `multiPart` / `pairValue` / `addUnit` | 从 `StyleSetter(+Extras)` 抽出 |
| `props.ts` | 属性行过滤排序 + **setter 解析优先级**（注册表 > `options` > `type`） | 从 `PropertyPanel` 抽出 |
| `tree.ts` | `nodeLabel` / `nodeText` / `collapsedByDefault` | 从 `TreePanel` 抽出 |
| `dom` / `drop-context` / `float-bar` / `hierarchy` / `tree-layout` / `clone` / `setter-registry` | 原样搬 | 已有 1 025 行 |
| `monaco` | worker 装配仍留在 `designer-react/src/monaco-setup.ts`：`@monaco-editor/react` 是 React 绑定，Vue 侧要自己包挂载，**不进 core**（§12.13.8） | 暂不搬 |

`designer-ui` 只放**两版都要一字不差的东西**，不放组件，也**不建 TS 工程、不产出
dist**（纯资源包，`exports` 直接指向 `src`）：

1. 14 个 `*.module.css`（两包 import **同一个文件** → CSS Module 的 class 名由文件路径
   与内容生成，两版拿到同一组名字，版式不会漂）；实测 CSS 内无 `url()` / `composes` /
   跨文件 `@import`，所以搬包是纯位移，没有资源相对路径要跟着改；
2. `tokens.css`：宿主可能想改的三个令牌（`--lc-placeholder` / `--lowcode-next-bg` /
   `--lowcode-next-fg`）在这里给默认值。写法是 **`:where(:root)`（特异性 0）**，
   宿主任何位置写的 `:root { … }` 都能覆盖 —— 若写成 `:root`，本文件晚加载时会把宿主
   的覆盖反压回去，这种 bug 极难查。组件内部几何与配色（`--face-color` /
   `--rail-width` / `--line` / `--brand` …）属于各组件自己的 module，不进 tokens；
3. **图标契约**：`icon-paths.ts` 只导出 `ICON_PATHS`（iconfont symbol → path 数据）与
   `IconName` 语义名。React 侧 `EngineIcon` 与 Vue 侧各自的渲染函数都读这份数据 ——
   共享的是**图形数据**，不是组件实例；
4. **DOM 契约**（`data-node-id` / `data-selected` / `data-hovered` / `data-lc-canvas` /
   `data-lc-overlay` 的语义）目前**只有本规范第 G3 条**，暂未落成代码常量。
   M-L3-3 已经真的用到这些属性（Vue 版的大纲行、选中框、浮条都按同一套选择器写），
   但**仍然不抽 `dom-contract.ts`**：两版各写一次字面量、没有第三处消费者，
   抽出来只会得到一个「谁都不敢改」的常量表。等出现第三个读者（比如 Vue 版属性面板、
   或外部插件），再连同 G3 一起固化。

#### 12.13.3 `DesignerSession` 契约

```ts
export interface DesignerSnapshot {
  revision: number;                 // 单调递增；整树重渲染的触发依据（D14 粒度不变）
  device: 'default' | 'tablet' | 'phone';
  canvasWidth: number | null;
  canvasDraft: string | null;
  frameReady: number;
  dragging: boolean;
  history: { canUndo: boolean; canRedo: boolean };
  selectable: { selectedId: string | null; hoverId: string | null };
  ui: { leftTab: string; pinned: boolean; paneOpen: boolean };
  dataSourceEditing: { draft: DataSourceConfig; isNew: boolean } | null;
}

export class DesignerSession {
  constructor(options: {
    document: DocumentImpl;
    /** 只要 has / getMeta，不绑定 MaterialRegistry 具体类（M2 收口） */
    materials: MaterialLookup;
    canvasPadding?: number;
    onSchemaChange?: (schema: PageSchema) => void;
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null;  // 钉住偏好，测试可注入
    canvasUrl?: string;                                     // 默认 canvas.html
  });

  /** 快照：**引用稳定**，没变化就返回同一个对象（否则 useSyncExternalStore 会死循环） */
  getSnapshot(): DesignerSnapshot;
  subscribe(listener: () => void): () => void;

  /* 生命周期：构造纯状态，副作用在 start() 之后发生 */
  start(): void;                       // 文档/历史订阅、快捷键、拖拽引擎
  update(patch: { canvasPadding?: number; onSchemaChange?: (s: PageSchema) => void }): void;

  // 唯一写通道：都进历史栈
  commit(command: Command): void;
  undo(): void;
  redo(): void;
  save(): void;

  // 选择 / 视口
  select(id: string | null, options?: { reveal?: boolean }): void;
  hover(id: string | null): void;
  removeSelected(): void;
  locate(id: string): void;

  // 左栏 / 数据源（纯 UI 状态，不进历史）
  setLeftTab(tab: string): void;
  toggleLeftTab(tab: string): void;
  setPaneOpen(open: boolean): void;
  togglePin(): void;
  closePane(): void;
  editDataSource(draft: DataSourceConfig, isNew: boolean): void;
  closeDataSourceEditor(): void;
  applyDataSource(next: DataSourceConfig): void;

  // 画布尺寸
  setDevice(key: CanvasDevice): void;
  setCanvasDraft(value: string | null): void;
  commitCanvasDraft(): void;

  // 画布挂载（DOM 生命周期，唯一允许持有 DOM 引用的地方）
  attachFrame(frame: HTMLIFrameElement): void;
  detachFrame(): void;
  getCanvas(): HTMLElement | null;
  getFrame(): HTMLIFrameElement | null;

  dispose(): void;                  // **可重入**：StrictMode 下 mount→unmount→mount 复用同一实例
}
```

四条硬约束：

1. **快照引用稳定**：`getSnapshot()` 只在 state 真正变化时换对象 —— React 的
   `useSyncExternalStore` 会因为「每次新对象」无限重渲染，Vue 侧同理会触发多余 watcher。
2. **session 不认识视图**：不 import 任何组件、不返回 JSX/VNode、不持有对 React/Vue
   实例的引用；`attachFrame` 拿到的是原生 `HTMLIFrameElement`。
3. **写操作只有一条通道**：`DesignerSession` 之外不允许 `new InsertNode(...)` 或
   `history.execute(...)`（G6 的判据）。
4. **不引入新的状态模型**：session 只是把现在散在 `Designer.tsx` 的 `useState` / `ref`
   / `effect` 搬进类里，**粒度仍是整树重渲染**（D14 不变）。所以 React 版切换前后可以
   用 DOM 快照逐字节比对。

#### 12.13.4 两种绑定：各 20 行，没有逻辑分支

React：

```tsx
const session = useMemo(() => new DesignerSession({ document: doc, materials, setters }), [doc]);
const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
const setFrame = useCallback((el: HTMLIFrameElement | null) => el ? session.attachFrame(el) : undefined, [session]);
useEffect(() => () => session.dispose(), [session]);
```

Vue：

```ts
const session = new DesignerSession({ document: doc, materials, setters });
const snap = shallowRef(session.getSnapshot());
const off = session.subscribe(() => { snap.value = session.getSnapshot(); });
const frameEl = ref<HTMLIFrameElement | null>(null);
onMounted(() => { if (frameEl.value) session.attachFrame(frameEl.value); session.start(); });
onBeforeUnmount(() => { off(); session.dispose(); });   // 组件作用域内 onScopeDispose 等价
```

两段代码的形状完全一致，因为逻辑都在 session 里。**这是「L3 支持 Vue」唯一需要
保证的事**：视图层无行为。（`onBeforeUnmount` 与 `onScopeDispose` 在组件内等价；
用前者是因为 `mountDesigner()` 之外没有更外层 effectScope。）

#### 12.13.5 setter 的 flavor 维度（契约变更，已落地）

setter 是**实现**，schema 只有 kind（G5 不变）。因此「同一 kind 在两套 UI 里各有一份
实现」不是例外，而是常态：

```ts
export type SetterFlavor = string;          // 'react' / 'vue' / 自定义
export type SetterImpl = unknown;          // 核心不解释，UI 层各自收窄

const reactSetters = new SetterRegistry({ flavor: 'react' });
const vueSetters   = new SetterRegistry({ flavor: 'vue' });

reactSetters.register('color', ColorSetter);            // 打上 'react'
vueSetters.register('color',   ColorSetterVue);         // 打上 'vue'
reactSetters.register('divider', WebComponentSetter);   // 不传 flavor → '*'，两版通用

reactSetters.match('color');  // { status: 'hit' }
vueSetters.match('color');    // { status: 'hit' }（自己那份）
reactSetters.match('color');  // 若只有 vue 实现 → { status: 'flavor-mismatch' }
```

`match()` 三态（`hit` / `missing` / `flavor-mismatch`）的意义：**「React setter 拿给
Vue 面板用」必须报出来**。直接渲染会炸在别的框架的组件内部实现上，比空着更难查；
静默回落到 `TextSetter` 则是 §12.4.2 已经否掉的失败模式。

- 内置 6 个 kind（`text` / `textarea` / `number` / `bool` / `select` / `json`）**每版
  一份实现**：`setters.tsx`（React，一行不改）+ `setters-vue.ts`（Vue，按同一份
  `SetterProps` 写）。契约一份、实现一份，不是「一套 setter 跨框架运行」——
  后者就是已被否掉的 `SetterHost` 路线。
  内置实现**不进注册表**，由 `PropRow` 直接映射（`builtinSetter()`）：这样注册表为空
  时行为与接线前完全一致。反过来说，**注册同名 kind 就能整体替换内置控件**
  （playground 的 `?setter=demo` 就是覆盖 `textarea`），不需要改物料和 schema。
- 第三方分发包按框架分入口，对齐 Lexical 的 `@lexical/react`：
  `@acme/lc-setters/react` 与 `/vue`，各自把对方框架只写进 `peerDependencies`。
  反面教材是 `lexical-vue` 在 `dependencies` 里硬钉 `lexical@0.50.0`，与 `lexical@0.53`
  同时存在 → 装两份 core。**教训：core 只能由 peer + 锁步版本进入。**
- 一个编辑器实例只启用一种 flavor（`new SetterRegistry({ flavor })` 注入），不允许
  同一属性面板里混挂两套实现族。
- 已落地：`packages/designer-core/src/setter-registry.ts` 已去掉 `import type { ComponentType }
  from 'react'`，改为 flavor 标签 + `match()` 三态 + `kinds()` / `mismatches()` 诊断；
  **M4 已接线**（`PropertyPanel` 订阅版本号 + `SetterSlot` 三态渲染）；注册表为空时
  行为与接线前完全一致。

#### 12.13.6 四种组合都合法（不是二选一，是两次二选一）

| 编辑器 UI ↓ \ 画布 → | `renderer-react` | `renderer-vue` |
|---|---|---|
| `designer-react` | 全 React 单页（今天） | Vue 团队自建物料、复用 React 编辑器 |
| `designer-vue` | React 物料、Vue 团队自建编辑器 | 全 Vue |

变量只剩 `VITE_RENDERER_KIND`（画布/渲染层，仍是构建期常量）。**编辑器 flavor 没有
变量** —— 它由「是哪个 app」决定，见下。两者之间只交换 `PageSchema` 与 DOM 契约，
**没有 import 关系**（G1 保证 core 谁都不认）。

**flavor 的载体是包，不是构建参数**（2026-11-06 二次修正，这条改过两版）：

| 版本 | 做法 | 问题 |
|---|---|---|
| v1 | `?designer=vue` URL 运行时开关 | 一份产物同时含两套编辑器 + 两套 UI 框架，「部署的是哪个 flavor」不可静态判定 |
| v2 | `define` 注入 `__DESIGNER_KIND__` 编译期常量 | 产物确实互斥了，但这是**在一个包里模拟包的边界**：`main.tsx` 里那行 `if` 的唯一职责就是「选装哪个包」，本该由 `package.json` 表达 |
| **v3（现在）** | `apps/playground-react` 依赖 `designer-react`；`apps/playground-vue` 依赖 `designer-vue` | — |

v3 让互斥性从「Rollup 折叠保证」升级为「**依赖图里根本没有**」：Vue app 的
`node_modules` 里没有 `designer-react`，所以不存在需要 DCE 掉的分支，`main.tsx`
里也没有任何判断（两个 app 的入口都是 `import '@pg/styles.css'` + `boot()`）。
判据从「grep 产物」变成「`pnpm ls` 一眼可见」。

这就是 Ark UI 的形态（§12.4.2 范式评估 2）：一个 core + 每框架一个绑定包，
**消费方装哪个就是哪个**，框架本体放 `peerDependencies`；`@ark-ui/react` 与
`@ark-ui/vue` 同版本同 gitHead 各自发布，没有 `__ARK_KIND__` 这种东西。

两个 app 共用 `apps/shared`（画布、预览、示例 schema、样式入口、Vite 基座）——
这些与编辑器框架无关，是同一份素材，写两遍没有意义。但**画布与预览仍是 React**，
所以 Vue app 也依赖 `react` / `react-dom`：那不是矛盾，正是矩阵里
「Vue 编辑器 + React 画布」那一格。

**产物互斥的判据要扣掉渲染层**：Vue app 的产物里**仍然有 React** —— 那是
`canvas.html`（画布 iframe）与 `preview.html`（运行态预览）的 chunk（实测落在
`canvas-*.js` / `preview-*.js` / `client-*.js`），它们走 `renderer-react`，正是矩阵里
「Vue 编辑器 + React 画布」那一格，不属于编辑器视图。所以判据是「**编辑器 chunk**
不含另一套视图层」，而不是「整包 grep 不到 react」。

**三份 HTML 入口，各自决定加载什么**（`index.html` / `canvas.html` / `preview.html`，
两个 app 各一套）：入口 chunk 里因此**没有任何运行时分支**，连编译期判断也没有。
预览早期做成 `?preview=1` 运行时开关 —— 靠动态 `import()` 也能拆出独立 chunk，但入口里
始终留着一个 `isPreview` 判断，URL 语义也模糊（同一个 HTML 两种身份）；改成独立入口后
连这个判断都不需要了。

`/preview` 这个干净路径由 `apps/shared/vite.base.ts` 的 `previewRoute()` 中间件映射到
`preview.html`（dev 与 `vite preview` 都生效）。**真实部署（nginx / 静态托管）需要在
托管侧加同一条 rewrite**；不加也能用 `/preview.html`，只是地址带后缀。

不合法的是另外两件事：① 同一编辑器实例内混用两套 setter 实现族；② 同一画布内混用
两个渲染框架（C2 不变）。

#### 12.13.7 落地顺序与判据

| 步 | 内容 | 判据（缺一不可） |
|---|---|---|
| M-L3-1 | 抽 `designer-core`：搬 7 个纯模块 + 新建 `session` + 从视图抽 `style`/`props`/`tree`；`designer` 改名 `designer-react`，成为薄壳 | ① `designer-core/src` grep 不到 `react`/`vue`/`@radix-ui`/`lucide`；② React 版 DOM 快照与抽包前逐一致；③ `npx tsc -b` + `npx vitest run` 全绿；④ playground 无感 |
| M-L3-2 | 抽 `designer-ui`（14 个 module.css + `tokens.css` + 图标数据） | ① 两版 import 同一份 CSS 文件（不是复制）；② 逐像素截图比对零差异（当前未做，见下方落地状态）；③ 生产产物里 CSS 总量与抽包前一致 |
| M-L3-3 | `designer-vue` 只读骨架：Shell + 大纲 + 物料 + 选中框 + 浮条 | 同一 schema：选中/悬停/滚动/框位置与 React 版一致；无可写入口 |
| M-L3-3b | playground 拆成 `playground-react` / `playground-vue` 两个 app（+ 共用 `apps/shared`），删掉 `__DESIGNER_KIND__` 与 `--mode` 机制 | 互斥由**依赖图**保证：各自的编辑器 chunk 里没有另一套视图层（不是靠 DCE） |
| M-L3-4 | Vue 属性面板 + 5 个内置 setter + 样式面板 | **同一节点、同一操作序列 → `doc.toSchema()` 输出与 React 版字节一致** |
| M-L3-5 | Vue 数据源面板 + 拖拽收口（自动滚动、placeholder、跨容器） | 拖入/移动后 schema 与 React 版一致；撤销栈深度相同 |

**M-L3-1 落地状态（已完成，2026-11-06）**：

| 项 | 结果 |
|---|---|
| `packages/designer-core` | 新建；依赖只有 `protocol` / `model` / `drag`；`grep -E "react|vue|@radix-ui|lucide"` 为空 |
| 搬迁 | `dom` / `drop-context` / `float-bar` / `hierarchy` / `tree-layout` / `clone` / `setter-registry` + 4 个既有测试（130 个用例全绿） |
| 新抽 | `session.ts`（`DesignerSession`）、`style.ts`（15 个纯函数，从 `StyleSetter(+Extras)` 抽出）、`props.ts`（`buildPropertyModel` / `resolvePropControl`，从 `PropertyPanel` 抽出）、`tree.ts`（`nodeLabel` / `nodeText` / `collapsedByDefault`，从 `TreePanel` 抽出）、`materials.ts`（`MaterialLookup`，解掉对 `MaterialRegistry` 具体类的依赖） |
| `Designer.tsx` | 878 行 → **347 行**，只剩视图：`useSyncExternalStore(session.subscribe, session.getSnapshot)` + 手势翻译；hook 从 48 处降到 8 处（2×`useRef` / 1×`useMemo` / 2×`useEffect` / 1×`useSyncExternalStore` / 2×`useCallback`） |
| 验证 | `npx tsc -b` ✓、`npx vitest run` 130/130 ✓、`pnpm build` ✓（仅既有 Monaco chunk 提示）、playground `tsc --noEmit` ✓ |
| 改名 | `packages/designer` → `packages/designer-react`，包名 `@lowcode-next/designer-react`（`git mv` + `pnpm install` 重链）；同步改根 `tsconfig` / `vitest.config` / playground 的 `tsconfig.paths` / `vite.alias` / `package.json` / `App.tsx` 共 7 处引用 |
| **未做** | ① `dom-contract.ts`（见 §12.13.2 第 4 点）；② Vue 侧 setter 实现族 |

**M-L3-2 落地状态（已完成）**：

| 项 | 结果 |
|---|---|
| `packages/designer-ui` | 新建；**无 `tsconfig`、无 `dist`**，`exports` 指向 `src`（`./tokens.css`、`./*.module.css`、`./icon-paths`） |
| 搬迁 | 14 个 `*.module.css`（3 227 行）全部搬入，`git mv` 保留历史 |
| 新增 | `tokens.css`（`:where(:root)` 三个令牌）、`icon-paths.ts`（从 `EngineIcons.tsx` 拆出的 240 行纯 path 数据 + `IconName`） |
| 引用改写 | `designer-react` 的 16 个文件、共 14 类 CSS 导入改为 `@lowcode-next/designer-ui/<Name>.module.css`；根因是**同一份文件**而不是「两套同名样式」 |
| 解析链 | playground `vite.alias` + `tsconfig.paths`、`vitest.config` 各加一条前缀映射到 `packages/designer-ui/src`；`designer-react/src/env.d.ts` 补 `declare module '*.css'`（给 `tokens.css` 的副作用导入） |
| 验证 | `npx tsc -b` ✓、`npx vitest run` 130/130 ✓、`pnpm build` ✓、dev server 下 **14/14 CSS Module 全部 HTTP 200** 且返回真实 hash 类名（如 `root_15ie7_829`）、生产产物 `main-*.css` 含 `--lowcode-next-bg` 与各 module 类名 |
| 未做 | 全页逐像素截图 diff（M-L3-3 期间做了**几何比对**，见下）；`dom-contract.ts` |

**M-L3-3 落地状态（已完成，2026-11-06）—— `designer-vue` 只读骨架**：

| 项 | 结果 |
|---|---|
| `packages/designer-vue` | 新建；SFC + `@lucide/vue` + `vue`（`exports` 指向 `src`，因为 `.vue` 无法由 `tsc -b` 产出 `dist`）；`tsconfig` 只编 `.ts`（`emitDeclarationOnly`），`*.vue` 由 `env.d.ts` 声明 |
| 组件 | `Designer` / `DesignerShell` / `ActivityRail` / `LeftPane` / `MaterialPanel` / `TreePanel` + `TreeNode`（SFC 自引用递归）/ `SelectionBorders` / `FloatToolbar`（只读）/ `PaneHeader` / `MatIcon` / `EngineIcon` / `BrandMark` |
| 绑定方式 | `shallowRef(session.getSnapshot())` + `session.subscribe()`，`onMounted` 才 `attachFrame` + `start`，`onScopeDispose` 退订 —— 与 §12.13.4 的 6 行样例一致，无逻辑分支 |
| 几何下沉 | 新增 `designer-core/src/borders.ts`：`computeSelectionBoxes()`（选中/悬停框的测量、跨 frame 换算、扣浮层、贴边收 1px）与 `measureFloatAnchor()`；**React 版改成调用它**，从"两版各算一遍"变成"同一函数" |
| 只读边界 | 不接 `onSchemaChange`、不构造 `Command`；物料不拖、行内动作（隐藏/锁定/重命名/删除）不渲染、浮条只有标题 chip 与祖先链；顶栏保留设备档 / 宽度 / 预览，去掉撤销 / 重做 / 保存 |
| **判据（实测）** | 同一 schema、同一 1600×900 视口：`frameNodes` 93 = 93；选中框 `1217×61 @ (1,1)` = `1217×61 @ (1,1)`；滚动 260px 后选中框 `1217×62 @ (1,-260)` 且悬停框 `620×56.75 @ (299.5,14.4375)` **逐像素相同**；浮条 `top` 相同（43px） |
| 浮条的唯一差异 | `left` 1149（React）vs 1209（Vue）：只读骨架没有删除/复制/锁定三个按钮，条更窄，而 `placeFloatBar` 是**右对齐到节点右缘**，位置随宽度变。这是内容差异，不是规则差异 |
| 产物判据（实测，见 §12.13.6） | `playground-react` 产物：编辑器 chunk `main-*.js` 348.71 kB，`grep -E "__v_isReactive|effectScope|createApp\\("` **零命中**。`playground-vue` 产物：编辑器 chunk `main-*.js` 157.86 kB，`grep -i react` 6 次全部是 Vue 自己的 `__v_isReactive` 子串与落地页文案（「拖拽层不认识 React」），react-dom 只出现在 `canvas-*.js` / `preview-*.js` / `client-*.js`（渲染层，与编辑器 flavor 正交） |

**M-L3-3b 落地状态（已完成，2026-11-06）—— playground 拆成两个 app**：

起因是用户对 v2 的质疑：`?designer=vue` 是运行时开关，错；改成 `__DESIGNER_KIND__`
编译期常量后产物确实互斥了，但仍然要「构建完才知道是哪个 flavor」。对照 Ark UI
（§12.4.2）才发现它根本没有这类开关：**flavor 的载体是包，消费方装哪个就是哪个**。

| 项 | 结果 |
|---|---|
| 目录 | `apps/playground-react`（依赖 `designer-react`，5173）/ `apps/playground-vue`（依赖 `designer-vue`，5174）/ `apps/shared`（共用宿主代码，不是 app） |
| `apps/shared` | `canvas.css` / `canvas-channel.ts`（iframe 画布，框架相关部分已按 §12.13.10 移入各 app）、`preview-route.ts`、`pages.ts`（页面登记表，§12.13.12）、`schemas/landing.ts`(+test)、`shell.module.css`、`styles.css`（Tailwind 唯一入口）、`vite.base.ts`（`defineApp()`）、`scripts/reset-vite-cache.mjs` |
| 各 app 只有 | `vite.config.ts`（~15 行，只声明 `port` + 插件）、`tsconfig.json`、`package.json`、入口 `main`。<br>**Vue（仍走独立入口页）**：`index.html` / `canvas.html` / `preview.html` 三份 + 画布/预览各一个薄壳。<br>**React（§12.13.13 起改 Portal）**：只有 `index.html`（`entries: { main: 'index.html' }`），画布不再需要入口文件；业务侧文件是 `materials.json` + `page.json` + 一个自定义组件 |
| 删掉 | `.env.vue`、`build:vue` / `dev:vue`、`__DESIGNER_KIND__` 与 `define`、按 mode 分的 `cacheDir`、`main.tsx` 里的 `if`（两个入口现在都只有 `import '@pg/styles.css'` + `boot()`） |
| 依赖方向 | Vue app 也装 `react` / `react-dom` —— 画布与预览走 `renderer-react`，那是渲染层（矩阵「Vue 编辑器 + React 画布」），不是编辑器视图 |
| 判据（实测） | 两个 dev server 各自 200；`iframeNodes` 都是 93、console 零 error；react app 的 chunk 全是 `.tsx`、vue app 全是 `.vue`；`playground-react` 产物 grep 不到任何 Vue runtime；vue 编辑器 chunk 里的 `react` 字样只命中 `__v_isReactive` 与落地页文案 |
| 预览链路 | Vue 版点「预览」→ sessionStorage 写入 12 732 字符 → `/preview` 渲染运行态页面、无编辑器外壳 |

两个配套坑（都写进了代码注释）：

1. **`apps/shared` 必须有自己的 `package.json`**。它不是 app，但 `canvas.tsx` /
   `preview.tsx` 直接 `import 'react'`，而模块解析从**文件位置**上溯 `node_modules`——
   没有清单就没有 `apps/shared/node_modules`，`tsc` 立刻一片 TS2307。现在它是
   workspace 包（`@lowcode-next/playground-shared`），`react` / `react-dom` 放
   `peerDependencies` + `devDependencies`，`vite` / `tailwindcss` 只作 devDep 提供解析。
2. **Vite 8 的 `configLoader: 'native'` 要求相对 import 带扩展名**：
   `import { defineApp } from '../shared/vite.base.ts'`，两个 app 的 `tsconfig` 因此开了
   `allowImportingTsExtensions`（它们都是 `noEmit`，不会产出 `.d.ts`）。

**M-L3-3 期间修掉的两个既有缺陷（都不是 Vue 引入的）**：

| 缺陷 | 症状 | 根因 | 修法 |
|---|---|---|---|
| playground 漏 alias `@lowcode-next/designer-core` | 改 `designer-core/src` **完全不生效**，画布/选中框行为停在最后一次 `tsc -b` 的 `dist` 上 | 其余包都 alias 到 `src`，唯独 core 走 `package.json` 的 `exports` → `dist/index.js`；`dist` 在 `node_modules` 之外的 workspace 包，Vite 不监听其变化 | `vite.alias` + `tsconfig.paths` 补一条；**这条属于「不做会浪费半天排查」的工程债**，注释写在配置里 |
| 画布首屏握手只有一半 | 打开编辑器画布空白，点一下节点才出现 | `canvas.tsx` 发 `lc:canvas-ready`，但 `DesignerSession` 从未监听；`bindFrame()` 的那次 `postSchema()` 可能早于画布注册 `message` | session 侧监听握手 + `bindFrame()` 里按 DOM 结果补发（最多 6 次 × 120ms，画布出现 `[data-node-id]` 即停）；canvas 侧在拿到首份 schema 前每 150ms 重发 ready（最多 20 次） |

**M-L3-3 未做**：① SFC 静态类型校验 —— `vue-tsc@3` 与仓库使用的 TypeScript 7 不兼容
（`ERR_PACKAGE_PATH_NOT_EXPORTED`），本轮靠「Vite 构建 + SSR `renderToString` 冒烟
（零 Vue 警告）+ 浏览器实测」兜住；② `TitleTooltip`（Vue 版暂时用原生 `title`）；
③ 属性面板（M-L3-4）、数据源与拖拽（M-L3-5）；④ `dom-contract.ts`（理由见 §12.13.2 第 4 点）。

M-L3-4 的判据是整套方案的关键：它把「两版行为一致」变成可执行断言 —— **命令序列驱动
session，比对序列化输出**，完全不依赖 UI。也就是说，正确性测试写在 `designer-core`
（node 环境，零浏览器），UI 层只需要一小批冒烟用例。这同时解决了「谁来维护两套 UIView
测试」的成本问题：**不测 UI，测 core**。

#### 12.13.8 成本、边界与优先级

- **成本**：Vue 版视图层 ≈ 7 400 行同量级重写，但逻辑 0 行重写（全部在 core）。
  按 M-L3-3/4/5 三段交付，第一段只读（不能编辑）就已经能验证架构成立 ——
  **M-L3-3 已交付：12 个组件 / 约 1 900 行 SFC，几何与 React 版逐像素对齐**（见 §12.13.7）。
- **Vue 侧技术选型**（对齐现有 shadcn 红线）：`shadcn-vue`（底层 `reka-ui`）+ Tailwind
  + **`@lucide/vue`**。注意不是 `lucide-vue-next` —— 后者已被官方标记 deprecated
  （`Please use @lucide/vue instead`），装 `^1.0.0` 会拿到一个只有占位内容的旧包。
  M-L3-3 尚未引入 shadcn-vue / reka（只读骨架没有交互控件），到 M-L3-4 写 setter 时再加。
  **不引入** Element Plus / Ant Design Vue / Naive UI —— 与「保持统一 shadcn UI、
  不引入额外组件」的既有约定冲突。
- **`.vue` SFC 可用**：与 §12.11 第 1 项「Vue 用 `defineComponent` + `h()`」不冲突 ——
  那一条约束的是**画布物料**（要在 iframe 里被 registry 动态构造、要无编译链、要同构），
  编辑器 UI 是设计时资产、构建期编译、模板量大，SFC 可读性明显更好。
- **Monaco**：`monaco-editor` 本身与框架无关，两版共用 `designer-core/monaco` 的 worker
  装配；Vue 侧自己包 20 行挂载，不引第三个「Vue Monaco 包装库」（它就是当年
  `lexical-vue` 那种版本钉死的来源）。
- **优先级（重要）**：如果真实需求只是「Vue 业务系统里要能编辑页面」，**iframe 嵌现有
  React 设计器**（§12.7.1）成本是 L3 双框架的百分之一，且已经可用。只有下面两条成立
  时才值得走 M-L3-1~5：
  1. Vue 团队要**独立维护/定制**编辑器 UI（加自己的面板、自己的 setter 生态）；
  2. 产品要求编辑器产物不含任何 React runtime（合规 / 体积 / 技术栈统一）。
- **不做**：同一实例混框架渲染；`SetterHost`（自造 mount/dispose）；把两版塞进同一个包
  用运行时分支；为了跨框架把 `ui/*` 从 shadcn 换成 Ark UI。

#### 12.13.9 决策记录（新增 5 项）

| # | 决策 | 理由 |
|---|---|---|
| D-L3-1 | L3 拆 `designer-core` / `designer-ui` / `designer-react` / `designer-vue` | 逻辑只有一份，视图两套；否则必然分叉（§12.13.1） |
| D-L3-2 | `designer-core` 用**类 + 快照订阅**，不用 signals / 响应式对象 | 两套框架都能接：React 走 `useSyncExternalStore`，Vue 走 `shallowRef`；signals 会偏袒一方 |
| D-L3-3 | setter 契约加 flavor 维度，注册表按 flavor 解析，`match()` 三态 | 实现必然按框架分家，契约不能假装统一（§12.13.5） |
| D-L3-4 | 共享 CSS Module 文件 + token，而非「两套样式对齐」 | 版式靠人肉对齐必然漂移；同一文件 → 同一 hash，天然一致 |
| D-L3-5 | 正确性测在 core（命令序列 → schema 比对），不测两套 UI | 双份 UI 测试成本高且测不到逻辑；core 是唯一行为源 |
| D-L3-6 | flavor 的载体是**包**：两个 app 各自依赖一个 `designer-*`，**不做** URL 运行时切换、**也不做** `__DESIGNER_KIND__` 编译期常量 | 前两版分别错在「运行时切换」（一份产物两套编辑器）和「在一个包里模拟包边界」（`if` 的唯一职责是选装哪个包，本该由 `package.json` 表达）；包级形态与 Ark UI 同构，互斥由依赖图保证而不是 DCE（§12.13.6） |

#### 12.13.10 物料包化落地（M-L3-3c，2026-11-07）

§12.4 写的是目标态，这一轮把它做了。起点很具体：

```ts
// packages/designer-vue/src/mount.ts（拆之前）
import type { MaterialRegistry } from '@lowcode-next/renderer';
```

`renderer` 的 dependencies 里实实在在写着 `react` —— Vue 包为了一个类型依赖了 React 包，而且 `resolve()` 返回的是 React 的 `ComponentType`，Vue 侧拿到手用不了，只好只读 meta、根本不碰 `resolve`（一个半边失灵的接口）。

**拆成六层，依赖单向：**

```text
protocol
  ├─ materials          ComponentMeta + 注册表 + styles.css（零框架）
  │    ├─ materials-react    20 个组件
  │    └─ materials-vue      SFC（首批 3 个）
  └─ renderer-core      IRNode / Driver / evaluate / 占位判定（零框架）
       ├─ renderer          React Driver
       └─ renderer-vue      Vue Driver
```

`renderer` 的对外 API 保持原样（`evaluate` / `shouldPlacePlaceholder` / `IRNode` 仍从它拿），所以宿主的 import 一行没改；`renderer-core` 是新增的内核，两套 Driver 都只依赖它。

**四个设计点值得记住：**

| 点 | 做法 | 为什么 |
|---|---|---|
| 包粒度 | `registry.use(pkg)` / `unuse(id)`，重名**默认抛错** | 「装上了却没生效」是排查成本极高的静默失败；覆盖要显式 `{ override: true }` |
| 变更通知 | `version` + `subscribe`（属性面板早已这么订阅 setter） | 上一版物料表没有通知机制，`list()` 变了面板也不重算 —— 实例没换 |
| 枚举同源 | 常量数组从 `materials` 导出，两套实现 import 它做 `pick()` | 从「靠注释约定别手抄」升级成「物理上只有一份」 |
| 装配校验 | `assertMetaBindings(metas, bindingNames, flavor)` | meta 有、实现没有 → 渲染兜底块；实现有、meta 没有 → 面板永远看不到。两种都在装配期抛错并列出差集 |

**Vue 侧只做 3 个物料（Div / Heading / Button），并且面板只列这 3 个**（`subsetPackage` 按实现清单筛描述）。理由：列全 20 个、17 个一拖就废，比少几个物料难查得多。三个物料刻意覆盖了 `isContainer` / `options` / `bool` 三类 meta 字段，其余是同一模子。

Vue app 的默认页因此从落地页改成「最小示例」（只用 Div + Button）；`?page=landing` 仍可打开，那一片「未注册物料」红框就是缺口清单。

**样式表由宿主显式引入**（`import '@lowcode-next/materials/styles.css'`），不在绑定包里 import —— 绑定包会 `tsc` 编成 dist，`import '*.css'` 留在产物里会指向不存在的文件。

**渲染层也按框架分家了**：Vue app 的 `canvas.html` / `preview.html` 现在走 `renderer-vue` + `materials-vue`。iframe 隔离、消息通道、选中框、拖拽命中全部不变 —— 它们只看 `PageSchema` 与 DOM，与画布里渲染什么框架无关。消息通道抽成了 `apps/shared/src/canvas-channel.ts`，两版画布共用（「ready 重发几次」「非法 schema 怎么办」这些细节各写一遍必然分叉）。

**验证（2026-11-07 实测）：**

| 项 | 结果 |
|---|---|
| `tsc -b` + 两 app `--noEmit` | 0 错误 |
| `vitest` | 130/130（物料守卫测试随包迁到 `materials/src/metas/`） |
| 产物互斥 | vue 侧 grep `react-dom\|useState\|jsx-runtime` 零命中；react 侧 grep `__v_isReactive\|createApp(` 零命中 |
| React 编辑器 | iframe 93 个 `data-node-id`，0 console error |
| Vue 编辑器 | 3 个节点（Div + 2 Button）、面板列「容器/标题/按钮」、0 console error |
| `?page=landing`（Vue） | 93 节点 / 76 兜底 —— 缺口可见 |

**还没做：**

1. `node.meta` 仍是构造时的缓存（`model/src/node.ts:29`，`readonly`）。所以运行期 `unuse()` 一个包，**已创建的节点**仍拿旧 meta；要改成 getter 委托注册表才彻底。改之前得先数一遍 `node.meta` 被当 `useMemo` deps 用的地方。
2. Vue 物料 17 个未实现（Text / Button 之外的基础物料、全部布局容器、全部区块）。
3. `packages/` 下没有 `packages` 级概念（远程 UMD 注入 / `assets.json`）。当前「多包」只支持装配期本地包。

#### 12.13.11 决策记录（补充 2 项）

| # | 决策 | 理由 |
|---|---|---|
| D-L3-7 | 物料以**包**为单位注册与卸载（`use` / `unuse`），注册表带 `version` + `subscribe` | 「随时加入不同的包」需要包级身份（谁装的、整包摘）；散装 `register` 只能加不能卸，且改不动面板 |
| D-L3-8 | 描述与实现分包（`materials` ← `materials-react` / `materials-vue`），**渲染层也按框架分包**（`renderer-core` ← `renderer` / `renderer-vue`） | 只拆物料不拆 driver，Vue 画布仍要 React；只拆 driver 不拆物料，编辑器仍绑死一套实现。两处一起拆，跨框架依赖才真正消失 |

#### 12.13.12 playground 收敛为「一次装配」（易用性，2026-11-07）

起因是用户看完物料链路后的判断：**playground 是面向使用者的，应该开箱即用**。
当时的实际门槛是「要读懂物料包 / 描述面 / 实现面 / 装配这一整套概念，才能把编辑器
跑起来」—— 这种门槛不该出现在入口。

两个分叉点由用户拍板（`AskUserQuestion`），都选了保守项：

| 分叉 | 选择 | 含义 |
|---|---|---|
| 零配置入口放哪 | **只简化 playground** | 不动 `designer-*` 的对外 API，不引入包级 `mountDesigner('#root', { schema })` |
| 画布入口 | **先保留三个 HTML** | `canvas.html` / `preview.html` 与 iframe 装载方式都不动 |

改动（两个 app 对称）：

| 前 | 后 |
|---|---|
| `main` → `boot` → `App` → `materials`（4 跳） | `main` → `App`（2 跳） |
| `App.tsx` 里混着页面表、URL 解析、`try/catch`、渲染 | `pages.ts`（数据）/ `createDesigner()`（装配）/ `App.tsx`（渲染） |
| 四步对象图：建 registry → merge bindings → `createDocument` → `<Designer>` | 一次 `createDesigner(schema, key)` |
| 每个调用点各写一遍 `try/catch` | 返回判别联合 `{ ok: true, registry, document }` / `{ ok: false, message }` |

三个文件各有唯一职责，且**「要改什么就打开哪个文件」**：

| 文件 | 职责 | 什么时候打开 |
|---|---|---|
| `apps/shared/src/pages.ts` | 页面登记表（`DEMO_PAGES` + `pickPage`） | 换成自己的页面 |
| `apps/playground-*/src/materials.ts` | 物料装配（`registry` + `bindings`） | 加自己的物料包 |
| `apps/playground-react/src/App.tsx` | 挑页 → 装配 → 渲染 | 一般不用改 |

`pages.ts` 放在 `apps/shared`（零框架纯数据），两个 app 读同一份 —— 换页面时两版
同时生效，不会一边改了另一边忘。`pickPage(fallback)` 的回退值由调用方给：React 缺省
`landing`，Vue 缺省 `sample`（物料只实现了 3 个，打开落地页会大面积兜底）。

**为什么删掉 `boot.ts(x)` 而不是保留**：它原来做的三件事（挂载、装配、选页）现在各有
归属，合并进 `main` 后「启动过程」在一个文件里读完，不必再跳一层。Vue 侧没有 App
组件层，装配 + 挂载都在 `main.ts` —— 这是两侧唯一的结构差异，本来就有。

**没做**（都是更彻底的「开箱即用」，被明确推迟）：

1. 包级一键入口 `mountDesigner('#root', { schema })` —— 业务方现在仍要抄 3 个文件，
   只是每个都短且职责单一；
2. 免掉 `canvas.html` / `preview.html` —— 这才是「开箱即用」真正的门槛（业务方要配
   多页构建 + 预览路由），但要动 iframe 装载方式（srcdoc / Vite 插件），风险最大。

验证：`tsc -b` 与两个 app `--noEmit` 均 0 错误，vitest 130/130；两版编辑器无头渲染
正常（React 落地页 / Vue 最小示例）；`?page=landing` 在 Vue 侧实测生效（落地页贴边、
未实现的物料落红框），说明新的 `pickPage` 与原 URL 逻辑等价。

> 上面那条「没做」里的第 2 项（免掉 `canvas.html` / `preview.html`）在下一节做掉了，
> 而且用的不是当时设想的 srcdoc / Vite 插件，是 Portal。

#### 12.13.13 接入层 `lowcode-react`：一次调用，零入口文件（2026-11-07）

**上一节解决的是「playground 自己写得短」，这一节解决的是「接入方写得少」。**
两者不是一回事：上一轮改完，业务方要跑起来仍然得写约 250 行管道（装配注册表、建
document、画布入口、消息通道、错误态），而且必须先读懂「物料包 / 描述面 / 实现面 /
装配」四个概念才能动手。那不是接入体验。

##### 一、先看 lowcode-engine 怎么做的

读 `packages/designer/src/builtin-simulator/` 得到三条：

| 它的做法 | 对我们的意义 |
|---|---|
| 画布文档由 `doc.write()` 现场生成，assets 拼成 `<link>` / `<script>` 注入（`create-simulator.ts:91-102`） | 用户不需要 `canvas.html`，宿主可以自己造文档 |
| 同源 iframe 直接互持对象（`win.LCSimulatorHost = host`），`designer` 与 `react-simulator-renderer` 里 **`postMessage` 零命中** | 我们那 99 行 `canvas-channel` 是多余的一层 |
| `enableStrictNotFoundMode` 双模式 + `FaultComponent`（ErrorBoundary） | 错误兜底要分「未注册」与「渲染抛错」两种，且编辑态/运行态表现不同 |

##### 二、没有照抄它：改用 Portal

它注入 **UMD** 脚本，是因为要支持远程物料包与跨域场景。我们两样都不需要，而 ESM 下
`<script type="module">` 指向的入口 URL 只有打包后才知道，dev/prod 两套路径 —— 这是
新引入的坑。

换成更直接的做法：**父窗口用 React Portal，把画布内容投进 iframe 的 `document`。**

```
Designer（父树）
  └─ <iframe>            ← 空壳：document 由 prepareCanvasDocument 现场写出
       └─ createPortal(<CanvasSurface />, iframeDoc.body)
```

画布 DOM 仍在独立 document 里（样式、滚动、`@media` 照旧隔离），但**内容属于父树**。

两次实验验证（`apps/playground-react/probe*.tsx`，验证通过后已删除）：

| 验证项 | 结果 |
|---|---|
| `createRoot` 挂到 iframe document → 渲染 → state 更新 → 跨 document 合成事件（click 含 mousedown/mouseup） | **4/4 PASS** |
| Portal 投进 iframe → 父树 Context 可读 → 点击冒泡回父树 handler | **3/3 PASS** |

相对 `doc.write` 注入脚本，Portal 一次性消掉四个坑：

| 原方案的坑 | Portal 方案 |
|---|---|
| 画布入口 URL 在 ESM 下拿不到 | 不需要入口 |
| 模块执行两遍，用户模块级单例（store / 计数器）分裂成两份 | 不执行第二遍 |
| 用户的 Provider（主题 / i18n / query client）在画布里拿不到 | 同一棵 React tree，天然穿透 |
| 用户样式要在画布侧再 import 一次 | `prepareCanvasDocument` 从父文档克隆 `<style>` / `<link>` |
| ~100 行 `postMessage` + ready 重发 | 删除（React 侧；Vue 仍走旧路径） |

##### 三、分层：新增最外层包

```text
protocol
  ├─ materials ── materials-react / materials-vue
  ├─ renderer-core ── renderer / renderer-vue
  └─ designer-core ── designer-react / designer-vue
        └────────────┴──────────────┐
                                    ▼
                          render-react（渲染接入）
                                    ▼
                          lowcode-react（编辑态接入）
```

> 本节的 `lowcode-react` 后来被拆成两层：装配与渲染内核下沉到 `render-react`，
> 编辑态只保留「document + Designer + canvas portal」。两个形态的完整说明见 §12.14。

`@lowcode-next/lowcode-react` 是**唯一**允许同时依赖「编辑器 + 物料实现 + 渲染 + 模型」
的包。前几层各解决一个层面，接线这件事必须有人做，落在这里最合适 —— 塞进
`designer-react` 会让它从视图层变成依赖 `materials-react` / `renderer` 的复合包，
把 §12.13.10 刚理清的分层弄浑。

`designer-react` 的改动只有一个可选 prop：

```ts
renderCanvas?: (padding: number) => ReactNode;
```

给了它就走 `canvasMode: 'portal'`（造文档 + portal + `markCanvasReady()`）；
不给就是原来的独立入口页 + `postMessage`。**`designer-vue` 一行未改。**

`markCanvasReady()` 是新增的：独立入口页靠 iframe 的 `load` 事件通知「画布 DOM 就绪」，
而 portal 内容要等 React commit 之后才出现 —— 那时 `load` 早发过了，`getCanvas()` 还是
`null`，设计宽度量不到、选中框与拖拽全都失效。所以由宿主在画布首帧后补一次。

##### 四、接入方要写什么

```tsx
// main.tsx —— 全部内容
import '@pg/styles.css';                    // 编辑器皮肤
import { createEditor } from '@lowcode-next/lowcode-react';
import materials from './materials.json';   // 物料描述
import page from './page.json';             // 初始页面
import { StatCard } from './StatCard';      // 自己的组件

const editor = createEditor('#root', {
  schema: page,
  materials,
  components: { StatCard },
  includeBuiltin: true,
});
```

| | 改前 | 改后 |
|---|---|---|
| 管道代码 | `App.tsx` 48 + `materials.ts` 70 + `canvas-body.tsx` 59 + `preview-body.tsx` 66 + 两个入口薄壳 15 ≈ **258 行** | `main.tsx` 约 30 行（含注释） |
| 要理解的概念 | 物料包 / 描述 / 实现 / 装配 / Driver / 消息通道 | **物料 JSON + 组件映射** |
| HTML 入口 | 3 个 | **1 个**（`canvas.html` / `preview.html` 删除） |
| 多页构建配置 | `rollupOptions.input` 三份 | `entries: { main: 'index.html' }`（`defineApp` 新参数） |

业务组件那一侧的契约只有一条，写在 `StatCard.tsx` 的注释里：**把收到的 props 透传到
根元素**（`{...rest}`）。漏了它，`data-node-id` 落不到 DOM 上，选中框画不出来、拖拽算
不出落点、属性面板改值定位不到节点。

##### 五、错误分级

`renderer` 新增 `FaultBoundary`（逐节点包一层），`ReactDriverOptions` 新增 `mode`：

| 情形 | 编辑态 | 运行态 |
|---|---|---|
| 物料未注册 | 红框 + 组件名 + 「检查 materials 的 componentName，或 components 里漏了同名实现」 | 一行灰字「内容暂不可用」 |
| 组件渲染抛错 | 红框 + `error.message` + 重试按钮 | 同上 |
| 页面 JSON 非法 / 物料包冲突 | 整屏 `FatalScreen`（带 issue 列表） | — |

上一轮那条「装配期全量校验」（`assertMetaBindings` 缺实现就抛）在接入层改成**收集清单
+ `console.warn`**：接入别人的组件时少传一个实现是常态，不该让整个编辑器打不开。只有
「两个包抢同一个 `componentName`」仍然抛 —— 那确实无解。

`mode` 缺省按 `editorPlaceholder` 推断，所以旧的 `createReactDriver(input, { editorPlaceholder: true })`
调用点不用改。

##### 六、验证（全部实测）

| 项 | 结果 |
|---|---|
| `tsc -b` + 两个 app `--noEmit` | 0 错误 |
| `vitest` | 130/130（`react-driver.test.ts` 跟着 FaultBoundary 调整了断言位置） |
| CDP 实测（开发态） | iframe 内 16 节点；物料面板 **21 个**，含「业务组件 / 数据卡」；点选后 `data-selected` 与属性面板同步；真实鼠标拖拽 **16 → 17 节点**；console **0 error / 0 warning** |
| 错误态 | 临时插入 `NotExist` 节点：红框 + 排查文案按预期渲染，其余节点不受影响 |
| 生产构建 | React 产物**只有 `index.html`**（Vue 仍三页）；`<link>` 样式克隆生效，画面与开发态一致 |
| Vue 编辑器 | 未受影响（`canvasMode` 默认 `frame`） |

##### 七、还没做

1. **预览入口未接**：「预览」按钮仍置灰（`onPreview` 缺省不传就 disabled）。渲染能力本身
   已经有了 —— 见 §12.14 的 `LowcodeRender`，缺的只是「点一下怎么打开」这一层。
2. **编辑器皮肤仍要接入方自备**：`designer-react` 的 shadcn 类依赖一份 Tailwind 入口。
   这是下一层的问题，不在接入层能藏掉。
3. **`node.meta` 仍是构造时缓存**（同 §12.13.10 第 1 条）—— 与画布装载方式无关。

---

### 12.14 两个形态：编辑态与 render 态（2026-11-07 定稿）

用户明确的根本区分，**不是「预览按钮怎么开」这种细节**：

| | 编辑态 | render 态 |
|---|---|---|
| 是什么 | 带编辑器的接入形态 | 纯渲染。既是编辑器的示例预览，也是**未来消费端接入**的形态 |
| 谁在用 | 做页面的人 | 看页面的人、客户的项目 |
| 吃什么 | `DocumentImpl`（要订阅、要可编辑） | **schema + 组件映射**，消费端手里只有 JSON |
| 包 | `@lowcode-next/lowcode-react` | `@lowcode-next/render-react` |
| 对外 API | `createEditor(container, options)` 函数 | `<LowcodeRender schema materials components />` 组件 |

#### 12.14.1 为什么 render 态要独立成包

三条，都不是洁癖：

1. **它不需要 `DocumentImpl`。** `evaluate` 的入参只有 `componentsTree` 与
   `{ mode, scope, resolver }`（`renderer-core/src/index.ts:53`）。render 态若为复用
   编辑态的 `CanvasSurface` 而先 `createDocument`，等于白带一个 `model`。
2. **它不该跟 monaco 出现在同一个 `node_modules` 里。** `designer-react` 依赖
   `monaco-editor` / `@monaco-editor/react` / 6 个 `@radix-ui` / `lucide-react` /
   `tailwind-merge`。bundle 能靠模块图避开，但消费端接入时这些包照样会被安装。
3. **两个形态必须共用一份内核**，否则迟早出现「编辑器里好好的，线上不一样」——
   而且这种不一致排查成本极高。

#### 12.14.2 结构

```text
protocol
  ├─ materials ── materials-react
  │                    │
  ├─ renderer-core ── renderer
  │                    │
  │                    ▼
  │            render-react      渲染接入：assembleMaterials + renderTree + LowcodeRender
  │              │                依赖链里没有 model、没有 designer
  │              ▼
  └──────── lowcode-react      编辑态：document + Designer + canvas portal
                   └─ 复用 render-react 的装配与内核
```

`lowcode-react` 不再自己写装配；`CanvasSurface` 只剩「渲染内核 + 文档订阅」：

```tsx
// lowcode-react/src/canvas.tsx —— 全部渲染逻辑
const schema = document.toSchema();
return renderTree(schema.componentsTree, { registry, bindings, mode: 'edit' });
```

`mode` 是唯一分歧点：`edit` 注入空容器占位、错误块更显眼；`runtime` 都收敛。

#### 12.14.3 命名：向 lowcode 的工厂规范靠

调研得出两条事实：**lowcode 全仓没有 `mount*`**；编辑器是 `init()` / `destroy()`
（模块级单例，`destroy()` 无参数、靠模块级 `engineContainer`），渲染是
`export default factory()` 导出的一个**组件**。

照它的规律（`createXxx` 工厂、裸动词生命周期、`isXxx` 判定）：

| 改前 | 改后 | 依据 |
|---|---|---|
| `mountEditor(options)` | `createEditor(container, options)` | `createSimulator` 的工厂形态；container 提为第一参，与 `createRoot(container)` 同构 |
| `reactPackage()` / `vuePackage()` | `createReactPackage()` / `createVuePackage()` | 补动词，与 `createReactDriver` / `createMetaRegistry` 对齐 |
| `mountRender`（原计划） | `LowcodeRender`（组件） | 渲染要**嵌进**消费端已有的 React 树，声明式才组合得起来 |

两点**有意偏离**：

- 不叫 `init`：lowcode 敢用裸 `init` 是因为它全局单例。`createEditor` 返回 handle，
  一个页面可以开多个（`WeakMap<HTMLElement, Root>` 按容器管理，重复挂载先卸旧的）。
- 组件叫 `LowcodeRender` 而非 `LowcodeRenderer`：后者会和 driver 层的 `renderer` 撞名。

#### 12.14.4 render 态的接入代码

```tsx
// 消费端全部内容
import '@lowcode-next/render-react';
import { LowcodeRender } from '@lowcode-next/render-react';

<Route path="/p/:id" element={
  <LowcodeRender schema={page} materials={materials} components={{ StatCard }} />
} />
```

没有 document、没有 registry、没有 canvas、没有 Designer。

错误按「只坏一块」处理：装配失败或 JSON 非法 → `FatalScreen`（内联块，不 fixed、
不铺满，所以嵌在宿主页面里也不会毁掉整页）；单个组件缺失或抛错 → driver 的
`UnknownNode` / `FaultBoundary`。

#### 12.14.5 预览：序列化 + 独立入口，**不走 UMD**

「预览」按钮落地（§12.14.6 记为待办的那一项）。三种打开方式里选了第三种，
并且比 lowcode 的做法更彻底：**预览页自己 `import` 一遍包和组件，不用 UMD、
不用全局变量、不在 `window` 上挂任何注册表。**

能这么做的原因只有一句：render 态是纯映射 `schema + 物料表 → DOM`。同样的
schema、同样的物料，渲染结果必然相同 —— 所以两个窗口需要共享的是**源码和
数据**，不是运行时对象。

对比老方案（lowcode 及本项目上一版 `apps/shared/src/canvas-channel.ts` 那条路）：

| | 共享运行时对象（UMD / 全局注册表） | 各自 import（本方案） |
|---|---|---|
| 组件实例 | 必须唯一，靠 `<script>` 全局暴露 | 两个窗口各一份，互不干扰 |
| 跨文档传函数 | 只能 postMessage，要维护协议与请求应答 | 零 —— 只传 JSON |
| 组件内部 state | 被带进预览（编辑时点出的 hover、输入的字） | 干净环境，预览从零挂载 |
| 产物份数 | 各页各打一份 | 同一构建内共享 chunk，**只有一份** |

最后一行是实测的：`dist/render.html` 与 `dist/index.html` 引用的是同一个
`StatCard-*.js`（Rollup 用共享 chunk 里的模块名命名，体积 335 kB，实际是
react + render-react + materials-react 的公共部分）和同一份 CSS。

**通道**（`apps/shared/src/preview-route.ts`）：

```
编辑态                          浏览器                         render 态
onSchemaChange ──writePreview──► localStorage ──storage 事件──► subscribePreview
onPreview ──openPreview──► window.open('/render', noopener)
```

- 用 `localStorage` 而不是 `sessionStorage`：`storage` 事件只在**其他**文档触发，
  天然是单向广播；镜像到 localStorage 之后 `window.open` 才能加 `noopener`
  （预览页不反向持有编辑器），刷新也还在。
- 每提交一次写一遍 → 预览页原地跟着变，不用回编辑器重开。
- 读取一律过 `parsePageSchema`：旧版本结构、被手工改过的快照当作「没有」，
  回退到调用方自己的默认页，而不是渲染到一半炸。

**两个入口的文件**

| 文件 | 内容 |
|---|---|
| `index.html` + `src/main.tsx` | 编辑态，`createEditor` |
| `render.html` + `src/render.tsx` | render 态，`<LowcodeRender />` |
| `src/StatCard.tsx` | 业务组件，两个入口**都 import 它** |

`render.tsx` 与 `main.tsx` 的差别只有两处，正好是两个形态的分界：

| | `main.tsx` | `render.tsx` |
|---|---|---|
| 引入 | `createEditor`（函数，接管容器） | `LowcodeRender`（组件，嵌进 React 树） |
| 独有参数 | `canvasPadding` / `onSchemaChange` / `onPreview` | 无 |

`render.html` 里**不引**编辑器皮肤（`@pg/styles.css` 的 Tailwind preflight +
shadcn 令牌），只有两条消费端自己的全局样式（`margin: 0` + 字体）。物料自带的
`materials/styles.css` 由 `render-react` 内部引入。

路由上 `/preview` 与 `/render` 都由 `vite.base.ts` 的同一条中间件映射到同名
`.html`（改名 `entryRoutes`，原来只处理 `/preview`）：Vue 版仍用三页形态的
`preview.html`，React 版用 `render.html`，中间件不区分哪个 app。

Vue 侧顺带复用同一条通道：`preview-body.ts` 的 `sessionStorage.getItem` 改成
`readPreview()`，两侧不再各写一套读写与校验。

#### 12.14.6 验证（实测）

render 态探针（`render-probe.html` + `src/render-probe.tsx`，验证后已删除；
现在由正式的 `render.html` 接管）：

| 项 | 编辑态 | render 态 |
|---|---|---|
| 页面渲染 | 16 节点（iframe 内） | 16 节点（主文档） |
| 资源数（dev） | **139** | **46** |
| `designer` 命中 | 59 | **0** |
| `radix` / `lucide` / `tailwind-merge` | 5 / 1 / 1 | **0 / 0 / 0** |
| 编辑器界面 | 有（面板 / 顶栏 / 画布留白） | **无**，内容直接贴边 |
| console error / warning | 0 | 0 |

`render-react/dist` 的实际 import 只有 `protocol` / `materials` / `materials-react` /
`renderer` / `react`（字符串 `designer` 只出现在注释里）。

预览链路（`/render` headless 实测）：`data-lc-render` 存在、21 个物料全部渲染
（含「业务组件 / 数据卡」的「月度活跃 12,480」）、`/`、`/render`、`/render.html`、
`/src/render.tsx` 均 200；编辑器侧预览按钮从 `disabled` 变为可点
（`title="在新窗口打开运行态预览"`）。

顺带确认编辑态未被改坏：21 个物料、`tsc -b` 与两 app `--noEmit` 0 错误、
`vitest` 130/130、`pnpm build` 通过（React 产物 `index.html` + `render.html`）。

#### 12.14.7 还没做

1. **Vue 侧还没有等价的 `render-vue`** —— `renderer-vue` 与 `materials-vue` 都在，
   缺最上面这一层。Vue 的预览仍是手写的 `preview-body.ts`。
2. **接入方仍需自备 Tailwind 入口** —— `designer-react` 的 shadcn 类依赖它。
3. **`node.meta` 仍是构造时缓存**（`packages/model/src/node.ts`）—— `unuse()`
   之后存量节点拿到的是旧 meta。

### 12.15 原子物料重写（14 个）与录入回写通道（2026-11-07）

#### 12.15.1 清单与取舍

原来的 20 个物料是按「搭一张营销落地页」凑的，三个层次（原子 / 布局 / 页面模板）
挤在同一张面板里，语义不属于同一层。这轮按 lowcode 基础示例（demo-basic-antd）
的思路对齐原子层，**净结果 20 → 25，其中原子层重写为 14 个**：

| 组 | 组件 | 变化 |
|---|---|---|
| 布局（5） | Div / Stack / Grid / Section / Card | 不动 |
| 文字（2） | `Typography` / Link | **Heading + Text 合并**为 Typography（`type: h1–h4/body/caption` 一个属性表达标签与字号档） |
| 操作（1） | Button | 不动 |
| 录入（5） | Input / TextArea / Select / Checkbox / Switch | **全部新增**，依赖回写通道（§12.15.2） |
| 展示（6） | Tag / Divider / Image / Progress / Empty / Alert | `Badge → Tag` 改名；Progress / Empty / Alert 新增 |
| 区块（6） | Navbar / Hero / FeatureCard / Stat / CodeBlock / Footer | 不动（定位是「页面模板」，面板压在最下面） |

**删掉的**：`Icon`（只是往 span 里打一个字符，真图标要图标集，假 Icon 比没有更
误导）、`Spacer`（`style.margin` 就能表达）。

**改名**：`Badge → Tag` —— 它做的是分类/状态标签（antd 的 Tag）；Badge 在业界指
数字角标，不是同一个东西。

style 上对应改了 `materials/src/styles.css`：`lc-heading--*` → `lc-typo--*`、
`lc-badge--*` → `lc-tag--*`（补 warning / error 两档）、新增 `lc-input / lc-select /
lc-textarea / lc-checkbox / lc-switch / lc-progress / lc-empty / lc-alert`，
聚焦环统一 `--lc-focus-ring`（box-shadow，不吃圆角）。

#### 12.15.2 录入回写通道：Symbol 方案的失败与 Context 定稿

录入组件（Input/Select/…）的值属于 schema（`props.value`），但 `renderTree` 是
纯函数（schema → 视图），组件打字后**谁写回 schema**？链路：

```
组件 onChange → 回写函数 → document.setProps(id, {prop: value})
                            └─ 走 command，undo/redo / 属性面板同步全部免费
```

**第一版（已废）：driver 往 props 塞 `Symbol.for('lowcode-next.prop-setter')`。**
protocol 导出 symbol，driver 注入，物料 `getPropSetter(props)` 读。三个坑：

1. `Record<string, unknown>` 的 string 索引不接受 symbol 键，`Props` 加 symbol
   槽位后 weak-type 检测（TS2322 "no properties in common"）会让业务组件的具体
   props 接口接不进 `ReactBindings`；
2. 这些都能绕，但真正致命的是 **React 19 的 `createElement` 用 `for...in` 拷贝
   config —— symbol 键被静默丢弃**。实测 `createElement(Comp, {[SYM]: fn})`
   渲染后组件拿到的 props 里 symbol 消失（CDP fiber 探针证实）。字符串键能活，
   但函数值经业务组件的 `{...rest}` 透传会漏到 DOM 属性上，dev 刷警告。

**定稿：React Context。** `materials-react` 导出 `PropSetterProvider` /
`usePropSetter(props)`；driver 不认识 context —— `ReactDriverOptions.wrapRoot`
只提供「renderRoot 产出过一道」的包装点，由知道 materials-react 的 `renderTree`
把树包进 Provider：

- node id 由物料自己从 `props['data-node-id']` 读（字符串键，createElement 不丢）；
- 没包 Provider（纯预览）→ `usePropSetter` 返回 undefined → 组件退回内部 state，
  可以交互但不落库。两条路读同一个 `props.value`，编辑所见即线上初始值；
- Vue 侧 driver 保留 props 注入（`h()` 直接保留 props 对象引用，symbol 能活），
  materials-vue 实现录入组件时用 `getPropSetter()` 读取即可。

#### 12.15.3 验证（实测）

- `tsc -b` + 两 app `--noEmit` 0 错误、`vitest` 130/130、`pnpm build` 通过；
- **CDP 可信输入（`Input.insertText`）**：编辑态画布 Input 打字 →
  `document.setProps('form_name', {value})` → `__editor.getSchema()` 读到新值 ✓；
  Switch 点击 → `checked: false` 进 schema ✓；
- 教训一条：**验证 React 受控输入不能用合成 `dispatchEvent(new Event('input'))`**
  —— React 的受控恢复机制会在处理器读到值之前把 DOM value 拉回 props.value，
  合成事件拿到的永远是旧值。真实打字（可信事件）没问题，这是测试工具的限制
  不是产品缺陷；
- `/render` 冒烟：21 个物料（含全部新组件）渲染成功，0「未注册物料」兜底；
- `page.json` 加了「表单演示」区块（Input/TextArea/Select/Checkbox/Switch/
  Progress/Alert），作为回写通道的常驻示例。

#### 12.15.4 还没做

1. **Vue 物料仍是 3 个**（Div/Typography/Button），录入与展示组件待补；
   Vue 的 `render-vue` 同 §12.14.7。
2. **Table / Form** 属复合组件，需要数据源或校验机制，不在原子层。
3. **Icon** 若要回来，正确做法是接一个图标集把 `name` 映射到组件，属于独立决策。

### 12.16 组件库收口为原子组件，页面壳 `Page`（2026-11-07）

#### 12.16.1 决策

用户拍板：组件库面板**只显示原子组件**（§12.15 的 14 个），布局（Div / Stack /
Grid / Section / Card）与页面区块（Navbar / Hero / FeatureCard / Stat /
CodeBlock / Footer）**从注册表彻底移除**——不是隐藏，是删除 meta、实现与样式。

随之而来的是一个协议层问题：`componentsTree: NodeSchema` 要求根是一个组件节点，
没有容器物料之后「根渲染成什么」没有着落。解法是引入**引擎级页面壳 `Page`**：

- 一个不带任何语义的块级容器，吃 `style` 覆盖口，children 即页面内容；
- meta 上 `configure.component.hidden: true`（protocol 新增字段）——
  它必须注册（根要渲染、顶层拖放要落点），但不出现在物料面板里：
  页面里再套一层页面没有意义。React / Vue 两个 MaterialPanel 都跳过 hidden；
- 它不是「布局组件」，是页面本身 —— lowcode 的 componentsTree 根同样是
  独立成类的 Page 物料，思路一致。

#### 12.16.2 删了什么

| 层 | 文件 |
|---|---|
| 描述 | `materials/src/metas/layout.ts`、`blocks.ts` 整文件删除 |
| React 实现 | `materials-react/src/components/layout.tsx`、`blocks.tsx` |
| Vue 实现 | `materials-vue` 的 `Div.vue`（Vue 物料变 Page / Typography / Button） |
| 样式 | `styles.css` 的布局容器～页脚共 364 行；新增 `.lc-page`（仅 min-height） |
| 图标 | `icons.tsx` 的 GLYPHS 清到「Page + 14 原子」 |

两份示例 schema 同步重写成**纯纵向流**：没有 Stack/Section 之后，块级组件
（Typography / Input / Alert…）依次往下排，行内组件（Tag / Link / Button）
天然并排，间距一律走各组件的 `style` 覆盖口。`sampleSchema`（protocol 自带
的最小示例）根节点也从 Div 换成 Page。

#### 12.16.3 验证（实测）

- `tsc -b` + 两 app `--noEmit` 0 错误；`vitest` **131/131**（materials.test
  新增两条守卫：容器唯一性 `['Page']`、hidden 物料不在可见清单、可见恰 14 个）；
  `pnpm build` 通过；
- CDP 实测编辑器：活动栏点开组件库，分组只有
  **文字 / 操作 / 录入 / 展示 / 业务组件**，卡片 15 张
  （14 原子 + StatCard），Page 不在面板；画布 19 节点、0 个未注册兜底、
  `.lc-page` 根渲染正常；
- Vue playground（临时 5189）：iframe 内 3 节点、Page 根、提交/取消按钮、0 兜底；
- `/render`：Page 根 + 表单组件全部渲染，0 兜底。
