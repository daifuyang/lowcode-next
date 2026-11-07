import type { ComponentProps } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/utils';

/**
 * shadcn/ui Slider（Radix）。样式页签「透明度」行（引擎用 Fusion Range，
 * 同款形态：细轨道 + 圆形滑块，占满左侧剩余宽度）。
 */
function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="bg-[rgba(31,56,88,0.15)] relative h-1 w-full grow overflow-hidden rounded-full"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="bg-primary absolute h-full"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="border-primary bg-background block size-3 shrink-0 rounded-full border-2 shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-ring focus-visible:ring-2"
        aria-label="透明度"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
