import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginOption, UserConfig } from 'vite';

/**
 * playground 的共享 Vite 配置（DESIGN-v1 §12.13.6）。
 *
 * 两个 app（`playground-react` / `playground-vue`）各自只有一份 30 行的
 * `vite.config.ts`，差异只有「装哪个插件」和「端口」；其余（alias、多页入口、
 * 预览路由、dedupe）全在这里。
 *
 * 这个文件**不 import 任何第三方运行时模块**（只有 `node:*` 与 type-only 的
 * `vite`）：`apps/shared` 不是 workspace 包、没有自己的 `node_modules`，
 * 一旦在这里 import `@tailwindcss/vite` 之类就会解析失败。插件由各 app 传入。
 */

/** `packages/<name>/src` —— 以本文件位置为基准，与 cwd 无关 */
const pkgSrc = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src`, import.meta.url));

/**
 * 干净路径 → 多页入口：`/preview` → `/preview.html`、`/render` → `/render.html`。
 *
 * dev 与 `vite preview` 都由这条中间件把干净路径映射过去，演示时不必贴带
 * `.html` 的地址。**真实部署（nginx / 静态托管）需要在托管侧加同样的 rewrite**，
 * 见 DESIGN-v1 §12.13.6。
 *
 * 两个入口并排而不是一个：`preview` 是 Vue 版的三页形态（画布也是独立入口），
 * `render` 是 React 版的消费端入口（§12.14.5）。哪个 app 用哪条，由各自的
 * `entries` 决定，中间件不区分 —— 映射到不存在的文件时 Vite 自己会 404。
 */
function entryRoutes(): PluginOption {
  const rewrite = (url: string | undefined): string | undefined => {
    if (!url) return url;
    return url.replace(/^\/(preview|render)(?=[?#]|$)/, '/$1.html');
  };
  return {
    name: 'playground:entry-routes',
    // 不返回函数 = pre 中间件，排在 Vite 内部 html 处理之前
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url);
        next();
      });
    },
  };
}

export interface AppOptions {
  /** 本 app 的目录（`import.meta.dirname`），多页入口以它为基准 */
  appDir: string;
  port: number;
  /** 各 app 自己的框架插件（react / vue）+ 共用插件（tailwind） */
  plugins: PluginOption[];
  /**
   * 多页入口，`{ 产物名: html 文件 }`。
   *
   * 缺省三页 —— 编辑器 / 画布 / 预览各一个 HTML 入口。这是「画布代码与编辑器
   * 分开打包」时代的形态：iframe 指向独立入口，跨文档传不了函数，只能各自执行。
   *
   * `@lowcode-next/lowcode-react` 的画布是 Portal 进 iframe 的（同一棵 React tree），
   * 不需要画布入口；它的 render 态是独立的消费端页面（`render.html`），所以那个
   * app 留两页：`index.html` + `render.html`（§12.14.5）。
   */
  entries?: Record<string, string>;
}

const DEFAULT_ENTRIES: Record<string, string> = {
  main: 'index.html',
  canvas: 'canvas.html',
  preview: 'preview.html',
};

export function defineApp({ appDir, port, plugins, entries }: AppOptions): UserConfig {
  const entry = (file: string) => resolve(appDir, file);
  const pages = entries ?? DEFAULT_ENTRIES;

  return {
    plugins: [entryRoutes(), ...plugins],
    resolve: {
      alias: {
        // 共享宿主代码（画布、预览、示例 schema、样式入口）
        '@pg': resolve(appDir, '../shared/src'),
        '@lowcode-next/protocol': pkgSrc('protocol'),
        '@lowcode-next/model': pkgSrc('model'),
        '@lowcode-next/materials': pkgSrc('materials'),
        '@lowcode-next/materials-react': pkgSrc('materials-react'),
        '@lowcode-next/materials-vue': pkgSrc('materials-vue'),
        '@lowcode-next/renderer-core': pkgSrc('renderer-core'),
        '@lowcode-next/renderer': pkgSrc('renderer'),
        '@lowcode-next/renderer-vue': pkgSrc('renderer-vue'),
        '@lowcode-next/render-react': pkgSrc('render-react'),
        '@lowcode-next/drag': pkgSrc('drag'),
        // ★ designer-core 必须显式 alias：它带 dist，漏掉这一条时 `@lowcode-next/designer-core`
        // 会按 package.json 的 exports 解析到 `dist/*.js` —— 于是改 src 不生效（开发时
        // 的画布/选中框行为停在最后一次 `tsc -b` 的产物上，极难排查）。2026-11-06 实测踩过。
        '@lowcode-next/designer-core': pkgSrc('designer-core'),
        '@lowcode-next/designer-react': pkgSrc('designer-react'),
        '@lowcode-next/designer-vue': pkgSrc('designer-vue'),
        '@lowcode-next/lowcode-react': pkgSrc('lowcode-react'),
        // designer-ui 只有资源（CSS Module / 图标数据），没有 index 入口，
        // 这里映射到 src 目录本身，子路径按文件名拼接。
        '@lowcode-next/designer-ui': pkgSrc('designer-ui'),
      },
      // ★ 防止同时存在两份 React（hooks 会直接失效）/ 两份 Vue（runtime 各持一份状态）
      dedupe: ['react', 'react-dom', 'vue'],
    },
    // 多页入口：每份 HTML 各自决定加载什么，入口 chunk 里没有任何运行时分支
    build: {
      rollupOptions: {
        input: Object.fromEntries(
          Object.entries(pages).map(([name, file]) => [name, entry(file)]),
        ),
      },
    },
    server: {
      host: '127.0.0.1',
      port,
      // 共享源码在 app 目录之外（`../shared`），dev 下要允许读取；
      // 同时保留仓库根，packages/* 以源码形态 alias 进来。
      fs: { allow: [resolve(appDir, '..'), resolve(appDir, '../..')] },
    },
  };
}
