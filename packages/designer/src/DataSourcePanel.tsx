import { useMemo, useRef, useState } from 'react';
import type { DataSourceConfig } from '@lowcode-next/protocol';
import type { DocumentImpl } from '@lowcode-next/model';
import { ChevronDown, Copy, Eye, Pencil, Plus, Search, Trash } from 'lucide-react';
import { PaneHeader } from './PaneHeader';
import styles from './DataSourcePanel.module.css';

export interface DataSourcePanelProps {
  document: DocumentImpl;
  /** 点「编辑 / 新建」→ 由 Designer 在本面板右缘弹出编辑浮层（引擎的 detail 同款） */
  onEdit?: (draft: DataSourceConfig, isNew: boolean) => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
}

/** 调试（眼睛按钮）的一次请求结果 */
interface DebugResult {
  status: 'loading' | 'ok' | 'error';
  text: string;
}

/**
 * 数据源面板（lowcode-engine 的 `plugin-datasource-pane`）。
 *
 * 结构对齐引擎 demo：标题行（PaneHeader）→ 「数据源」小标 → 筛选行
 * （类型下拉 + 关键词 + 搜索钮）→ 操作行（新建 / 排序 / 导入 / 导出）→
 * 列表卡片（名称 + 类型标签 + 调试/编辑/删除/复制）。
 *
 * 与引擎的口径差异（有意为之）：
 * - 数据源编辑**不走撤销栈**（引擎同样直接改 doc.dataSource，不进 history），
 *   改动立即生效并随 toSchema 导出；
 * - 类型只内置 `fetch`；jsonp / mtop 等请求处理器在 v1 没有 requestHandlerMap，
 *   新建下拉先不做多类型菜单，等接入数据源引擎时一起补；
 * - 引擎卡片上有"排序"进入拖拽排序模式，这里简化成按 ID 排序的开关。
 */
export function DataSourcePanel({ document: doc, onEdit, pinned, onTogglePin, onClose }: DataSourcePanelProps) {
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [sortById, setSortById] = useState(false);
  const [debug, setDebug] = useState<Record<string, DebugResult>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const types = useMemo(() => {
    const set = new Set(doc.dataSource.map((item) => item.type));
    return ['全部', ...set];
  }, [doc.dataSource]);

  const list = useMemo(() => {
    let items = [...doc.dataSource];
    if (typeFilter !== '全部') items = items.filter((item) => item.type === typeFilter);
    const kw = keyword.trim().toLowerCase();
    if (kw) items = items.filter((item) => `${item.id} ${item.description ?? ''}`.toLowerCase().includes(kw));
    if (sortById) items.sort((a, b) => a.id.localeCompare(b.id));
    return items;
  }, [doc.dataSource, typeFilter, keyword, sortById]);

  const create = () => {
    // 引擎的"新建"是带类型菜单的下拉按钮；v1 只有 fetch，直接建一条再进编辑表单
    const base = 'fetch';
    let n = doc.dataSource.filter((item) => item.id.startsWith(base)).length + 1;
    while (doc.dataSource.some((item) => item.id === `${base}_${n}`)) n += 1;
    const draft: DataSourceConfig = {
      id: `${base}_${n}`,
      type: 'fetch',
      isInit: true,
      options: { method: 'GET', timeout: 5000 },
    };
    onEdit?.(draft, true);
  };

  const duplicate = (config: DataSourceConfig) => {
    let n = 2;
    while (doc.dataSource.some((item) => item.id === `${config.id}_${n}`)) n += 1;
    const next = doc.dataSource.concat({ ...structuredClone(config), id: `${config.id}_${n}` });
    doc.setDataSource(next);
  };

  const remove = (config: DataSourceConfig) => {
    doc.setDataSource(doc.dataSource.filter((item) => item.id !== config.id));
  };

  const exportList = () => {
    const blob = new Blob([JSON.stringify({ list: doc.dataSource }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = 'dataSource.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importList = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { list?: DataSourceConfig[] };
      if (!Array.isArray(parsed.list)) return;
      const known = new Set(doc.dataSource.map((item) => item.id));
      const merged = doc.dataSource.concat(parsed.list.filter((item) => item?.id && !known.has(item.id)));
      doc.setDataSource(merged);
    } catch {
      // 文件不合法就静默忽略——面板是轻量工具，不做错误弹窗
    }
  };

  /** 眼睛 = 调试：真实发一次请求，把状态和响应体展示在卡片下方 */
  const runDebug = async (config: DataSourceConfig) => {
    const options = config.options ?? {};
    if (!options.uri) {
      setDebug((prev) => ({ ...prev, [config.id]: { status: 'error', text: '请求地址为空' } }));
      return;
    }
    setDebug((prev) => ({ ...prev, [config.id]: { status: 'loading', text: '' } }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout ?? 5000);
    try {
      const method = options.method ?? 'GET';
      const url = new URL(options.uri, globalThis.location.href);
      if (method === 'GET' && options.params) {
        for (const [key, value] of Object.entries(options.params)) {
          url.searchParams.set(key, String(value));
        }
      }
      const response = await fetch(url, {
        method,
        headers: options.headers,
        body: method !== 'GET' && options.params ? JSON.stringify(options.params) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // 非 JSON 响应原样展示
      }
      setDebug((prev) => ({
        ...prev,
        [config.id]: { status: 'ok', text: `${response.status} ${response.statusText}\n\n${pretty}` },
      }));
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? '请求超时' : String(error);
      setDebug((prev) => ({ ...prev, [config.id]: { status: 'error', text: reason } }));
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <div className={styles.root}>
      <PaneHeader title="数据源" pinned={pinned} onTogglePin={onTogglePin} onClose={onClose} />

      <div className={styles.body}>
        <div className={styles.label}>数据源</div>

        {/* 筛选行：类型下拉 + 关键词 + 搜索按钮 */}
        <div className={styles.filter}>
          <select
            className={styles.typeSelect}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="按类型筛选"
          >
            {[...types].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            className={styles.search}
            value={keyword}
            placeholder="请输入"
            aria-label="搜索数据源"
            onChange={(event) => setKeyword(event.target.value)}
          />
          <span className={styles.searchBtn} aria-hidden="true">
            <Search size={13} strokeWidth={1.8} />
          </span>
        </div>

        {/* 操作行 */}
        <div className={styles.actions}>
          <button type="button" className={styles.createBtn} onClick={create}>
            <Plus size={12} strokeWidth={2} aria-hidden="true" />
            新建
            <ChevronDown size={11} strokeWidth={2} aria-hidden="true" className={styles.createChevron} />
          </button>
          <button
            type="button"
            className={styles.textBtn}
            data-active={sortById || undefined}
            title="按数据源 ID 排序"
            onClick={() => setSortById((prev) => !prev)}
          >
            排序
          </button>
          <button type="button" className={styles.textBtn} onClick={() => importRef.current?.click()}>
            导入
          </button>
          <button type="button" className={styles.textBtn} onClick={exportList}>
            导出
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importList(file);
              event.target.value = '';
            }}
          />
        </div>

        {/* 列表 */}
        {list.length === 0 ? (
          <div className={styles.empty}>{doc.dataSource.length ? '没有匹配的数据源' : '暂无数据源，点「新建」添加'}</div>
        ) : (
          <ul className={styles.list}>
            {list.map((config) => {
              const result = debug[config.id];
              return (
                <li key={config.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.name} title={config.description ?? config.id}>
                      {config.id}
                    </span>
                    <span className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="调试：发一次请求"
                        aria-label={`调试 ${config.id}`}
                        onClick={() => void runDebug(config)}
                      >
                        <Eye size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="编辑"
                        aria-label={`编辑 ${config.id}`}
                        onClick={() => onEdit?.(structuredClone(config), false)}
                      >
                        <Pencil size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="删除"
                        aria-label={`删除 ${config.id}`}
                        onClick={() => remove(config)}
                      >
                        <Trash size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="复制"
                        aria-label={`复制 ${config.id}`}
                        onClick={() => duplicate(config)}
                      >
                        <Copy size={14} strokeWidth={1.7} />
                      </button>
                    </span>
                  </div>
                  <span className={styles.tag}>{config.type}</span>

                  {result ? (
                    <pre className={styles.debug} data-status={result.status}>
                      {result.status === 'loading' ? '请求中…' : result.text}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
