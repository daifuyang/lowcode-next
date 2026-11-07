/**
 * 物料装配（§12.14）。
 *
 * 接入方只交两样东西：**物料 JSON**（描述）和**组件映射**（实现）。
 * 这里负责把它们和可选的内置物料合成一个注册表 + 一张扁平组件表，
 * 并把「描述与实现不配对」的情况算出来 —— 但不抛错。
 *
 * 为什么不抛：接入别人的组件时，「少传一个实现」是常态，不是致命错误。
 * 抛错会让整个页面打不开，而实际上只有那一个组件不可用。所以改成
 * 收集成清单上报，让画布自己对那个节点渲染错误块（`UnknownNode`）。
 *
 * **两个形态共用这一份。** 编辑态与 render 态对「物料怎么合并」没有分歧，
 * 分开写迟早出现「编辑器里能拖、线上渲染不出来」。
 */

import type { ComponentMeta } from '@lowcode-next/protocol';
import { defineMaterial } from '@lowcode-next/protocol';
import type { MaterialMetaRegistry, MaterialPackage } from '@lowcode-next/materials';
import { createMetaRegistry } from '@lowcode-next/materials';
import type { ReactBindings } from '@lowcode-next/materials-react';
import { builtinReactMaterialPackage, mergeReactBindings } from '@lowcode-next/materials-react';

/** 用户物料的包 id：与内置包分开，方便单独 `unuse` */
const USER_PACKAGE_ID = 'user';

/**
 * 物料描述的入参形态。
 *
 * `unknown[]` / `Record<string, unknown>` 两个宽松分支是为 JSON import 留的：
 * `import materials from './materials.json'` 推断出的字面量类型里 `type: string`
 * 与 `PropValueType` 不相等，严格类型会让「交一份 JSON」这件事根本编译不过。
 * 真正的把关放在运行时（`defineMaterial`），报错信息比类型错误更直白。
 */
export type MaterialInput = ComponentMeta | ComponentMeta[] | unknown[] | Record<string, unknown>;

export interface MaterialConfig {
  /** 物料描述。单个对象或数组都接受 —— 只有一两个业务组件时不必套数组 */
  materials?: MaterialInput;
  /** 组件实现。key 必须与 `materials[].componentName` 一致 */
  components?: ReactBindings;
  /**
   * 是否带上 20 个内置物料，默认 **false**。
   *
   * 默认不带：接入方往往有自己的设计体系，混进一套 `Div/Heading/Button`
   * 只会让面板变乱。想要「装完立刻能拖东西」时显式打开。
   */
  includeBuiltin?: boolean;
}

export interface AssembledMaterials {
  registry: MaterialMetaRegistry;
  bindings: ReactBindings;
  /** 有描述、没实现：面板里看得到，拖进画布变成错误块 */
  missingComponents: string[];
  /** 有实现、没描述：面板里不会出现，等于没注册 */
  missingMetas: string[];
}

export function assembleMaterials(config: MaterialConfig = {}): AssembledMaterials {
  const metas = toMetaArray(config.materials);
  const components = config.components ?? {};

  const packages: MaterialPackage[] = [];
  if (config.includeBuiltin) packages.push(builtinReactMaterialPackage.meta);
  if (metas.length > 0 || Object.keys(components).length > 0) {
    packages.push({
      id: USER_PACKAGE_ID,
      title: '用户物料',
      metas,
    });
  }

  // 重名会在这里抛（同 componentName 出现在两个包）—— 那是真的冲突，必须让接入方知道
  const registry = createMetaRegistry(packages);

  const bindingPackages = [];
  if (config.includeBuiltin) bindingPackages.push(builtinReactMaterialPackage);
  if (metas.length > 0 || Object.keys(components).length > 0) {
    bindingPackages.push({
      meta: { id: USER_PACKAGE_ID, title: '用户物料', metas },
      components,
    });
  }
  const bindings = mergeReactBindings(bindingPackages);

  const metaNames = registry.list().map((meta) => meta.componentName);
  const metaNameSet = new Set(metaNames);
  const missingComponents = metaNames.filter((name) => !bindings[name]);
  const missingMetas = Object.keys(bindings).filter((name) => !metaNameSet.has(name));

  if (missingComponents.length > 0 || missingMetas.length > 0) {
    console.warn(
      '[lowcode] 物料描述与组件实现没有一一对应：',
      missingComponents.length > 0 ? { 缺实现: missingComponents } : '',
      missingMetas.length > 0 ? { 缺描述: missingMetas } : '',
    );
  }

  return { registry, bindings, missingComponents, missingMetas };
}

function toMetaArray(input: MaterialInput | undefined): ComponentMeta[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : [input];
  return raw.map((item, index) => {
    try {
      // 只查 componentName / title / configure 三项 —— 正是「缺了就跑不起来」的那些
      return defineMaterial(item as ComponentMeta);
    } catch (error) {
      const name =
        typeof (item as { componentName?: unknown })?.componentName === 'string'
          ? `（${(item as { componentName: string }).componentName}）`
          : '';
      throw new Error(
        `materials[${index}]${name} 不是合法的物料描述：${(error as Error).message}`,
      );
    }
  });
}
