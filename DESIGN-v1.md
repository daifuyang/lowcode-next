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
// apps/playground/vite.config.ts
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

**VueDriver 的缝**：只需实现 `Driver` 接口，`h(...)` 替掉 `createElement`，`data-node-id` 同样透传。拖拽引擎完全不用改。见 §7.4。

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

| 组件 | 是否依赖 React/Vue |
|---|---|
| protocol / model / drag / renderer(Evaluator) | 否 |
| ReactDriver | 是（唯一） |
| designer UI | 是（React，但只影响开发设计器的人） |

**编辑态拖拽只依赖 `data-node-id` + `getBoundingClientRect`，因此 Vue 页面作为被拖拽内容时，同一套引擎直接可用。**

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
| 更新时机 | 选区 / hover 变化 → `useLayoutEffect` **同步**重测一次（换节点要当帧画对）；滚动（capture）、resize、`ResizeObserver`（容器 + 目标）、`MutationObserver`（结构 / class / style）走 rAF 合并；**CSS 过渡 / 动画期间按帧跟随**（`followTransitions`） |
| 取元素 | **每次 `sync` 重新 `querySelector`**，不缓存元素引用。选中没变但元素被 React 重建（改样式导致重挂、撤销后整棵子树重渲染）时 effect 不会重跑，抓死的旧引用已经脱离文档，量出来是 0×0 —— 就是"有时候选中框没了" |
| 防抖 | rAF 合并；测量只读布局，值不变不 `setState`，否则 MutationObserver 会和自己的 style 变化互相触发 |
| 过渡 | **没有** `width/height` 过渡（引擎也没有）。`transform` 不过渡而尺寸过渡，换选中节点时就会"位置先跳、框再长大"，是可见的闪烁 |

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
playground 的预览走 `?preview=1` 新窗口：schema 经 sessionStorage 传递，
用 `createReactDriver(registry)`（无编辑态占位）以 `mode: 'runtime'` 渲染。

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
  `@source '../../../packages/designer/src'` 里声明才会被编译。
- shadcn 主题令牌在 `styles.css` 的 `:root` 里映射到引擎 DPL 色板
  （--primary #006cff、--input N-5、--ring 品牌蓝 25%、--destructive @brand-danger…），
  所以 shadcn 组件出厂就是 7.12 的引擎观感。
- preflight 全局生效于宿主文档：壳样式全是显式 CSS Modules，实测无回归；
  画布在 iframe 里有自己的文档，完全不受影响。

designer 侧新增（`packages/designer/src/ui/`）：

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
的 path，离线存进 `packages/designer/src/EngineIcons.tsx`（`EngineIcon` +
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
hover #F2F3F7、选中 #5584FF）对齐；激活页签按
`.next-tabs-tab.active { font-weight: normal }` 去掉 500（12px 中文用 500
会合成加粗反而糊）。折叠分组头保留引擎 `lc-field-head` 的 500。
**本轮没有新增组件或依赖**：面包屑仍是原生 button + CSS Module，盒模型
8 个透明输入改为复用现有 shadcn `Input`（`cn()` 覆盖边框/圆角/ring）。

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
| 组件根节点不透传 `data-node-id` | 命中失败 | Driver 强制包一层 `<div data-node-id style="display:contents">`；对多根组件同样有效 |
| 可变模型 + 命令 | 协同/回放 | 命令已是唯一写入口，后续接 OT/CRDT 只需在 `apply` 处拦截 |
| 矩形缓存失效不全 | 落点偏移 | 滚动/resize/MutationObserver 三重失效 + dragstart 强制 prime |
| 物料双框架维护 | 长期成本 | v2 再议；v1 只有 React |

### 待确认（3 项）

1. **画布 v1 是否确定用同文档 + CSS 隔离**（不上 iframe）？影响 M4 的实现量。
2. **物料面板与画布的拖拽是否要求"拖入时有缩放/旋转视觉"**？v1 建议只做位移。
3. **是否需要在 v1 就支持把节点拖到画布外（例如删到垃圾桶）**？建议 v2。
