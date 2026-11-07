/**
 * 轻提示（toast）—— **宿主（playground）层**的反馈 UI，纯 DOM、零框架，
 * React / Vue 两个 playground 共用。
 *
 * 会话类操作（保存成功等）需要一笔带过的反馈：不用 alert、不进历史栈、
 * 不持久化（toast 是瞬时的，刷新后没有意义）。同一时刻只保留一条，
 * 后来的顶掉前面的 —— 会话操作的反馈天然不需要排队。
 */

let timer: ReturnType<typeof setTimeout> | null = null;

/** 停留时长：够看清一句反馈，又不至于挡着下一轮操作 */
const DURATION = 2400;

export function showToast(text: string, duration: number = DURATION): void {
  const body = globalThis.document?.body;
  if (!body) return;
  if (timer !== null) clearTimeout(timer);
  const el = globalThis.document.createElement('div');
  el.setAttribute('role', 'status');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '28px',
    transform: 'translateX(-50%)',
    zIndex: '60',
    padding: '8px 16px',
    borderRadius: '6px',
    background: 'rgba(31, 35, 41, 0.92)',
    color: '#ffffff',
    fontSize: '12px',
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
  } satisfies Partial<CSSStyleDeclaration>);
  body.appendChild(el);
  timer = setTimeout(() => {
    timer = null;
    el.remove();
  }, duration);
}
