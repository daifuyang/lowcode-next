/**
 * 物料协议。
 *
 * 属性面板（setter 表单）直接消费这份协议：面板不认识任何具体物料，
 * 只按 props 里的 type / options / defaultValue 生成控件。
 * 关键约束：isContainer 是唯一的容器判据（见 DESIGN-v1.md D4）。
 */

export type PropValueType =
  | 'string'
  | 'number'
  | 'bool'
  | 'object'
  | 'array'
  | 'func'
  | 'reactnode';

export interface SetterRefObject {
  componentName: string;
  props?: Record<string, unknown>;
}

/** 字符串简写等同于 { componentName } */
export type SetterRef = string | SetterRefObject;

export interface PropOption {
  label: string;
  value: string | number | boolean;
}

export interface PropMeta {
  title?: string;
  type?: PropValueType;
  defaultValue?: unknown;
  /**
   * 枚举取值。
   *
   * 这一条是做属性面板时补的，原因很实在：物料实现里 `pick(props.tone, TONES, ...)`
   * 的枚举是模块内常量，面板只拿到 `type: 'string'` 根本不知道合法取值。
   * 没有 options，下拉渲染不出来，只能退化成自由输入 —— 用户打错一个字，
   * 值就静默回落到物料内部默认值，面板显示的和画布渲染的对不上。
   *
   * 约定：options 必须由**实现里同一个常量数组**生成（见 propOptions），
   * 不允许手抄一份，否则迟早不同步。
   */
  options?: PropOption[];
  /** 属性分组标题，缺省归到「属性」；style 由面板单独处理，不要用它分组 */
  group?: string;
  setter?: SetterRef;
}

/** 把枚举常量数组变成 options，可选给中文 label 映射 */
export function propOptions(
  values: readonly (string | number)[],
  labels?: Record<string, string>,
): PropOption[] {
  return values.map((value) => ({
    label: labels?.[String(value)] ?? String(value),
    value,
  }));
}

export interface NestingRule {
  /** 允许作为父容器的组件名，未配置表示不限制 */
  parentWhitelist?: string[];
  /** 允许作为子节点的组件名，未配置表示不限制 */
  childWhitelist?: string[];
}

export interface ComponentConfigure {
  component: {
    /** 唯一容器判据 */
    isContainer?: boolean;
    isModal?: boolean;
    /**
     * 不在物料面板展示（§12.16）。
     *
     * 给「页面壳」这类结构性物料用：Page 必须注册（schema 根节点需要一个
     * 可渲染、可容纳的组件），但它不是拿来拖的 —— 显示在面板里只会让人
     * 往页面里再套一层页面。
     */
    hidden?: boolean;
    /**
     * 空容器占位开关，缺省开启（只对 isContainer 生效）。
     *
     * 默认开启的理由：容器没子节点时高度会塌成 0，选不中也拖不进去。
     * 但"自带内容 + 可选插槽"的区块物料（导航栏 / 首屏 / 特性卡 / 页脚）
     * 要显式关掉：它们的 children 只是补充内容，空着本身就是完整形态，
     * 塞一块"拖拽组件或模板到这里"反而盖住自己的设计。
     */
    emptyPlaceholder?: boolean;
    /** 量取边界用的根选择器，缺省用节点根元素 */
    rootSelector?: string;
    nestingRule?: NestingRule;
  };
  supports: {
    style?: boolean;
    condition?: boolean;
    loop?: boolean;
    events?: string[];
  };
}

export interface NpmMeta {
  package: string;
  version?: string;
  exportName?: string;
  subName?: string;
  destructuring?: boolean;
}

export interface ComponentMeta {
  componentName: string;
  title: string;
  group?: string;
  icon?: string;
  npm?: NpmMeta;
  props: Record<string, PropMeta>;
  configure: ComponentConfigure;
  /** 拖入画布时插入的默认节点，缺省为最小节点 */
  defaultSchema?: Record<string, unknown>;
}

/**
 * 定义物料时做一次浅校验：缺 componentName / title / configure 直接报错。
 * 更完整的校验在 M5 接物料注册表时补。
 */
export function defineMaterial(meta: ComponentMeta): ComponentMeta {
  if (!meta.componentName) {
    throw new Error('defineMaterial: 缺少 componentName');
  }
  if (!meta.title) {
    throw new Error(`defineMaterial(${meta.componentName}): 缺少 title`);
  }
  if (!meta.configure) {
    throw new Error(`defineMaterial(${meta.componentName}): 缺少 configure`);
  }
  return meta;
}

export function isContainerMeta(meta: ComponentMeta | null | undefined): boolean {
  return Boolean(meta?.configure?.component?.isContainer);
}
