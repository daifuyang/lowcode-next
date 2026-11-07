import type { PageSchema } from '@lowcode-next/protocol';
import landing from './landing.json';

/**
 * 落地页 schema（§12.18）。
 *
 * **`landing.json` 是唯一真源** —— 那是设置器与渲染器真正消费的东西：编辑器读它
 * 出场，属性面板改它，`<LowcodeRender />` 渲染它。这个文件只做一件事：类型收口。
 *
 * 为什么不能直接 `import landing from './landing.json'` 到处用：`resolveJsonModule`
 * 推断出来的是**字面量类型**，`props` 会是 `{ type: string; tone: string; ... }`
 * 这种具体形状，没有索引签名，传给 `PageSchema` / `parsePageSchema` 会因为
 * `Record<string, unknown>` 不兼容而报错。cast 只在这一处发生，页面数据不用
 * 迁就 TS。
 *
 * 想改页面就改 JSON；改完 `pnpm test` 里的 `landing.test.ts` 会挡住重名 id、
 * 未注册物料、componentsMap 漏登记这三类不会在页面上报错的坏法。
 */
export const landingSchema = landing as PageSchema;
