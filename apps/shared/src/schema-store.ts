/**
 * 页面 schema 的 localStorage 通道 —— **宿主（playground）层**的工具。
 *
 * 「保存到哪」是接入方的决策，不进 designer-core（core 只有 `session.save()`
 * 这个动作出口，调宿主注入的 `onSave`）。这里提供最常见的一种实现：
 * 按 `lowcode-next:schema:<页面 key>` 落 localStorage，启动时读回 ——
 * 刷新 / 重开示例接着上次保存的内容编辑。React / Vue 两个 playground 共用。
 */

import type { PageSchema } from '@lowcode-next/protocol';

/** schema 存储 key 前缀；完整 key = 前缀 + 页面 key（同 doc.id） */
export const SCHEMA_KEY_PREFIX = 'lowcode-next:schema:';

/** 保存一份页面 schema */
export function saveSchema(key: string, schema: PageSchema): void {
  try {
    globalThis.localStorage?.setItem(SCHEMA_KEY_PREFIX + key, JSON.stringify(schema));
  } catch {
    /* localStorage 不可用（隐私模式等）时静默降级 —— 保存失败不该打断编辑 */
  }
}

/**
 * 读回保存过的 schema；没有 / JSON 损坏 / 缺 componentsTree 都返回 null，
 * 由调用方回退到内置示例。
 */
export function loadSavedSchema(key: string): PageSchema | null {
  try {
    const raw = globalThis.localStorage?.getItem(SCHEMA_KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PageSchema;
    // 只做最低限度的形态检查：componentsTree 缺了编辑器起不来，宁可回退内置示例
    if (!parsed || typeof parsed !== 'object' || !parsed.componentsTree) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 清掉保存的 schema（「恢复内置示例」类操作用） */
export function clearSavedSchema(key: string): void {
  try {
    globalThis.localStorage?.removeItem(SCHEMA_KEY_PREFIX + key);
  } catch {
    /* 同上 */
  }
}
