import type { ComponentType } from 'react';
import type { ComponentMeta } from '@lowcode-next/protocol';
import type { MaterialResolver } from './index';

export interface MaterialDefinition {
  meta: ComponentMeta;
  component: ComponentType<Record<string, unknown>>;
}

/**
 * 物料注册表（DESIGN-v1 §5.1）。
 *
 * 同时实现 renderer 的 MaterialResolver 与 model 需要的 getMeta 子集，
 * 一个实例可以同时注入 Document 和 Driver。
 */
export class MaterialRegistry implements MaterialResolver {
  private readonly definitions = new Map<string, MaterialDefinition>();

  register(definition: MaterialDefinition): this {
    this.definitions.set(definition.meta.componentName, definition);
    return this;
  }

  registerAll(definitions: MaterialDefinition[]): this {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  get(componentName: string): MaterialDefinition | null {
    return this.definitions.get(componentName) ?? null;
  }

  getMeta(componentName: string): ComponentMeta | null {
    return this.definitions.get(componentName)?.meta ?? null;
  }

  has(componentName: string): boolean {
    return this.definitions.has(componentName);
  }

  resolve(componentName: string): ComponentType<Record<string, unknown>> | null {
    return this.definitions.get(componentName)?.component ?? null;
  }

  list(): MaterialDefinition[] {
    return [...this.definitions.values()];
  }
}

export function createMaterialRegistry(
  definitions: MaterialDefinition[] = [],
): MaterialRegistry {
  return new MaterialRegistry().registerAll(definitions);
}
