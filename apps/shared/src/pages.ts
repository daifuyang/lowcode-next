import type { PageSchema } from '@lowcode-next/protocol';
import { sampleSchema } from '@lowcode-next/protocol';
import { landingSchema } from './schemas/landing';

/**
 * 演示页面登记表 —— **想换成自己的页面，只改这个文件**。
 *
 * 这里刻意只有数据和一个挑页函数，没有任何装配/渲染逻辑：两个 app
 * （React / Vue）都读它，换成自己的 `PageSchema` 后两版同时生效。
 *
 * 为什么单独一个文件而不是写在 `App.tsx` 里：读代码的人通常只想知道两件事 ——
 * 「页面内容在哪」和「编辑器怎么起来」。混在一个文件里，前者会被后者的 try/catch、
 * URL 解析、错误态淹掉。
 */

export interface DemoPage {
  /** URL 参数 `?page=` 的取值 */
  key: string;
  /** 控制台切换器上显示的名字 */
  label: string;
  schema: PageSchema;
  /** 画布内边距：整幅落地页贴边，小示例留白 */
  padding: number;
}

export const DEMO_PAGES: readonly DemoPage[] = [
  {
    key: 'landing',
    label: '落地页示例',
    schema: landingSchema,
    padding: 0,
  },
  {
    key: 'sample',
    label: '最小示例',
    schema: sampleSchema,
    padding: 20,
  },
];

/**
 * 按 `?page=` 挑页面，取不到就回退。
 *
 * 两个 app 的默认页不同（Vue 侧物料还没补齐，打开落地页会大面积兜底），
 * 所以回退值由调用方给，这里不写死。
 */
export function pickPage(fallback: string): DemoPage {
  const fallbackPage = findPage(fallback) ?? DEMO_PAGES[0]!;
  let key: string | null = null;
  try {
    key = new URLSearchParams(globalThis.location.search).get('page');
  } catch {
    return fallbackPage;
  }
  return (key && findPage(key)) || fallbackPage;
}

function findPage(key: string): DemoPage | undefined {
  return DEMO_PAGES.find((page) => page.key === key);
}
