import { isContainerMeta } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 空容器要不要塞占位 —— 三个条件缺一不可（照抄 lowcode-engine 的判断）。
 *
 * 从 React Driver 里抽出来的原因：Vue Driver 要一模一样的行为。两个实现各写一份
 * 判断，迟早出现「同一个空容器，React 画布有提示、Vue 画布什么都没有」——
 * 这种差异每次都要靠肉眼比对才发现。
 *
 * 第三条容易被当成废话删掉：显式写了 `style` 的容器是用户主动定义了尺寸
 * （宽高、内边距、甚至背景），此时它不会塌成 0，再塞一块灰底提示反而盖住用户的样式。
 */
export function shouldPlacePlaceholder(input: {
  meta: ComponentMeta | null;
  childCount: number;
  props: Record<string, unknown>;
}): boolean {
  if (!isContainerMeta(input.meta)) return false;
  if (input.meta?.configure.component.emptyPlaceholder === false) return false;
  if (input.childCount > 0) return false;

  const style = input.props.style;
  if (style && typeof style === 'object' && Object.keys(style).length > 0) return false;

  return true;
}
