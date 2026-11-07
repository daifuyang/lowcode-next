import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createReactDriver, evaluate } from '@lowcode-next/renderer';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import '@lowcode-next/materials/styles.css';
import { createReactEditorMaterials } from './materials';
import { PREVIEW_KEY } from '@pg/preview-route';
import styles from '@pg/shell.module.css';

/**
 * 预览页入口（`preview.html` → `/preview`），对应引擎 demo 的 preview.html。
 *
 * 这是**运行态渲染**：没有编辑态占位、没有 designer 外壳，渲染的是用户搭的页面。
 * 它和编辑器 UI flavor 无关 —— 永远走 `renderer-react`。
 *
 * 为什么是独立 HTML 入口而不是 `?preview=1`：入口 HTML 决定加载哪个模块，
 * 入口 chunk 里就**没有任何运行时分支**（`main.tsx` 现在只剩 flavor 一个
 * 编译期判断）。schema 仍经 sessionStorage 从编辑器传过来 —— 同源新窗口共享。
 */

function PreviewApp() {
  const [materials] = useState(() => createReactEditorMaterials());
  const schema = useMemo<PageSchema | null>(() => {
    try {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      return raw ? parsePageSchema(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }, []);

  if (!schema) {
    return (
      <div className={styles.fatal}>
        <p className={styles.fatalTitle}>预览数据不存在</p>
        <pre className={styles.code}>请从编辑器的「预览」按钮进入（schema 经 sessionStorage 传递）。</pre>
      </div>
    );
  }

  // 运行态 driver：不注入空容器占位等编辑态元素
  const driver = createReactDriver(materials.renderer);
  const ir = evaluate(schema.componentsTree, {
    mode: 'runtime',
    scope: {},
    resolver: materials.registry,
  });
  const content = driver.renderRoot(ir);

  return (
    <div className={styles.preview}>
      <div className={styles.previewBar}>
        <span className={styles.previewTitle}>预览模式 · {String(schema.meta?.title ?? '页面')}</span>
        <button type="button" className={styles.previewClose} onClick={() => window.close()}>
          返回编辑
        </button>
      </div>
      <div className={styles.previewStage}>{content}</div>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
createRoot(container).render(<PreviewApp />);
