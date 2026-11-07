import type { ComponentProps } from 'react';
import { Item, Root } from '@radix-ui/react-toggle-group';
import { cn } from '../lib/utils';

/**
 * shadcn/ui ToggleGroup（Radix 版）。`type="single"` 就是 radio 的按钮组变体：
 * Root 是 `role="radiogroup"`、Item 是 `role="radio"` + `aria-checked`，方向键
 * 漫游焦点（roving tabindex）；再点已选中项会把 value 置空并触发
 * `onValueChange('')` —— 与引擎 `onRadioItemClick` 提交 null 完全同款，
 * 不需要自己维护 checked 状态。
 *
 * 这里保留 shadcn 组件壳与基础 flex 排版；28px 高、#C4C6CF 边框、#5584FF
 * 选中色等 Fusion RadioButton 规格由 StyleSetter.module.css 的 .radioItem
 * 统一覆盖（项目其它 ui 控件也是这个「shadcn 壳 + 引擎几何」的做法）。
 */
function ToggleGroup({ className, ...props }: ComponentProps<typeof Root>) {
  return (
    <Root
      data-slot="toggle-group"
      className={cn('flex min-w-0 items-center', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: ComponentProps<typeof Item>) {
  return (
    <Item
      data-slot="toggle-group-item"
      className={cn('inline-flex items-center justify-center', className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
