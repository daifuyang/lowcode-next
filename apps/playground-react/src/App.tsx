import { useCallback, useMemo, useState } from 'react';
import { Designer } from '@lowcode-next/designer-react';
import { createDocument } from '@lowcode-next/model';
import { builtinMaterials, createMaterialRegistry } from '@lowcode-next/renderer';
import { parsePageSchema, sampleSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import { landingSchema } from '@pg/schemas/landing';
import { openPreview } from '@pg/preview-route';
import styles from '@pg/shell.module.css';

/**
 * playground 编辑态宿主：把 registry / document / designer 手工接起来。
 *
 * 这里故意不做"自动装配"的封装 —— 对象图一眼可见，
 * 也顺便验证了 §2.2「所有对象由工厂创建、依赖显式注入」。
 *
 * 示例 schema、预览通路、外壳样式都在 `apps/shared`（两个 app 各写一遍没有意义）：
 * 它们与编辑器框架无关，是同一份素材。
 */

const PAGES = {
  landing: { label: '落地页示例', schema: landingSchema, padding: 0 },
  sample: { label: '最小示例', schema: sampleSchema, padding: 20 },
} satisfies Record<string, { label: string; schema: PageSchema; padding: number }>;

type PageKey = keyof typeof PAGES;

export function App() {
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
    openPreview(boot.document.toSchema());
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
