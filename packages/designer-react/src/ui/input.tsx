import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

/**
 * shadcn/ui Input（new-york），尺寸令牌对齐引擎 setter：
 * 高 28（h-7）、圆角 3、12px 字号（text-xs）、聚焦品牌蓝 2px 光晕。
 * Tailwind 类在宿主 app 的 Tailwind 管线里编译（styles.css @source 扫到本包）。
 */
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input placeholder:text-placeholder flex h-7 w-full min-w-0 rounded-[3px] border bg-transparent px-2 text-xs transition-[color,box-shadow,border-color] outline-none',
        'focus-visible:border-primary focus-visible:ring-ring focus-visible:ring-2',
        'hover:border-muted-foreground/70',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
