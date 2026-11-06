import { z } from 'zod';

/**
 * 页面 schema 的类型与运行时校验。
 *
 * 设计约束（见 DESIGN-v1.md §3）：
 * - 文本内容是 children 数组里的字符串项，不使用 props.children
 * - condition / loop 是节点级渲染指令，不放进 props
 * - 所有节点必须有全局唯一 id
 */

export interface ComponentMapItem {
  componentName: string;
  package: string;
  version?: string;
  exportName?: string;
  subName?: string;
  destructuring?: boolean;
}

export interface NodeSchema {
  id: string;
  componentName: string;
  /**
   * 节点标题（大纲里显示的名字）。
   *
   * 与 lowcode 的 `NodeSchema.title` 同义：物料 meta.title 是"这类组件叫什么"，
   * 这个是"这个节点叫什么"。不设置时回落到 meta.title / componentName，
   * 渲染器不消费它，只影响编辑器。
   */
  title?: string;
  props?: Record<string, unknown>;
  children?: Array<NodeSchema | string>;
  /** 条件渲染：布尔值或 "{{ ... }}" 表达式 */
  condition?: boolean | string;
  /** 循环数据源：数组或 "{{ ... }}" 表达式 */
  loop?: unknown[] | string;
  /** 循环变量名，默认 ["item", "index"] */
  loopArgs?: [string, string];
  /** 编辑态可见、运行态不渲染 */
  hidden?: boolean;
  locked?: boolean;
  meta?: Record<string, unknown>;
}

export interface PageSchema {
  version: string;
  componentsMap: ComponentMapItem[];
  componentsTree: NodeSchema;
  /** 页面级数据源（lowcode 协议同构：`{ list: DataSourceConfig[] }`） */
  dataSource?: PageDataSource;
  meta?: Record<string, unknown>;
}

/* ---------------- 数据源（对齐 lowcode 的 DataSourceConfig） ---------------- */

export interface DataSourceOptions {
  /** fetch/jsonp 的请求地址；mock 服务可以是相对路径 */
  uri?: string;
  /** fetch 的请求方法，默认 GET */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 请求参数：fetch GET 拼到 query、POST 进 body；jsonp 作为全局回调参数 */
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** 超时毫秒数，默认 5000 */
  timeout?: number;
}

export interface DataSourceConfig {
  /** 数据源 ID：页面内唯一，表达式里用它引用 */
  id: string;
  /** 数据源类型：v1 内置 fetch（jsonp/mtop 预留） */
  type: 'fetch' | 'jsonp' | 'mtop' | string;
  description?: string;
  /** 是否自动请求：页面加载时拉一次（引擎的 isInit） */
  isInit?: boolean;
  options?: DataSourceOptions;
}

export interface PageDataSource {
  list: DataSourceConfig[];
}

export const componentMapItemSchema = z.object({
  componentName: z.string().min(1),
  package: z.string().min(1),
  version: z.string().optional(),
  exportName: z.string().optional(),
  subName: z.string().optional(),
  destructuring: z.boolean().optional(),
});

export const nodeSchema: z.ZodType<NodeSchema> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    componentName: z.string().min(1),
    title: z.string().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(z.union([nodeSchema, z.string()])).optional(),
    condition: z.union([z.boolean(), z.string()]).optional(),
    loop: z.union([z.array(z.unknown()), z.string()]).optional(),
    loopArgs: z.tuple([z.string(), z.string()]).optional(),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
);

export const dataSourceOptionsSchema = z.object({
  uri: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().optional(),
});

export const dataSourceConfigSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  isInit: z.boolean().optional(),
  options: dataSourceOptionsSchema.optional(),
});

export const pageDataSourceSchema = z.object({
  list: z.array(dataSourceConfigSchema),
});

export const pageSchema: z.ZodType<PageSchema> = z.object({
  version: z.string().min(1),
  componentsMap: z.array(componentMapItemSchema),
  componentsTree: nodeSchema,
  dataSource: pageDataSourceSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export class SchemaValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`页面 schema 校验失败:\n  - ${issues.join('\n  - ')}`);
    this.name = 'SchemaValidationError';
  }
}

/**
 * 校验并返回 schema。失败时抛出带可读路径的错误。
 */
export function parsePageSchema(input: unknown): PageSchema {
  const result = pageSchema.safeParse(input);
  if (!result.success) {
    throw new SchemaValidationError(flattenIssues(result.error.issues));
  }
  return result.data;
}

interface RawIssue {
  path: PropertyKey[];
  message: string;
  code?: string;
  /** invalid_union 时，每个分支各自产生的 issue 列表 */
  errors?: RawIssue[][];
}

/**
 * 把 zod 的嵌套 issue 摊平成可读的行。
 *
 * 关键点：children 是 union(节点, 文本)，zod 默认会报 "invalid_union"，
 * 丢失真正的字段级错误。这里挑选"最深入"的分支展开，
 * 让作者看到 componentsTree.children.0.id 而不是一句 Invalid input。
 */
function flattenIssues(issues: RawIssue[], prefix: PropertyKey[] = []): string[] {
  const lines: string[] = [];

  for (const issue of issues) {
    const path = [...prefix, ...issue.path];

    if (issue.code === 'invalid_union' && issue.errors?.length) {
      const best = pickDeepestBranch(issue.errors);
      lines.push(...flattenIssues(best, path));
      continue;
    }

    const where = path.length ? path.map(String).join('.') : '<root>';
    lines.push(`${where}: ${issue.message}`);
  }

  return lines;
}

/** 选中路径最深的分支；深度相同则选 issue 更少（更贴近真实原因）的 */
function pickDeepestBranch(branches: RawIssue[][]): RawIssue[] {
  const depth = (branch: RawIssue[]) =>
    branch.reduce((max, issue) => Math.max(max, issue.path.length), -1);

  let best = branches[0] ?? [];
  for (const branch of branches.slice(1)) {
    const d = depth(branch);
    const bd = depth(best);
    if (d > bd || (d === bd && branch.length > 0 && branch.length < best.length)) {
      best = branch;
    }
  }
  return best;
}
