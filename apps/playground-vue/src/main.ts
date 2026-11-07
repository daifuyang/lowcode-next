import '@pg/styles.css';

import { boot } from './boot';

/**
 * Vue 版 playground 的编辑器入口 —— 与 `apps/playground-react/src/main.tsx` 同形，
 * 差别只有 `./boot` 里装的是哪个设计器。
 *
 * 没有分支、没有动态 `import()`：这里不存在「另一套编辑器」可以选。
 */
boot();
