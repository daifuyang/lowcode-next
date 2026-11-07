import type { ComponentProps } from 'react';
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * shadcn/ui Select（Radix），触发器几何对齐引擎 setter（高 28、圆角 3、12px）。
 * 弹层挂在 body（Radix 默认 portal），不会被属性面板的 overflow 裁掉；
 * 弹层配色走 --popover 令牌（styles.css 里映射引擎色板）。
 *
 * 注意：Item 的文本必须包在 SelectItemText 里 —— Radix 靠它把「值的回显文本」
 * 注册进 itemTextMap（也用于生成原生 select 的 option）。
 */

/** Radix 约定 Item value 不能为空字符串；「默认」（= 删除属性）用这个哨兵值 */
export const SELECT_DEFAULT_VALUE = '__lc_default__';

function Select(props: ComponentProps<typeof SelectPrimitive>) {
  return <SelectPrimitive data-slot="select" {...props} />;
}

function SelectSetterTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      data-slot="select-trigger"
      className={cn(
        'border-input hover:border-muted-foreground/70 focus-visible:border-primary focus-visible:ring-ring focus-visible:ring-2 flex h-7 w-full items-center justify-between gap-1 rounded-[3px] border bg-transparent px-2 text-xs whitespace-nowrap outline-none transition-[color,box-shadow,border-color] disabled:cursor-not-allowed disabled:opacity-50',
        'data-[placeholder]:text-placeholder [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-3.5',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon strokeWidth={1.7} aria-hidden="true" />
    </SelectTrigger>
  );
}

function SelectSetterContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectContent>) {
  return (
    <SelectContent
      data-slot="select-content"
      position="popper"
      className={cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-[3px] border border-[rgba(31,56,88,0.15)] shadow-md',
        className,
      )}
      {...props}
    >
      <div className="p-0.5">{children}</div>
    </SelectContent>
  );
}

function SelectSetterItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectItem>) {
  return (
    <SelectItem
      data-slot="select-item"
      className={cn(
        'focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-[2px] py-1.5 pr-7 pl-2 text-xs outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute right-1.5 flex size-3.5 items-center justify-center">
        <SelectItemIndicator>
          <CheckIcon strokeWidth={2} aria-hidden="true" />
        </SelectItemIndicator>
      </span>
      <SelectItemText>{children}</SelectItemText>
    </SelectItem>
  );
}

export { Select, SelectSetterTrigger, SelectSetterContent, SelectSetterItem, SelectValue };
