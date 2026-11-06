import { useCallback, useMemo, useState } from 'react';
import { Designer } from '@lowcode-next/designer';
import { createDocument } from '@lowcode-next/model';
import { builtinMaterials, createMaterialRegistry, createReactDriver, evaluate } from '@lowcode-next/renderer';
import { parsePageSchema, sampleSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import { landingSchema } from './schemas/landing';
import styles from './App.module.css';

/**
 * playground：把 registry / document / designer 手工接起来。
 *
 * 这里故意不做"自动装配"的封装 —— 对象图一眼可见，
 * 也顺便验证了 §2.2「所有对象由工厂创建、依赖显式注入」。
 */

const PAGES = {
  landing: { label: '落地页示例', schema: landingSchema, padding: 0 },
  sample: { label: '最小示例', schema: sampleSchema, padding: 20 },
} satisfies Record<string, { label: string; schema: PageSchema; padding: number }>;

type PageKey = keyof typeof PAGES;

/** 预览窗口通过 sessionStorage 拿 schema（同源新窗口共享） */
const PREVIEW_KEY = 'lowcode-next:preview-schema';

function isPreviewWindow(): boolean {
  try {
    return new URLSearchParams(globalThis.location.search).has('preview');
  } catch {
    return false;
  }
}

/**
 * 预览窗口：运行态渲染（无编辑态占位、无 designer 外壳），
 * 对应引擎 demo 的 preview.html —— 「预览」按钮 window.open 出来的页面。
 */
function PreviewApp() {
  const [registry] = useState(() => createMaterialRegistry(builtinMaterials));
  const schema = useMemo<PageSchema | null>(() => {
    try {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      return raw ? parsePageSchema(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }, [registry]);

  if (!schema) {
    return (
      <div className={styles.fatal}>
        <p className={styles.fatalTitle}>预览数据不存在</p>
        <pre className={styles.code}>请从编辑器的「预览」按钮进入（schema 经 sessionStorage 传递）。</pre>
      </div>
    );
  }

  // 运行态 driver：不注入空容器占位等编辑态元素
  const driver = createReactDriver(registry);
  const ir = evaluate(schema.componentsTree, { mode: 'runtime', scope: {}, resolver: registry });
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

export function App() {
  if (isPreviewWindow()) {
    return <PreviewApp />;
  }

  return <EditorApp />;
}

function EditorApp() {
  const [registry] = useState(() => createMaterialRegistry(builtinMaterials));
  // 页面切换走 URL（?page=sample）—— 顶栏左区按引擎只放 logo，不放演示控件
  const [page] = useState<PageKey>(() => {
    try {
      const key = new URLSearchParams(globalThis.location.search).get('page');
      return key && key in PAGES ? (key as PageKey) : 'landing';
    } catch {
      return 'landing';
    }
  });
  const boot = useMemo(() => {
    const current = PAGES[page];
    try {
      const schema = parsePageSchema(current.schema);
      return { ok: true as const, document: createDocument(schema, registry, page) };
    } catch (error) {
      return { ok: false as const, message: (error as Error).message };
    }
    // page 变化 → 全新 document 实例（历史栈一起清空）
  }, [page, registry]);

  const handlePreview = useCallback(() => {
    if (!boot.ok) return;
    try {
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(boot.document.toSchema()));
    } catch {
      return;
    }
    window.open(`${globalThis.location.pathname}?preview=1`, '_blank');
  }, [boot]);

  if (!boot.ok) {
    return (
      <div className={styles.fatal}>
        <p className={styles.fatalTitle}>schema 校验失败</p>
        <pre className={styles.code}>{boot.message}</pre>
      </div>
    );
  }

  return (
    <Designer
      key={page}
      document={boot.document}
      registry={registry}
      canvasPadding={PAGES[page].padding}
      onPreview={handlePreview}
    />
  );
}
