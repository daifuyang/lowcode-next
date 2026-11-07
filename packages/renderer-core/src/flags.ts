import type { IRNode } from './index';

/**
 * 编辑态修饰 → `data-edit-flags` 字符串。
 *
 * 两个 Driver 都要输出同一个属性值，否则编辑器里「这条 CSS 选择器命中了哪些节点」
 * 的脚本在 React / Vue 画布上结果不同。所以它属于契约层，不属于某个 Driver。
 */
export function flagString(flags: NonNullable<IRNode['editFlags']>): string {
  const list: string[] = [];
  if (flags.hidden) list.push('hidden');
  if (flags.loop) list.push('loop');
  if (flags.conditionFalse) list.push('condition-false');
  if (flags.locked) list.push('locked');
  return list.join(' ');
}
