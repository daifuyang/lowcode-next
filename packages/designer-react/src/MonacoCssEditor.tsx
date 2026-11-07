import { useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import './monaco-setup';
import styles from '@lowcode-next/designer-ui/StyleSetter.module.css';

export interface MonacoCssEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** 聚焦 / 失焦：失焦自动保存，对齐引擎 onDidBlurEditorWidget */
  onFocusChange: (focused: boolean) => void;
}

const MIN_HEIGHT = 84;

/**
 * 引擎 `style-setter/components/css-code/index.tsx` 的 defaultEditorOption，
 * 补上 base-monaco-editor `INITIAL_OPTIONS` 的通用项。
 * CSS 的补全、校验与「格式化文档」由 css.worker 里的 language service 提供，
 * 这里只负责开关，不自己实现任何格式化逻辑。
 */
const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  readOnly: false,
  fontSize: 12,
  tabSize: 2,
  fontFamily: 'Menlo, Monaco, Courier New, monospace',
  autoIndent: 'advanced',
  formatOnPaste: true,
  wordWrap: 'off',
  scrollBeyondLastLine: false,
  lineNumbers: 'off',
  lineNumbersMinChars: 0,
  lineDecorationsWidth: 0,
  glyphMargin: false,
  folding: false,
  minimap: { enabled: false },
  fixedOverflowWidgets: true,
  automaticLayout: true,
  contextmenu: true, // 右键菜单保留「格式化文档」，快捷键 Shift+Alt+F 亦可
  snippetSuggestions: 'top',
  scrollbar: {
    horizontal: 'auto',
    vertical: 'auto',
    horizontalScrollbarSize: 10,
    verticalScrollbarSize: 10,
  },
  overviewRulerLanes: 0,
  renderLineHighlight: 'none',
  padding: { top: 6, bottom: 6 },
};

export default function MonacoCssEditor({
  value,
  onChange,
  onFocusChange,
}: MonacoCssEditorProps) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  // 事件回调挂在 Monaco 实例上，用 ref 保证始终拿到最新的父组件闭包
  const callbacks = useRef({ onChange, onFocusChange });
  callbacks.current = { onChange, onFocusChange };

  const handleMount: OnMount = (instance, monaco) => {
    // 引擎按 onDidChangeModelDecorations 撑高；内容变化事件更直接可靠
    const updateHeight = () => {
      const lineHeight = instance.getOption(monaco.editor.EditorOption.lineHeight);
      const lineCount = instance.getModel()?.getLineCount() ?? 1;
      setHeight(Math.max(MIN_HEIGHT, lineCount * lineHeight + 20));
    };
    updateHeight();
    instance.onDidChangeModelContent(updateHeight);
    instance.onDidFocusEditorWidget(() => callbacks.current.onFocusChange(true));
    instance.onDidBlurEditorWidget(() => callbacks.current.onFocusChange(false));
  };

  return (
    <Editor
      height={height}
      language="css"
      theme="vs"
      value={value}
      options={EDITOR_OPTIONS}
      onChange={(next) => callbacks.current.onChange(next ?? '')}
      onMount={handleMount}
      loading={<div className={styles.monacoLoading}>编辑器加载中…</div>}
    />
  );
}
