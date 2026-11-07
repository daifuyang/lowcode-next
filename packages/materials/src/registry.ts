import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 物料注册表（DESIGN-v1 §12.4）。
 *
 * 只装**描述**，不装实现。上一版把 `{ meta, component }` 绑成一个
 * `MaterialDefinition` 塞进 `@lowcode-next/renderer`，后果是 renderer 的
 * dependencies 里必须写 `react`，Vue 版编辑器只能 `import type` 它 ——
 * 类型方向是错的，`resolve()` 在 Vue 侧永远拿不到能用的东西。
 *
 * 现在切成三层：
 *   protocol  ←  本包（只有 ComponentMeta）  ←  materials-react / materials-vue
 *
 * 「多物料包」靠 `use()` 的**包**粒度表达，不是散装 register：业务方把自己的
 * 物料打成一个包，装上/摘掉都是整包操作，不用记清单。
 *
 * 与 lowcode-engine 的对照（§12.4 记录）：
 * - 引擎用两张表（`_componentMetasMap` + `_lostComponentMetasMap`）支持「物料晚到」。
 *   这里用「查不到就返回 null + 兜底块」代替失落表 —— 兜底块本身就把问题暴露给
 *   使用者了，比静默占位更直接；物料晚到时装上包，`version` 变化触发重渲染。
 * - 引擎同名注册是就地 `setMetadata`（引用不变、内容变）。这里**不**这么做：
 *   meta 是不可变描述，换一份就换引用，靠 version + 订阅通知。原因是就地改会让
 *   `useMemo` / `computed` 的依赖判断失效 —— 属性面板拿到同一个 meta 引用，不重算。
 */

/** 一个物料包 —— 「随时加入不同的包」的最小单位 */
export interface MaterialPackage {
  /**
   * 包标识，卸载时用它定位。约定用包名（`@lowcode-next/materials` / `acme-blocks`），
   * 不强制格式，但必须全局唯一。
   */
  id: string;
  /** 人类可读名，报错与诊断用 */
  title?: string;
  version?: string;
  metas: ComponentMeta[];
}

export interface UsePackageOptions {
  /**
   * 重名时覆盖已有物料，默认 `false`（抛错）。
   *
   * 默认抛错的理由：业务包想换掉内置 Button 是合理需求，但「装上了却没生效」
   * 是排查成本极高的静默失败 —— 必须由调用方显式声明意图。
   */
  override?: boolean;
}

interface Entry {
  meta: ComponentMeta;
  packageId: string;
}

export class MaterialMetaRegistry {
  private readonly packages = new Map<string, MaterialPackage>();

  /** componentName → 条目。用一个 Map 而不是遍历包，`getMeta` 在渲染热路径上 */
  private readonly entries = new Map<string, Entry>();

  private readonly listeners = new Set<() => void>();
  private version = 0;

  /**
   * 装上（或替换）一整个物料包。
   *
   * 包内自身重名、或与已装包重名且未声明 `override`，一律抛错并列出冲突的
   * componentName 与来源包 —— 装配期就把问题喊出来，别等到用户拖进去白屏。
   */
  use(pkg: MaterialPackage, options: UsePackageOptions = {}): this {
    const conflict = this.collectConflicts(pkg, options.override === true);
    if (conflict.length > 0) {
      throw new Error(
        `物料包「${pkg.id}」与已装包冲突：${conflict.join('、')}。` +
          `如需有意覆盖，传入 { override: true }。`,
      );
    }

    // 同 id 再装一次 = 替换该包：先摘掉旧包，避免残留已删除的物料
    if (this.packages.has(pkg.id)) this.unuse(pkg.id);

    this.packages.set(pkg.id, pkg);
    for (const meta of pkg.metas) {
      this.entries.set(meta.componentName, { meta, packageId: pkg.id });
    }
    this.emit();
    return this;
  }

  useAll(packages: MaterialPackage[], options: UsePackageOptions = {}): this {
    for (const pkg of packages) this.use(pkg, options);
    return this;
  }

  /** 整包摘除。返回是否真的摘掉了 */
  unuse(packageId: string): boolean {
    const pkg = this.packages.get(packageId);
    if (!pkg) return false;

    this.packages.delete(packageId);
    for (const meta of pkg.metas) {
      // 只删仍属于该包的条目：`override` 之后同名条目可能已归属别的包
      if (this.entries.get(meta.componentName)?.packageId === packageId) {
        this.entries.delete(meta.componentName);
      }
    }
    this.emit();
    return true;
  }

  has(componentName: string): boolean {
    return this.entries.has(componentName);
  }

  getMeta(componentName: string): ComponentMeta | null {
    return this.entries.get(componentName)?.meta ?? null;
  }

  /** 展示顺序 = 包注册顺序 + 包内声明顺序（物料面板直接照这个画） */
  list(): ComponentMeta[] {
    const output: ComponentMeta[] = [];
    for (const pkg of this.packages.values()) {
      for (const meta of pkg.metas) {
        // 被 override 掉的旧 meta 不再重复列出
        if (this.entries.get(meta.componentName)?.meta === meta) output.push(meta);
      }
    }
    return output;
  }

  /** 已装的包（诊断 / 插件管理界面用） */
  listPackages(): MaterialPackage[] {
    return [...this.packages.values()];
  }

  /** 某个物料来自哪个包 —— 卸载与「这是谁的组件」提示都用得上 */
  packageOf(componentName: string): string | null {
    return this.entries.get(componentName)?.packageId ?? null;
  }

  /* ---------------------------------------------------------------- */
  /* 变更订阅（对齐 SetterRegistry 的 version + subscribe）            */
  /* ---------------------------------------------------------------- */

  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  private collectConflicts(pkg: MaterialPackage, override: boolean): string[] {
    const conflicts: string[] = [];
    const seen = new Set<string>();

    for (const meta of pkg.metas) {
      const name = meta.componentName;

      // 包内自身重名：无论 override 与否都是作者的错
      if (seen.has(name)) {
        conflicts.push(`${name}（包内重复声明）`);
        continue;
      }
      seen.add(name);

      const existing = this.entries.get(name);
      if (existing && !override) {
        conflicts.push(`${name}（已被「${existing.packageId}」占用）`);
      }
    }

    return conflicts;
  }
}

export function createMetaRegistry(packages: MaterialPackage[] = []): MaterialMetaRegistry {
  return new MaterialMetaRegistry().useAll(packages);
}

/**
 * 从包里按 componentName 筛出一个子包。
 *
 * Vue 侧先只实现 3 个物料时用它 —— 面板上只出现**真能渲染**的那几个。
 * 另一种做法是「面板照旧 20 个、没实现的渲染兜底块」，那会让编辑器看起来完整、
 * 实际一拖就废，比少几个物料难查得多。
 */
export function subsetPackage(
  pkg: MaterialPackage,
  componentNames: readonly string[],
  id: string,
): MaterialPackage {
  const keep = new Set(componentNames);
  return {
    ...pkg,
    id,
    metas: pkg.metas.filter((meta) => keep.has(meta.componentName)),
  };
}

/**
 * 装配期全量校验（DESIGN-v1 §12.4）。
 *
 * 缺一个实现不会在运行时抛异常 —— 画布只会渲染出「未注册物料」兜底块，用户拖进去
 * 才发现白屏。所以必须在装配时把差集喊出来：
 *
 * - meta 有、实现没有 → 渲染会白（该包漏实现）
 * - 实现有、meta 没有 → 面板里永远看不到（该包多写了）
 *
 * 两个视图层的绑定包都调它，保证「描述集合」与「实现集合」恒等。
 */
export function assertMetaBindings(
  metas: ComponentMeta[],
  bindingNames: readonly string[],
  flavor: string,
): void {
  const metaNames = new Set(metas.map((meta) => meta.componentName));
  const bound = new Set(bindingNames);

  const missing = [...metaNames].filter((name) => !bound.has(name));
  const extra = [...bound].filter((name) => !metaNames.has(name));

  if (missing.length === 0 && extra.length === 0) return;

  const parts: string[] = [];
  if (missing.length > 0) parts.push(`缺少实现：${missing.join('、')}`);
  if (extra.length > 0) parts.push(`多出实现（meta 里没有）：${extra.join('、')}`);
  throw new Error(`${flavor} 物料绑定不完整 —— ${parts.join('；')}`);
}
