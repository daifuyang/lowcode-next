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
 * `/preview` → `/preview.html`。
 *
 * 预览是独立 HTML 入口（多页构建的第三个），产物里是 `dist/preview.html`。
 * dev 与 `vite preview` 都由这条中间件把干净路径映射过去，演示时不必贴带
 * `.html` 的地址。**真实部署（nginx / 静态托管）需要在托管侧加同一条 rewrite**，
 * 见 DESIGN-v1 §12.13.6。
 */
function previewRoute(): PluginOption {
  const mapPreview = (url: string | undefined): string | undefined => {
    if (!url) return url;
    return /^\/preview(?:[?#]|$)/.test(url) ? url.replace(/^\/preview/, '/preview.html') : url;
  };
  return {
    name: 'playground:preview-route',
    // 不返回函数 = pre 中间件，排在 Vite 内部 html 处理之前
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = mapPreview(req.url);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = mapPreview(req.url);
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
}

export function defineApp({ appDir, port, plugins }: AppOptions): UserConfig {
  const entry = (file: string) => resolve(appDir, file);

  return {
    plugins: [previewRoute(), ...plugins],
    resolve: {
      alias: {
        // 共享宿主代码（画布、预览、示例 schema、样式入口）
        '@pg': resolve(appDir, '../shared/src'),
        '@lowcode-next/protocol': pkgSrc('protocol'),
        '@lowcode-next/model': pkgSrc('model'),
        '@lowcode-next/renderer': pkgSrc('renderer'),
        '@lowcode-next/drag': pkgSrc('drag'),
        // ★ designer-core 必须显式 alias：它带 dist，漏掉这一条时 `@lowcode-next/designer-core`
        // 会按 package.json 的 exports 解析到 `dist/*.js` —— 于是改 src 不生效（开发时
        // 的画布/选中框行为停在最后一次 `tsc -b` 的产物上，极难排查）。2026-11-06 实测踩过。
        '@lowcode-next/designer-core': pkgSrc('designer-core'),
        '@lowcode-next/designer-react': pkgSrc('designer-react'),
        '@lowcode-next/designer-vue': pkgSrc('designer-vue'),
        // designer-ui 只有资源（CSS Module / 图标数据），没有 index 入口，
        // 这里映射到 src 目录本身，子路径按文件名拼接。
        '@lowcode-next/designer-ui': pkgSrc('designer-ui'),
      },
      // ★ 防止同时存在两份 React（hooks 会直接失效）/ 两份 Vue（runtime 各持一份状态）
      dedupe: ['react', 'react-dom', 'vue'],
    },
    // 多页入口：三份 HTML 各自决定加载什么，入口 chunk 里没有任何运行时分支
    //   index.html   = 编辑器宿主（flavor 由「这是哪个 app」决定，不在代码里判断）
    //   canvas.html  = iframe 画布渲染入口（renderer-react，两版都有）
    //   preview.html = 运行态预览（renderer-react，与编辑器框架无关）
    build: {
      rollupOptions: {
        input: {
          main: entry('index.html'),
          canvas: entry('canvas.html'),
          preview: entry('preview.html'),
        },
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
