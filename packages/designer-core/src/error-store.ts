/**
 * 全局报错通道（DESIGN-v1 §12.13.x）。
 *
 * 参考 lowcode-engine 的 simulator 错误提示：把最近一次报错写入 localStorage，
 * 下次打开示例时仍在 —— 这样「保存过的内容为什么没生效」可以复现，而不是
 * 一刷新就消失。纯零框架实现：React / Vue 编辑器、宿主 session 共用同一份，
 * 且不引入任何 UI 依赖。
 */

const STORAGE_KEY = 'lowcode-next:designer-error';

export interface StoredError {
  message: string;
  /** 报错时间戳（毫秒），用于「X 前」之类的展示 */
  at: number;
}

let current: StoredError | null = null;
const listeners = new Set<() => void>();

function read(): StoredError | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredError) : null;
  } catch {
    return null;
  }
}

function persist(error: StoredError | null): void {
  try {
    if (error) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(error));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage 不可用时静默降级，不影响主流程 */
  }
}

// 模块加载即把上次持久化的报错取回：下次示例展示用（用户要求的「展示保存过的内容」）
current = read();

/** 上报一条报错：写入内存 + localStorage，并通知订阅者（顶栏通知条） */
export function reportError(message: string): void {
  current = { message, at: Date.now() };
  persist(current);
  listeners.forEach((notify) => notify());
}

/** 清除当前报错（通知条上的关闭按钮） */
export function clearError(): void {
  current = null;
  persist(null);
  listeners.forEach((notify) => notify());
}

/** 当前（含启动时从 localStorage 复原的）报错 */
export function getStoredError(): StoredError | null {
  return current;
}

/** 订阅报错变化，返回取消订阅函数 */
export function subscribeError(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}
