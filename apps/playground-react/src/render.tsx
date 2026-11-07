/**
 * render 态入口（`render.html` → `/render`，DESIGN-v1 §12.14.5）。
 *
 * 这是**消费端视角**的文件：它属于一个已经跑起来的 React 应用，只是正好和编辑器
 * 在同一个仓库里。所以它 import 的东西和真实项目一模一样 —— 包、物料 JSON、
 * 自己的组件 —— 不引用任何编辑器代码，也不知道编辑器存在。
 *
 * 与 `main.tsx` 的差别只有两处，正好体现两个形态的分界：
 *
 * | | 编辑态 `main.tsx` | render 态 `render.tsx` |
 * |---|---|---|
 * | 引入 | `createEditor`（函数，接管容器） | `LowcodeRender`（组件，嵌进 React 树） |
 * | 多出来的 | `canvasPadding` / `onSchemaChange` / `onPreview` | 无 |
 *
 * 渲染内核是同一个 `renderTree`，所以「编辑器里看到什么、线上就渲染什么」
 * 是结构保证的，不靠人记得同步。
 *
 * **注意这里没有 UMD、没有全局变量、没有 window 上的注册表。** 物料在编辑器
 * 窗口注册过一遍，在这里照样要再 import 一遍 —— 这正是关键：两边共享的是
 * **源码和数据**，不是运行时对象。详见 §12.14.5。
 */

import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { LowcodeRender } from '@lowcode-next/render-react';
import { readPreview, subscribePreview } from '@pg/preview-route';

import materials from '../materials.json';
import page from '@pg/schemas/landing.json';
import { StatCard } from './StatCard';

/**
 * 模块级常量：`LowcodeRender` 在 `components` 变化时会重新装配整张注册表，
 * 写成内联字面量等于每次重渲染都白干一遍。
 */
const COMPONENTS = { StatCard };

function RenderPage() {
  // 预览窗口是「后打开的」，所以要听编辑器的后续改动；拿不到快照
  // （直接访问 /render、或存储被禁用）就退回共享的 landing.json。
  const [schema, setSchema] = useState(() => readPreview() ?? page);

  useEffect(() => subscribePreview(setSchema), []);

  return (
    <LowcodeRender
      schema={schema}
      materials={materials}
      components={COMPONENTS}
      // 演示页用到了 20 个内置物料；真实业务接入通常只保留自己的组件
      includeBuiltin
    />
  );
}

const host = document.getElementById('root');
if (!host) throw new Error('render.html 缺少 #root 挂载点');

createRoot(host).render(<RenderPage />);
