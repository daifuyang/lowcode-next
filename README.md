# lowcode-next

一个从零开始写的低代码引擎内核：**零框架的协议 / 模型 / 拖拽**，加上**按框架分家的渲染器与编辑器**，React 与 Vue 各有一套物料的真实实现。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

设计文档见 [`DESIGN-v1.md`](./DESIGN-v1.md)（代码注释里的 `§x.y` 都指向这份文档的具体章节）。

## 它是什么

市面上大多数低代码引擎把「框架」焊死在核心里（React 单例、全局注册表、`init()` 挂 window）。这个项目反过来切：

- **零框架内核** —— 协议校验、文档模型、拖拽骨架、物料描述、渲染 IR 与求值，全都不 import React/Vue。
- **按框架分家** —— 物料实现、渲染驱动、编辑器 UI 各有一份 React 版和 Vue 版，共用同一套内核与协议。

由此得到两个**形态**，这是本项目最根本的区分：

| 形态 | 是什么 | 依赖 | 用在哪 |
| --- | --- | --- | --- |
| **编辑态** | `createEditor(container, options)`，带完整设计器 | `designer-react`（含 monaco / radix / lucide） | 后台配置界面 |
| **render 态** | `<LowcodeRender schema={page} />` 组件 | 止于 `protocol / materials / renderer` | 消费者页面、预览 |

两个形态**共用同一份渲染内核**（`schema → IR → driver.renderRoot`），所以「编辑器里看到什么、线上就渲染什么」是结构保证的，不靠人记得同步。render 态不会带上 `monaco / radix / lucide`，打包资源量只有编辑态的三分之一左右。

## 快速开始

```bash
pnpm install

pnpm dev        # React playground → http://localhost:5173
pnpm dev:vue    # Vue playground   → http://localhost:5174
```

| 应用 | 入口 | 说明 |
| --- | --- | --- |
| `apps/playground-react` | `/index.html` | 编辑态 |
| | `/render.html` | render 态（同一份 schema，独立入口页） |
| `apps/playground-vue` | `/index.html` | 编辑态 |
| | `/canvas.html` | 画布入口页（iframe `frame` 模式宿主） |
| | `/preview.html` | 预览入口页 |

> React 版画布走 `portal`：iframe 文档由宿主 `doc.write` 空壳，画布内容用 React Portal 投进去 —— 同一棵 React tree，Context / 样式 / 模块单例天然可用，零 `postMessage`。Vue 版走 `frame`：独立入口页 + `postMessage`。

## 包结构

```
packages/
  protocol/          # 协议：PageSchema zod 校验、ComponentMeta、defineMaterial
  model/             # 文档模型：DocumentImpl、节点树、历史（undo/redo）
  drag/              # 拖拽骨架：命中、投放位、约束（零框架）
  materials/         # 物料**描述** + 注册表 + 内置物料 meta（无视图）
  renderer-core/     # 渲染 IR、表达式求值、占位判定（零框架）
  materials-react/   # 内置物料的 React 实现
  materials-vue/     # 内置物料的 Vue 实现
  renderer/          # React 渲染驱动 + FaultBoundary
  renderer-vue/      # Vue 渲染驱动
  designer-core/     # 编辑器会话：选择、命令、历史、错误通道（零框架）
  designer-ui/       # 编辑器共享的 CSS Module 与图标数据
  designer-react/    # React 设计器 UI（shadcn 风格控件 + monaco 代码面板）
  designer-vue/      # Vue 设计器 UI
  render-react/      # render 态接入层：<LowcodeRender />
  lowcode-react/     # 编辑态接入层：createEditor()
apps/
  playground-react/   # 5173，React 接入演示
  playground-vue/     # 5174，Vue 接入演示
  shared/             # 两个 playground 共用的零框架宿主工具：预览通道、schema 存储、toast、示例页面、Vite 基础配置
```

依赖方向是单向的，没有任何循环：

```
零框架内核   protocol ──────────────────────────────┐（无外部依赖，只带 zod）
             model / drag / materials / renderer-core ┘ 只依赖 protocol

视图层       materials-react|vue  →  materials
             renderer | renderer-vue  →  renderer-core

编辑器       designer-core  →  protocol + model + drag
             designer-react | designer-vue  →  designer-core + designer-ui

接入层       render-react  →  renderer + materials-react
             lowcode-react →  designer-react + render-react
```

三条硬规矩：

1. 零框架包里不出现 `react` / `vue`。
2. Vue 包不得依赖任何带 `react` 的包。
3. `designer-core` 只管编辑逻辑，**持久化归宿主** —— core 只提供 `session.onSave(schema)` 这个动作出口，存到 localStorage / 落库 / 下载由业务侧决定，没传就静默 no-op。

## 用法

### render 态（消费端）

```tsx
import { LowcodeRender } from '@lowcode-next/render-react';
import page from './page.json';

export function PageView() {
  return <LowcodeRender schema={page} includeBuiltin />;
}
```

`includeBuiltin` 决定是否挂上内置的 15 个物料；真实业务接入通常关掉，只留自己的业务组件。

`materials` / `components` 只在要追加业务物料时传，且**请给稳定引用**（模块级常量或 `useMemo`）—— 内联字面量会让每次重渲染都重新装配一遍注册表。

### 编辑态（React）

```tsx
import { createEditor } from '@lowcode-next/lowcode-react';
import page from './page.json';

const editor = createEditor('#root', {
  schema: page,
  documentId: 'landing',
  includeBuiltin: true,               // 演示用；只拖自己的业务组件时关掉
  onSave: (schema) => save(schema),
});

// 卸载
editor.destroy();
```

`createEditor` 返回 handle 而不是模块级单例，所以一个页面里可以同时开多个编辑器；`documentId` 同时是「保存」的默认存储 key。

### 追加业务物料

物料分两半：**描述**（`materials`，零框架，进面板和协议校验）与**实现**（`materials-react` / `materials-vue`，各自的视图）。接入时两边各给一份，靠 `componentName` 对上：

```tsx
createEditor('#root', {
  schema: page,
  materials,                 // 描述：meta 列表，通常从 materials.json 来
  components: { StatCard },  // 实现：React 组件映射
});
```

### 内置物料

面板里是 **14 个原子组件 + 1 个通用容器**，页面根由一个隐藏的 `Page` 壳承担（`hidden: true`，不进面板）：

- 容器：`Div`
- 文字：`Typography`、`Link`
- 操作：`Button`
- 录入：`Input`、`TextArea`、`Select`、`Checkbox`、`Switch`
- 展示：`Tag`、`Divider`、`Image`、`Progress`、`Empty`、`Alert`

`Row / Col / Card / Section` 之类的布局物料是**刻意删掉**的 —— 布局表达交给组件自身的 `style` 覆盖口和这一个裸 `Div`，避免「半套栅格」把人绕进去。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm dev:vue` | 起 playground（5173 / 5174） |
| `pnpm build` | `tsc -b` 出类型，再构建两个 app |
| `pnpm typecheck` | `tsc -b` + 两个 app `--noEmit` |
| `pnpm test` | `vitest run` |
| `pnpm clean` | 清 `dist` 与 `*.tsbuildinfo` |

要求 Node ≥ 20、pnpm 11。

## License

[MIT](./LICENSE) © 2026 daifuyang
