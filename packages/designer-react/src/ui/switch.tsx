import type { ComponentProps } from 'react';
import { Switch as SwitchPrimitive, SwitchThumb } from '@radix-ui/react-switch';
import { cn } from '../lib/utils';

/**
 * shadcn/ui Switch（Radix），几何对齐原 setter：轨道 34×19、旋钮 15。
 * checked / unchecked 底色由主题令牌给出（primary = 引擎品牌蓝）。
 */
function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive>) {
  return (
    <SwitchPrimitive
      data-slot="switch"
      className={cn(
        'peer focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 inline-flex h-[19px] w-[34px] shrink-0 items-center rounded-full border border-transparent transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-[rgba(31,56,88,0.2)]',
        className,
      )}
      {...props}
    >
      <SwitchThumb
        data-slot="switch-thumb"
        className={cn(
          'bg-background pointer-events-none block size-[15px] rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-[2px]',
        )}
      />
    </SwitchPrimitive>
  );
}

export { Switch };
