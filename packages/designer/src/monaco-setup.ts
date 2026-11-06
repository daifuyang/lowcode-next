// 全量入口：Vite 会把 monaco 预构建成单个依赖，dev 下不会拆出几百个
// 临时模块（本机 Vite 删除 deps_temp 时会被沙箱的批量删除保护拦住）。
// 其余语言定义都是懒加载的动态 chunk，不会进样式页签的运行时下载量。
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
// Vite 8 / rolldown 解析不了带 `?worker` 查询的 bare specifier，
// 这里走包目录下的相对路径（pnpm 会为直接依赖建立 packages/designer/node_modules）。
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import CssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';

/**
 * 对齐引擎 `@alilc/lowcode-plugin-base-monaco-editor` 的效果，但把 Monaco 打包进
 * 本地（引擎走 `monaco-editor@0.33.0` 的 CDN），不依赖外网。
 *
 * CSS language service（补全 / 校验 / 文档格式化）整个跑在 css.worker 里，
 * 少了它 `language="css"` 会退化成没有智能提示的纯文本框。
 */
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new CssWorker();
    }
    return new EditorWorker();
  },
};

// 用本地打包的 monaco 实例，阻止 @monaco-editor/loader 去 CDN 拉取 0.33.0。
loader.config({ monaco });
