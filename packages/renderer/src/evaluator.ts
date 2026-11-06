import type { NodeSchema } from '@lowcode-next/protocol';
import type { EditFlags, EvalContext, IRNode } from './index';

/**
 * 求值器（DESIGN-v1 §5.1 / §5.2）。
 *
 * 纯函数：输入 schema + 上下文，输出 IR。不含任何框架概念，可直接快照测试。
 *
 * v1 的最小实现只处理 condition / loop / hidden 的**编辑态语义**，
 * 表达式（`{{ }}`）留到 M6 之后再接 —— 那时把 resolveCondition / resolveLoop
 * 换成真正的沙箱求值即可，调用方不用改。
 */
export function evaluate(
  input: NodeSchema | Array<NodeSchema | string>,
  ctx: EvalContext,
): Array<IRNode | string> {
  const list = Array.isArray(input) ? input : [input];
  const output: Array<IRNode | string> = [];

  for (const item of list) {
    if (typeof item === 'string') {
      output.push(item);
      continue;
    }
    output.push(...evaluateNode(item, ctx));
  }

  return output;
}

function evaluateNode(schema: NodeSchema, ctx: EvalContext): IRNode[] {
  const condition = resolveCondition(schema.condition, ctx);
  if (condition === false && ctx.mode === 'runtime') return [];

  const loopItems = resolveLoop(schema.loop, ctx);

  // 运行态：循环展开成 N 份
  if (loopItems && ctx.mode === 'runtime') {
    return loopItems.map((item, index) =>
      buildNode(schema, ctx, {
        keySuffix: `-${index}`,
        scopePatch: loopScope(schema, item, index),
      }),
    );
  }

  // 编辑态：一个节点只对应一个 DOM（D7），循环节点只渲染一次
  return [
    buildNode(schema, ctx, {
      keySuffix: '',
      editFlags: {
        hidden: schema.hidden,
        loop: Boolean(loopItems),
        conditionFalse: condition === false,
        locked: schema.locked,
      },
    }),
  ];
}

interface BuildOptions {
  keySuffix: string;
  scopePatch?: Record<string, unknown>;
  editFlags?: EditFlags;
}

function buildNode(schema: NodeSchema, ctx: EvalContext, options: BuildOptions): IRNode {
  const childContext = options.scopePatch
    ? { ...ctx, scope: { ...ctx.scope, ...options.scopePatch } }
    : ctx;

  const children: Array<IRNode | string> = [];
  for (const child of schema.children ?? []) {
    if (typeof child === 'string') {
      children.push(child);
      continue;
    }
    children.push(...evaluateNode(child, childContext));
  }

  const node: IRNode = {
    id: schema.id,
    key: `${schema.id}${options.keySuffix}`,
    type: schema.componentName,
    props: { ...(schema.props ?? {}) },
    children,
  };

  if (options.editFlags && Object.values(options.editFlags).some(Boolean)) {
    node.editFlags = options.editFlags;
  }

  return node;
}

function resolveCondition(condition: NodeSchema['condition'], ctx: EvalContext): boolean {
  if (condition === undefined) return true;
  if (typeof condition === 'boolean') return condition;

  // TODO(M6): 接入表达式沙箱（new Function + 白名单作用域）
  return Boolean(expressionPlaceholder(condition, ctx));
}

function resolveLoop(loop: NodeSchema['loop'], ctx: EvalContext): unknown[] | null {
  if (loop === undefined) return null;
  if (Array.isArray(loop)) return loop;

  // TODO(M6): 同上
  const value = expressionPlaceholder(loop, ctx);
  return Array.isArray(value) ? value : null;
}

/** 表达式尚未接入时的占位：不抛错，返回 undefined 让调用方走默认分支 */
function expressionPlaceholder(_raw: string, _ctx: EvalContext): unknown {
  return undefined;
}

function loopScope(
  schema: NodeSchema,
  item: unknown,
  index: number,
): Record<string, unknown> {
  const [itemName, indexName] = schema.loopArgs ?? ['item', 'index'];
  return { [itemName]: item, [indexName]: index };
}
