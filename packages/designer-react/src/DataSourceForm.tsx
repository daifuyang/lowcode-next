import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DataSourceConfig } from '@lowcode-next/protocol';
import { Plus, X } from 'lucide-react';
import styles from '@lowcode-next/designer-ui/DataSourceForm.module.css';

export interface DataSourceFormProps {
  /** 编辑目标；origin.id 用于在列表里定位替换（ID 可被改名） */
  origin: DataSourceConfig;
  isNew: boolean;
  /** 当前列表里所有 ID（查重用） */
  existingIds: string[];
  onConfirm: (next: DataSourceConfig) => void;
  onCancel: () => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

/**
 * 数据源编辑表单（引擎在数据源面板右缘弹出的 detail：页头左标题、右确认/取消）。
 *
 * 装载位置照引擎 `plugin-datasource-pane`：不是右栏属性面板，而是贴着面板
 * 右缘、压在画布上的浮层（见 DesignerShell 的 detailPane）。
 * 字段与引擎 demo 对齐：类型 / 数据源 ID / 是否自动请求 / 请求地址 /
 * 请求参数 / 请求方法 / 超时时间（毫秒）/ 请求头信息。
 *
 * 引擎还有 shouldFetch / dataHandler 等函数代码框 —— 那是数据源引擎
 * （expression 沙箱 + requestHandlerMap）的一部分，v1 没有运行时消费方，
 * 先不暴露这些会误导人的死配置，等 M6 表达式沙箱接入后再补。
 */
export function DataSourceForm({ origin, isNew, existingIds, onConfirm, onCancel }: DataSourceFormProps) {
  const [draft, setDraft] = useState<DataSourceConfig>(structuredClone(origin));
  const [errors, setErrors] = useState<{ id?: string; uri?: string }>({});

  const options = draft.options ?? {};
  const patch = (part: Partial<DataSourceConfig>) => setDraft((prev) => ({ ...prev, ...part }));
  const patchOptions = (part: Partial<NonNullable<DataSourceConfig['options']>>) =>
    setDraft((prev) => ({ ...prev, options: { ...prev.options, ...part } }));

  const submit = () => {
    const nextErrors: typeof errors = {};
    const id = draft.id.trim();
    if (!id) nextErrors.id = '数据源 ID 不能为空';
    else if (existingIds.some((existing) => existing === id && existing !== origin.id)) {
      nextErrors.id = '数据源 ID 已存在';
    }
    if (draft.type === 'fetch' && !options.uri?.trim()) nextErrors.uri = '请求地址不能为空';

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    onConfirm({ ...draft, id, options: { ...options, uri: options.uri?.trim() } });
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>
          {isNew ? '新建' : '编辑'}数据源 {draft.type}
        </span>
        <span className={styles.actions}>
          <button type="button" className={styles.confirm} onClick={submit}>
            确认
          </button>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            取消
          </button>
        </span>
      </div>

      <div className={styles.body}>
        <Row label="类型">
          <input className={styles.input} value={draft.type} readOnly aria-label="数据源类型" />
        </Row>

        <Row label="数据源 ID" required error={errors.id}>
          <input
            className={styles.input}
            value={draft.id}
            data-invalid={errors.id || undefined}
            onChange={(event) => {
              patch({ id: event.target.value });
              setErrors((prev) => ({ ...prev, id: undefined }));
            }}
          />
        </Row>

        <Row label="是否自动请求">
          <Switch
            checked={draft.isInit ?? false}
            label={draft.isInit ? '页面加载时自动请求' : '手动请求'}
            onChange={(checked) => patch({ isInit: checked })}
          />
        </Row>

        <Row label="请求地址" required error={errors.uri}>
          <input
            className={styles.input}
            value={options.uri ?? ''}
            data-invalid={errors.uri || undefined}
            placeholder="https://api.example.com/info.json"
            onChange={(event) => {
              patchOptions({ uri: event.target.value });
              setErrors((prev) => ({ ...prev, uri: undefined }));
            }}
          />
        </Row>

        <Row label="请求参数">
          <KeyValueEditor
            value={options.params as Record<string, string> | undefined}
            onChange={(params) => patchOptions({ params })}
            keyPlaceholder="参数名"
            valuePlaceholder="参数值"
          />
        </Row>

        <Row label="请求方法">
          <select
            className={styles.select}
            value={options.method ?? 'GET'}
            onChange={(event) => patchOptions({ method: event.target.value as (typeof METHODS)[number] })}
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </Row>

        <Row label="超时时间（毫秒）">
          <input
            className={styles.input}
            type="number"
            min={0}
            step={100}
            value={options.timeout ?? 5000}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              patchOptions({ timeout: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
            }}
          />
        </Row>

        <Row label="请求头信息">
          <KeyValueEditor
            value={options.headers}
            onChange={(headers) => patchOptions({ headers })}
            keyPlaceholder="Header 名"
            valuePlaceholder="Header 值"
          />
        </Row>

        <p className={styles.hint}>
          运行态请求与表达式绑定（{'{{ dataSource.info }}'}）随 M6 数据源引擎一起生效；
          面板里的眼睛按钮可以先调试请求本身。
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 内部小件                                                            */
/* ------------------------------------------------------------------ */

function Row({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>
        {required ? <b className={styles.required}>*</b> : null}
        {label}
      </span>
      <span className={styles.rowControl}>
        {children}
        {error ? <span className={styles.error}>{error}</span> : null}
      </span>
    </div>
  );
}

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.switch}
      data-on={checked || undefined}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchThumb} />
      <span className={styles.switchLabel}>{label}</span>
    </button>
  );
}

/** 键值对编辑器：请求参数 / 请求头共用（引擎是「+ 添加」逐行加） */
function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string> | undefined) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const entries = Object.entries(value ?? {});

  const emit = (next: Array<[string, string]>) => {
    onChange(next.length ? Object.fromEntries(next) : undefined);
  };

  return (
    <div className={styles.kv}>
      {entries.map(([key, val], index) => (
        <span key={index} className={styles.kvRow}>
          <input
            className={styles.input}
            value={key}
            placeholder={keyPlaceholder}
            onChange={(event) => {
              const next = entries.map(([k, v], i) => (i === index ? [event.target.value, v] : [k, v]));
              emit(next as Array<[string, string]>);
            }}
          />
          <input
            className={styles.input}
            value={val}
            placeholder={valuePlaceholder}
            onChange={(event) => {
              const next = entries.map(([k, v], i) => (i === index ? [k, event.target.value] : [k, v]));
              emit(next as Array<[string, string]>);
            }}
          />
          <button
            type="button"
            className={styles.kvRemove}
            title="删除"
            aria-label="删除该行"
            onClick={() => emit(entries.filter((_, i) => i !== index))}
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        className={styles.kvAdd}
        onClick={() => emit([...entries, ['', '']])}
      >
        <Plus size={12} strokeWidth={2} aria-hidden="true" />
        添加
      </button>
    </div>
  );
}
