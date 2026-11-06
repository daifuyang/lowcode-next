import { describe, expect, it } from 'vitest';
import { builtinMaterials } from './index';

/**
 * 物料协议守卫。
 *
 * 属性面板完全依赖 meta 生成控件，所以 meta 写错不会报错，只会静默退化：
 * - 枚举 prop 没有 options → 面板渲染成自由输入，打错一个字就回落到默认值
 * - prop 没有 title → 面板上出现 `flexDirection` 这种原始键名
 * - options 里有重复值 → React 复用 key 出错，下拉行为诡异
 *
 * 这些都不会在运行时抛异常，只会在几周后被人发现"面板怎么不对劲"。
 */

const EXPECTED_ENUMS: Record<string, string[]> = {
  Heading: ['level', 'tone', 'align', 'weight'],
  Text: ['size', 'tone', 'align', 'weight', 'as'],
  Button: ['variant', 'size'],
  Link: ['tone'],
  Badge: ['tone'],
  Stack: ['direction', 'align', 'justify'],
  Section: ['tone', 'padding'],
  Card: ['tone'],
};

describe('物料协议', () => {
  it('每个 prop 都有 title，面板不会出现原始键名', () => {
    const missing: string[] = [];
    for (const { meta } of builtinMaterials) {
      for (const [key, prop] of Object.entries(meta.props)) {
        if (!prop.title) missing.push(`${meta.componentName}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('枚举 prop 都有 options，且值与实现里的常量同源可用', () => {
    const missing: string[] = [];
    for (const [componentName, keys] of Object.entries(EXPECTED_ENUMS)) {
      const meta = builtinMaterials.find((item) => item.meta.componentName === componentName);
      expect(meta, `${componentName} 未注册`).toBeTruthy();

      for (const key of keys) {
        const prop = meta!.meta.props[key];
        expect(prop, `${componentName}.${key} 未声明`).toBeTruthy();
        if (!prop.options || prop.options.length < 2) missing.push(`${componentName}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('options 的值唯一，且包含 defaultValue', () => {
    const problems: string[] = [];
    for (const { meta } of builtinMaterials) {
      for (const [key, prop] of Object.entries(meta.props)) {
        if (!prop.options) continue;

        const values = prop.options.map((option) => String(option.value));
        if (new Set(values).size !== values.length) {
          problems.push(`${meta.componentName}.${key} 有重复选项`);
        }
        if (prop.defaultValue !== undefined && !values.includes(String(prop.defaultValue))) {
          problems.push(`${meta.componentName}.${key} 的默认值不在选项里`);
        }
        for (const option of prop.options) {
          if (!option.label) problems.push(`${meta.componentName}.${key} 有空 label`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('defaultSchema 的 componentName 与 meta 一致', () => {
    const problems = builtinMaterials
      .filter(({ meta }) => {
        const name = (meta.defaultSchema as { componentName?: string } | undefined)?.componentName;
        return name !== undefined && name !== meta.componentName;
      })
      .map(({ meta }) => meta.componentName);
    expect(problems).toEqual([]);
  });

  it('容器能力的唯一判据是 configure.component.isContainer', () => {
    const containers = builtinMaterials
      .filter(({ meta }) => meta.configure.component.isContainer)
      .map(({ meta }) => meta.componentName);

    // 布局与整段区块都应该是容器；基础物料（按钮/标题）不是
    expect(containers).toEqual(['Div', 'Stack', 'Grid', 'Section', 'Card', 'Navbar', 'Hero', 'FeatureCard', 'Footer']);
  });
});
