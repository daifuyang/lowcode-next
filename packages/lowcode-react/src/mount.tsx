import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Designer } from '@lowcode-next/designer-react';
import type { DocumentImpl } from '@lowcode-next/model';
import { createDocument } from '@lowcode-next/model';
import type { MaterialMetaRegistry } from '@lowcode-next/materials';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import type { ReactBindings } from '@lowcode-next/materials-react';
import { CanvasSurface } from './canvas';
import { assembleMaterials } from './assemble';
import type { MaterialConfig } from './assemble';
import { FatalScreen } from './fatal-screen';

/**
 * 零配置入口（§12.14）。
 *
 * 目标只有一个：**接入方写的东西里不出现管道**。装配注册表、造 document、
 * 建 iframe 文档、把画布 Portal 进去、错误兜底，全在这一层做完。
 *
 * ```tsx
 * import '@lowcode-next/lowcode-react/styles.css';
 * import { mountEditor } from '@lowcode-next/lowcode-react';
 * import materials from './materials.json';
 * import page from './page.json';
 * import { StatCard } from './StatCard';
 *
 * mountEditor({
 *   container: '#root',
 *   schema: page,
 *   materials,
 *   components: { StatCard },
 * });
 * ```
 */

export interface MountEditorOptions extends MaterialConfig {
  /** 挂载点：CSS 选择器或元素本身 */
  container: string | HTMLElement;
  /**
   * 初始页面。必填 —— 不给默认空页，避免「打开是白板」还以为坏了。
   *
   * 接受 `import page from './page.json'` 的原样对象：JSON 推断出的字面量类型
   * 与 `PageSchema` 不会完全相等，而运行时本来就要过 `parsePageSchema` 校验。
   * 想要编辑期类型提示，在 JSON 之外再 `satisfies PageSchema` 一份即可。
   */
  schema: PageSchema | Record<string, unknown>;
  /** 画布内边距，默认 20；整幅落地页设 0 */
  canvasPadding?: number;
  /** 每次文档提交后回调（可用于自动保存） */
  onSchemaChange?: (schema: PageSchema) => void;
  /** 「预览」按钮的回调。不传则按钮置灰 —— 预览入口由接入方决定 */
  onPreview?: () => void;
}

export interface LowcodeEditorHandle {
  destroy(): void;
  /** 当前页面快照（可直接 JSON.stringify 存盘） */
  getSchema(): PageSchema;
  /** 文档实例，需要精确操作（外层工具栏、自定义保存）时用 */
  getDocument(): DocumentImpl;
}

/** 同一容器重复挂载时先卸旧的，否则 React 会警告"已有 root" */
const mountedRoots = new WeakMap<HTMLElement, Root>();

export function mountEditor(options: MountEditorOptions): LowcodeEditorHandle {
  const host = resolveContainer(options.container);

  const previous = mountedRoots.get(host);
  if (previous) previous.unmount();

  const root = createRoot(host);
  mountedRoots.set(host, root);

  const fail = (title: string, error?: unknown): LowcodeEditorHandle => {
    if (error !== undefined) console.error(`[lowcode] ${title}`, error);
    root.render(
      <FatalScreen
        title={title}
        detail={error instanceof Error ? `${error.name}: ${error.message}` : undefined}
      />,
    );
    return {
      destroy: () => {
        root.unmount();
        mountedRoots.delete(host);
      },
      getSchema: () => options.schema as PageSchema,
      getDocument: () => {
        throw new Error('编辑器未能启动，没有可用的文档实例');
      },
    };
  };

  let assembled;
  try {
    assembled = assembleMaterials(options);
  } catch (error) {
    return fail('物料装配失败', error);
  }

  let parsed: PageSchema;
  try {
    parsed = parsePageSchema(options.schema);
  } catch (error) {
    return fail('页面 JSON 解析失败', error);
  }

  const document = createDocument(parsed, assembled.registry);

  root.render(
    <EditorView
      document={document}
      registry={assembled.registry}
      bindings={assembled.bindings}
      options={options}
    />,
  );

  return {
    destroy: () => {
      root.unmount();
      mountedRoots.delete(host);
    },
    getSchema: () => document.toSchema(),
    getDocument: () => document,
  };
}

/* ------------------------------------------------------------------ */

interface EditorViewProps {
  document: DocumentImpl;
  registry: MaterialMetaRegistry;
  bindings: ReactBindings;
  options: MountEditorOptions;
}

function EditorView({ document, registry, bindings, options }: EditorViewProps) {
  return (
    <Designer
      document={document}
      registry={registry}
      canvasPadding={options.canvasPadding ?? 20}
      onSchemaChange={options.onSchemaChange}
      onPreview={options.onPreview}
      // 画布内容：同一棵 React tree 的另一个 DOM 落点（Designer 内部 portal 到 iframe）
      renderCanvas={(padding) => (
        <CanvasSurface
          document={document}
          registry={registry}
          bindings={bindings}
          padding={padding}
          mode="edit"
        />
      )}
    />
  );
}

function resolveContainer(container: string | HTMLElement): HTMLElement {
  if (typeof container !== 'string') return container;
  const el = globalThis.document.querySelector<HTMLElement>(container);
  if (!el) throw new Error(`mountEditor: 找不到挂载点「${container}」`);
  return el;
}
