import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import styles from './textarea.module.css';

/** shadcn/ui Textarea，尺寸令牌对齐引擎 setter（圆角 3、12px、等宽字体可选） */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-placeholder flex min-h-14 w-full rounded-[3px] border bg-transparent px-2 py-1.5 text-xs transition-[color,box-shadow,border-color] outline-none',
        'focus-visible:border-primary focus-visible:ring-ring focus-visible:ring-2',
        'hover:border-muted-foreground/70',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        styles.textarea,
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
