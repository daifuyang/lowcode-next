import { describe, expect, it } from 'vitest';
import { parsePageSchema } from '@lowcode-next/protocol';
import type { NodeSchema } from '@lowcode-next/protocol';
import { builtinMaterials, createMaterialRegistry } from '@lowcode-next/renderer';
import { landingSchema } from './landing';

/**
 * 落地页示例的守卫测试。
 *
 * 这份 schema 是手写的，最怕的两种坏法都不会在页面上报错：
 * 1. 引用了没有注册的 componentName —— 渲染成红色「未注册物料」占位；
 * 2. 物料 defaultSchema 的 componentName 写错 —— 拖一个卡片出来变成未知节点。
 * 两者都靠这里挡住。
 */

function collectIds(node: NodeSchema, output: string[] = []): string[] {
  output.push(node.id);
  for (const child of node.children ?? []) {
    if (typeof child !== 'string') collectIds(child, output);
  }
  return output;
}

function collectTypes(node: NodeSchema, output: Set<string> = new Set()): Set<string> {
  output.add(node.componentName);
  for (const child of node.children ?? []) {
    if (typeof child !== 'string') collectTypes(child, output);
  }
  return output;
}

describe('landingSchema', () => {
  it('通过协议运行时校验', () => {
    expect(() => parsePageSchema(landingSchema)).not.toThrow();
  });

  it('节点 id 全局唯一', () => {
    const ids = collectIds(landingSchema.componentsTree);
    const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicated).toEqual([]);
  });

  it('树里用到的组件都已注册', () => {
    const registry = createMaterialRegistry(builtinMaterials);
    const missing = [...collectTypes(landingSchema.componentsTree)].filter(
      (name) => !registry.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('componentsMap 覆盖树里用到的组件', () => {
    const mapped = new Set(landingSchema.componentsMap.map((item) => item.componentName));
    const unmapped = [...collectTypes(landingSchema.componentsTree)].filter(
      (name) => !mapped.has(name),
    );
    expect(unmapped).toEqual([]);
  });
});

describe('builtinMaterials', () => {
  it('componentName 无重复', () => {
    const names = builtinMaterials.map((definition) => definition.meta.componentName);
    expect(names.length).toBe(new Set(names).size);
  });

  it('每个物料的 defaultSchema 指向自己', () => {
    const mismatched = builtinMaterials
      .filter((definition) => {
        const template = definition.meta.defaultSchema as NodeSchema | undefined;
        return template ? template.componentName !== definition.meta.componentName : false;
      })
      .map((definition) => definition.meta.componentName);
    expect(mismatched).toEqual([]);
  });

  it('每个物料都分了组', () => {
    const ungrouped = builtinMaterials
      .filter((definition) => !definition.meta.group)
      .map((definition) => definition.meta.componentName);
    expect(ungrouped).toEqual([]);
  });

  it('容器物料一定注册了组件实现', () => {
    const registry = createMaterialRegistry(builtinMaterials);
    const broken = builtinMaterials
      .filter((definition) => definition.meta.configure.component.isContainer)
      .map((definition) => definition.meta.componentName)
      .filter((name) => !registry.resolve(name));
    expect(broken).toEqual([]);
  });
});
