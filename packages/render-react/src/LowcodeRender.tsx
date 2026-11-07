import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { PageSchema } from '@lowcode-next/protocol';
import { assembleMaterials } from './assemble';
import type { MaterialConfig } from './assemble';
import { FatalScreen } from './fatal-screen';
import { renderTree } from './render-tree';

/**
 * render 态（§12.14）。
 *
 * 这是**组件**而不是 `mountXxx` 函数，因为它的使用者是消费端：一个已经跑起来的
 * React 应用，要把页面嵌进路由 / Provider / 弹窗里。声明式才组合得起来 ——
 * 函数式会强制接管一块 DOM，那是编辑器才有的需求。
 *
 * ```tsx
 * <Route path="/p/:id" element={
 *   <LowcodeRender schema={page} materials={materials} components={components} />
 * } />
 * ```
 *
 * 与编辑态共用 `assembleMaterials` + `renderTree` 内核，所以「编辑器里看到什么、
 * 线上就渲染什么」是结构保证的，不靠人记得同步。
 *
 * **materials / components 请传稳定引用**（模块级常量或 `useMemo`）。写成内联
 * 字面量会让每次重渲染都重新装配一遍注册表。
 */

type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface LowcodeRenderProps extends MaterialConfig {
  /** 页面 schema。接受 `import page from './page.json'` 的原样对象 */
  schema: PageSchema | Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
}

export function LowcodeRender({
  schema,
  materials,
  components,
  includeBuiltin,
  className,
  style,
}: LowcodeRenderProps): ReactNode {
  // 装配与解析都可能抛：前者是物料包抢名，后者是 JSON 非法。
  // 都不该让宿主的整页白屏，所以在这里转成错误块 —— 但只替换本组件这一块。
  const assembled = useMemo<Attempt<ReturnType<typeof assembleMaterials>>>(
    () => attempt(() => assembleMaterials({ materials, components, includeBuiltin })),
    [materials, components, includeBuiltin],
  );

  const parsed = useMemo<Attempt<PageSchema>>(
    () => attempt(() => parsePageSchema(schema)),
    [schema],
  );

  if (!assembled.ok) {
    return <FatalScreen title="物料装配失败" detail={describe(assembled.error)} />;
  }
  if (!parsed.ok) {
    return <FatalScreen title="页面配置解析失败" detail={describe(parsed.error)} />;
  }

  return (
    <div className={className} style={style} data-lc-render="">
      {renderTree(parsed.value.componentsTree, {
        registry: assembled.value.registry,
        bindings: assembled.value.bindings,
        mode: 'runtime',
      })}
    </div>
  );
}

function attempt<T>(fn: () => T): Attempt<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
