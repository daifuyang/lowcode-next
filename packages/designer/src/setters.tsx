import { useEffect, useRef, useState } from 'react';
import type { PropOption } from '@lowcode-next/protocol';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import {
  SELECT_DEFAULT_VALUE,
  Select,
  SelectSetterContent,
  SelectSetterItem,
  SelectSetterTrigger,
} from './ui/select';
import styles from './setters.module.css';

/**
 * 属性面板的控件集合（shadcn/ui 版，DESIGN-v1 §7.13）。
 *
 * 控件壳交给 shadcn（Input / Textarea / Switch / Select，Radix 原语 +
 * Tailwind 类），这一层只做三件事：
 * - 把 DOM 事件翻译成"提交一个值"，不碰文档；
 * - `undefined` 约定：表示**删除该属性**、回落物料默认值，而不是"设成空"；
 * - 守住两个受控输入的坑：中文输入法 composition、整树重渲染的回流同步。
 */

export interface SetterProps {
  value: unknown;
  options?: PropOption[];
  placeholder?: string;
  multiline?: boolean;
  onCommit: (value: unknown) => void;
}

/* ------------------------------------------------------------------ */
/* 文本                                                               */
/* ------------------------------------------------------------------ */

/**
 * 受控文本输入。
 *
 * 两个坑必须在这里挡掉：
 * 1. **中文输入法**：composition 期间每个拼音字母都会触发 change，
 *    直接提交会把「zhong」写进 schema，输入法自己的候选框也会被打断。
 *    所以 composition 期间只更新本地草稿，compositionend 才提交。
 * 2. **整树重渲染**：Designer 每次提交都整树 render，`value` 会回流。
 *    聚焦时不能用外部值覆盖草稿，否则光标位置会跳。
 */
export function TextSetter({ value, placeholder, multiline, onCommit }: SetterProps) {
  const external = typeof value === 'string' ? value : value == null ? '' : String(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);
  const composing = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const commit = (next: string) => {
    onCommit(next === '' ? undefined : next);
  };

  const shared = {
    value: draft,
    placeholder,
    spellCheck: false,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      // 聚焦期间错过了外部变更，失焦时补同步
      setDraft(external);
    },
    onChange: (event: { target: { value: string } }) => {
      const next = event.target.value;
      setDraft(next);
      if (!composing.current) commit(next);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (event: { currentTarget: { value: string } }) => {
      composing.current = false;
      commit(event.currentTarget.value);
    },
  };

  return multiline ? <Textarea rows={3} {...shared} /> : <Input type="text" {...shared} />;
}

/* ------------------------------------------------------------------ */
/* 数字                                                               */
/* ------------------------------------------------------------------ */

export function NumberSetter({ value, placeholder, onCommit }: SetterProps) {
  const external = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder ?? '默认'}
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(external);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next.trim() === '') {
          onCommit(undefined);
          return;
        }
        const parsed = Number(next);
        // 只提交能解析的数字：输入到一半的 "-" "." 不要写进 schema
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 布尔                                                               */
/* ------------------------------------------------------------------ */

export function BoolSetter({ value, onCommit }: SetterProps) {
  const checked = value === true || value === 'true';
  return (
    <Switch
      checked={checked}
      onCheckedChange={(next) => onCommit(next)}
      aria-label="布尔开关"
    />
  );
}

/* ------------------------------------------------------------------ */
/* 枚举                                                               */
/* ------------------------------------------------------------------ */

export function SelectSetter({ value, options = [], onCommit }: SetterProps) {
  const current = value === undefined || value === null ? '' : String(value);
  // Radix 的 Item value 不能是空串；「默认」（= 删除属性）走哨兵值
  const selected = current === '' ? SELECT_DEFAULT_VALUE : current;
  // 触发器回显由受控值直接算出来：Radix 的 SelectValue 依赖 ItemText 注册表，
  // 首次打开前注册表是空的，会显示空白 —— 自己算文本永远可靠
  const label =
    current === ''
      ? '默认'
      : (options.find((option) => String(option.value) === current)?.label ?? current);

  return (
    <Select
      value={selected}
      onValueChange={(next) => {
        if (next === SELECT_DEFAULT_VALUE) {
          onCommit(undefined);
          return;
        }
        // 回填时必须还原原始类型：Heading 的 level 是 number，
        // 一律当字符串提交会让 pick/num 判定失败
        const matched = options.find((option) => String(option.value) === next);
        onCommit(matched ? matched.value : next);
      }}
    >
      <SelectSetterTrigger aria-label={`枚举选择，当前 ${label}`}>
        <span className="truncate">{label}</span>
      </SelectSetterTrigger>
      <SelectSetterContent>
        <SelectSetterItem value={SELECT_DEFAULT_VALUE}>默认</SelectSetterItem>
        {options.map((option) => (
          <SelectSetterItem key={String(option.value)} value={String(option.value)}>
            {option.label}
          </SelectSetterItem>
        ))}
      </SelectSetterContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* JSON（对象 / 数组 / 未声明属性）                                     */
/* ------------------------------------------------------------------ */

export function JsonSetter({ value, placeholder, onCommit }: SetterProps) {
  const external = value === undefined ? '' : safeStringify(value);
  const [draft, setDraft] = useState(external);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      setError(null);
      onCommit(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      setError(null);
      onCommit(parsed);
    } catch (parseError) {
      // 不提交非法 JSON，但要让用户看到为什么没生效
      setError((parseError as Error).message.replace(/^JSON\.parse: /, ''));
    }
  };

  return (
    <div className={styles.jsonWrap}>
      <Textarea
        rows={4}
        className={styles.mono}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          commit(draft);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          // 边打边试解析，合法就即时生效，非法只报错不写入
          commit(event.target.value);
        }}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}
