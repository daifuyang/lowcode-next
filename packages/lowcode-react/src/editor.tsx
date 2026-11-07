import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Designer } from '@lowcode-next/designer-react';
import type { DocumentImpl } from '@lowcode-next/model';
import { createDocument } from '@lowcode-next/model';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import { FatalScreen, assembleMaterials } from '@lowcode-next/render-react';
import type { AssembledMaterials, MaterialConfig } from '@lowcode-next/render-react';
import { CanvasSurface } from './canvas';

/**
 * 编辑态入口（§12.14）。
 *
 * 目标只有一个：**接入方写的东西里不出现管道**。装配注册表、造 document、
 * 建 iframe 文档、把画布 Portal 进去、错误兜底，全在这一层做完。
 *
 * ```tsx
 * import '@lowcode-next/lowcode-react';
 * import { createEditor } from '@lowcode-next/lowcode-react';
 * import materials from './materials.json';
 * import page from './page.json';
 * import { StatCard } from './StatCard';
 *
 * const editor = createEditor('#root', {
 *   schema: page,
 *   materials,
 *   components: { StatCard },
 * });
 * ```
 *
 * 命名对齐 lowcode 的工厂规范（`createXxx`，见 §12.14）：返回一个 handle，
 * 而不是像 lowcode 的 `init()` 那样依赖模块级单例 —— 一个页面可以同时开多个编辑器。
 */

export interface CreateEditorOptions extends MaterialConfig {
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
  /**
   * 文档 id，默认 'doc'。同时是「保存」写 localStorage 的 key
   * （`lowcode-next:schema:<documentId>`）—— 一个宿主里放多个编辑器时
   * 给不同的 id，保存互不覆盖；playground 启动时用同名 key 读回保存的 schema。
   */
  documentId?: string;
  /** 每次文档提交后回调（可用于自动保存） */
  onSchemaChange?: (schema: PageSchema) => void;
  /**
   * 保存出口：保存按钮 / Ctrl+S 时收到当前 schema。存到哪（localStorage /
   * 落库 / 下载）是宿主的事；没传时保存按钮静默 no-op。
   */
  onSave?: (schema: PageSchema) => void;
  /**
   * 「预览」按钮的回调。不传则按钮置灰。
   *
   * 预览的**能力**在 render 态（`@lowcode-next/render-react`），这里只留一个
   * 触发点 —— 「怎么打开」是宿主的决定：同窗口弹层、新窗口加载 `render.html`、
   * 路由跳转都行。Playground 用的是「序列化快照 + 独立入口」，见 §12.14.5。
   */
  onPreview?: () => void;
}

export interface EditorHandle {
  destroy(): void;
  /** 当前页面快照（可直接 JSON.stringify 存盘） */
  getSchema(): PageSchema;
  /** 文档实例，需要精确操作（外层工具栏、自定义保存）时用 */
  getDocument(): DocumentImpl;
}

/** 同一容器重复挂载时先卸旧的，否则 React 会警告"已有 root" */
const mountedRoots = new WeakMap<HTMLElement, Root>();

export function createEditor(
  container: string | HTMLElement,
  options: CreateEditorOptions,
): EditorHandle {
  const host = resolveContainer(container);

  const previous = mountedRoots.get(host);
  if (previous) previous.unmount();

  const root = createRoot(host);
  mountedRoots.set(host, root);

  const fail = (title: string, error?: unknown): EditorHandle => {
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

  let assembled: AssembledMaterials;
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

  const document = createDocument(parsed, assembled.registry, options.documentId);

  root.render(
    <EditorView
      document={document}
      materials={assembled}
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
  materials: AssembledMaterials;
  options: CreateEditorOptions;
}

function EditorView({ document, materials, options }: EditorViewProps) {
  return (
    <Designer
      document={document}
      registry={materials.registry}
      canvasPadding={options.canvasPadding ?? 20}
      onSchemaChange={options.onSchemaChange}
      onSave={options.onSave}
      onPreview={options.onPreview}
      // 画布内容：同一棵 React tree 的另一个 DOM 落点（Designer 内部 portal 到 iframe）
      renderCanvas={(padding) => (
        <CanvasSurface
          document={document}
          materials={materials}
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
  if (!el) throw new Error(`createEditor: 找不到挂载点「${container}」`);
  return el;
}
