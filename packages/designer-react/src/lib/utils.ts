import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn 的类名合并约定：clsx 组装 + tailwind-merge 去冲突 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
