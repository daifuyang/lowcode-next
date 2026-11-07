import { registerSetter } from '@lowcode-next/designer-react';
import type { SetterContext } from '@lowcode-next/designer-react';

/**
 * 演示用 setter —— **不是库代码**，只为验证 §12.12.6 的注册通路。
 *
 * 它覆盖内置 `textarea`：同一个 kind、同一个 schema，属性面板换成一个带字数统计
 * 的多行输入。`FeatureCard.desc` 与 `CodeBlock.code` 都声明了
 * `setter: 'TextAreaSetter'`（归一后就是 `textarea`），所以选中它们即可看到替换。
 *
 * 关键点：**没有改一行物料代码、没有迁移 schema、没有重启编辑器**。
 * 注册发生在编辑器已经跑起来之后（见 `main.tsx` 里的动态 import），
 * 属性面板通过注册表的版本号订阅立刻刷新。
 */
function CountingTextArea({ value, placeholder, onCommit }: SetterContext) {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);

  return (
    <div className="rounded-md border border-input bg-transparent">
      <textarea
        className="block w-full resize-y bg-transparent px-2 py-1.5 text-xs leading-5 outline-none"
        rows={3}
        spellCheck={false}
        value={text}
        placeholder={placeholder ?? '输入内容'}
        onChange={(event) => {
          // 空串 = 删除该属性、回落物料默认值（与内置控件同一约定）
          onCommit(event.target.value === '' ? undefined : event.target.value);
        }}
      />
      <div className="flex items-center justify-between border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
        <span>demo setter · 覆盖 textarea</span>
        <span>{text.length} 字</span>
      </div>
    </div>
  );
}

/** 由 `main.tsx` 在 `?setter=demo` 时调用（动态 import → 模拟「编辑中加载」） */
export function registerDemoSetters(): void {
  registerSetter('textarea', {
    component: CountingTextArea,
    title: '演示：带字数统计的多行文本',
  });
}
