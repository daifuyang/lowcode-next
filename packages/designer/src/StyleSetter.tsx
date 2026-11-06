import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { EngineIcon, engineIcons } from './EngineIcons';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import {
  SELECT_DEFAULT_VALUE,
  Select,
  SelectSetterContent,
  SelectSetterItem,
  SelectSetterTrigger,
} from './ui/select';
import { cn } from './lib/utils';
import { BackgroundModule, BorderModule, PositionModule } from './StyleSetterExtras';
import styles from './StyleSetter.module.css';

// Monaco 体积大，只在展开「行内样式」源码区时才加载，不进主 bundle
const MonacoCssEditor = lazy(() => import('./MonacoCssEditor'));

/**
 * 样式面板（引擎 StyleSetter V2 的完整复刻，lowcode-engine-ext
 * `src/setter/style-setter`，DESIGN-v1 §7.14）。
 *
 * 结构 = 源码编辑器（CssCode）+ 五个折叠模块（布局 / 文字 / 背景 / 位置 / 边框）：
 * - 布局：布局模式图标单选 → display==='flex' 时出现 4 行 flex 子字段 →
 *   LayoutBox 3D 盒模型（margin/padding 八向输入）→ 宽度/高度
 * - 文字：字号/行高 → 字重 → 字体 → 文字颜色 → 对齐 → 透明度（滑杆 + 数值）
 * - 控件壳用 shadcn（Input / Select / Slider / Button），像素细节照抄引擎 less
 *
 * 与引擎的偏离（都有理由）：
 * - 无 Monaco，源码编辑用等宽 Textarea（#main { } 包装与保存按钮语义照抄）
 * - 不做 useComputedStyle 画布计算值预填
 * - 背景模块只给 颜色/图片 两项；位置模块偏移用 2×2 网格（引擎是 positionBox 3D 盒）
 */

export interface StyleSetterProps {
  style: Record<string, unknown>;
  /** 单键提交：undefined/null = 删除该样式键；值允许数字（position 模板写 0） */
  onStyleChange: (key: string, value: unknown) => void;
  /** 整体替换：CssCode 保存与背景/位置/边框的批量提交共用（一次交互 = 一条历史） */
  onStyleReplace: (value: Record<string, unknown> | undefined) => void;
}

/** 引擎 onStyleChange(styleDataList) 的本地对应物：一次提交多个样式键 */
export type StyleBatch = (changes: Array<{ key: string; value: unknown }>) => void;

/* ------------------------------------------------------------------ */
/* 引擎 utils：单位与 CSS 文本互转                                        */
/* ------------------------------------------------------------------ */

/** 引擎 removeUnit：仅剥 px，其他单位（%、calc…）原样保留 */
function removeUnit(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text.endsWith('px') ? text.slice(0, -2) : text;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** 驼峰 → kebab-case（引擎 toLine） */
function toKebab(styleKey: string): string {
  return styleKey.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** kebab-case → 驼峰（引擎 toHump） */
function toCamel(cssKey: string): string {
  return cssKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** styleData → CSS 文本。引擎 parseToCssCode 用 cssjson.toCSS，缩进是每层一个 tab */
function styleToCssCode(style: Record<string, unknown>): string {
  const decls = Object.entries(style)
    .map(([key, value]) => `\t${toKebab(key)}: ${String(value)};`)
    .join('\n');
  return `#main {\n${decls}\n}`;
}

/**
 * CSS 文本 → styleData（引擎 parseToStyleData 同语义）。
 * 接受 `#main { }` 包装或裸声明；解析失败返回 null（引擎据此禁用保存）。
 */
function parseToStyleData(code: string): Record<string, string> | null {
  let text = code.trim();
  const wrapped = text.match(/^#main\s*\{([\s\S]*)\}$/);
  if (wrapped) text = wrapped[1]!.trim();

  const style: Record<string, string> = {};
  for (const rawDecl of text.split(';')) {
    const decl = rawDecl.trim();
    if (decl === '') continue;
    const sep = decl.indexOf(':');
    if (sep <= 0) return null;
    const prop = decl.slice(0, sep).trim();
    const value = decl.slice(sep + 1).trim();
    if (!/^-?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop) || value === '') return null;
    style[toCamel(prop)] = value;
  }
  return style;
}

/* ------------------------------------------------------------------ */
/* 图标（引擎 iconfont 的 SVG 等价物）                                    */
/* ------------------------------------------------------------------ */

/** 布局模式（引擎 pro/layout/locale/zh-CN.json 的 icon 字段） */
const DISPLAY_ICONS = engineIcons({
  inline: 'icon-a-Displayinline',
  flex: 'icon-a-Displayflex',
  block: 'icon-a-Displayblock',
  'inline-block': 'icon-a-Displayinline-block',
  none: 'icon-yincang',
});

/** 主轴 / 辅轴对齐（引擎 icon-a-Justify* / icon-a-Align* 系列） */
const JUSTIFY_ICONS = engineIcons({
  'flex-start': 'icon-a-Justifyflex-startrow',
  'flex-end': 'icon-a-Justifyflex-endrow',
  center: 'icon-a-Justifycenterrow',
  'space-between': 'icon-a-Justifyspace-betweenrow',
  'space-around': 'icon-a-Justifyspace-aroundrow',
});

const ALIGN_ICONS = engineIcons({
  'flex-start': 'icon-a-Alignflex-startrow',
  'flex-end': 'icon-a-Alignflex-endrow',
  center: 'icon-a-Aligncenterrow',
  baseline: 'icon-a-Alignbaselinerow',
  stretch: 'icon-a-Alignstretchrow',
});

/** 换行：引擎 locale 里这三项没有 icon 字段，RadioGroup 走 item.title 文字分支 */
const DIRECTION_ICONS = engineIcons({
  row: 'icon-a-Directionrow',
  'row-reverse': 'icon-a-Directionrow-reverse',
  column: 'icon-a-Directioncolumn',
  'column-reverse': 'icon-a-Directioncolumn-reverse',
});

/** 文字对齐（引擎 pro/font/locale/zh-CN.json 的 icon 字段） */
const TEXT_ALIGN_ICONS = engineIcons({
  left: 'icon-align-left',
  center: 'icon-align-middle',
  right: 'icon-align-right',
  justify: 'icon-justify',
});

/* 文字模块的枚举（引擎 font/locale/zh-CN.json 照抄） */
/**
 * 字重：引擎 locale 是 `100 Thin / 200 Extra Light / … / 800 Extra Bold /
 * 900 Black`（后两项还漏了数值）。中文界面里这些英文名分不清轻重，
 * 改成「数值 + 中文名」，value 仍是字符串数字，写回 schema 不变。
 */
const FONT_WEIGHTS = [
  { label: '100 极细', value: '100' },
  { label: '200 特细', value: '200' },
  { label: '300 细体', value: '300' },
  { label: '400 常规', value: '400' },
  { label: '500 中等', value: '500' },
  { label: '600 半粗', value: '600' },
  { label: '700 加粗', value: '700' },
  { label: '800 特粗', value: '800' },
  { label: '900 极粗', value: '900' },
];

/** 字体：保留引擎三项，补上中文环境常用的字体族（文案也用中文标注） */
const FONT_FAMILIES = [
  { label: '系统默认', value: 'inherit' },
  { label: '苹方 / PingFang SC', value: '"PingFang SC", sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Arial', value: 'Arial' },
  { label: '宋体 / serif', value: 'serif' },
  { label: '等宽 / monospace', value: 'monospace' },
];

export const POSITION_OPTIONS = [
  { label: '无定位', value: 'static' },
  { label: '相对定位', value: 'relative' },
  { label: '绝对定位', value: 'absolute' },
  { label: '固定定位', value: 'fixed' },
  { label: '粘性定位', value: 'sticky' },
];

const DISPLAY_ITEMS = [
  { value: 'inline', tips: '内联布局' },
  { value: 'flex', tips: '弹性布局' },
  { value: 'block', tips: '块级布局' },
  { value: 'inline-block', tips: '内联块布局' },
  { value: 'none', tips: '隐藏' },
];

const DIRECTION_ITEMS = [
  { value: 'row', tips: '水平方向，起点在左侧' },
  { value: 'row-reverse', tips: '水平方向，起点在右侧' },
  { value: 'column', tips: '垂直方向，起点在上沿' },
  { value: 'column-reverse', tips: '垂直方向，起点在下沿' },
];

const JUSTIFY_ITEMS = [
  { value: 'flex-start', tips: '左对齐' },
  { value: 'flex-end', tips: '右对齐' },
  { value: 'center', tips: '水平居中' },
  { value: 'space-between', tips: '两端对齐' },
  { value: 'space-around', tips: '横向平分' },
];

const ALIGN_ITEMS = [
  { value: 'flex-start', tips: '起点对齐' },
  { value: 'flex-end', tips: '终点对齐' },
  { value: 'center', tips: '水平居中' },
  { value: 'baseline', tips: '项目第一行文字的基线对齐' },
  { value: 'stretch', tips: '沾满整个容器的高度' },
];

const WRAP_ITEMS = [
  { value: 'nowrap', tips: '不换行', label: '不换行' },
  { value: 'wrap', tips: '第一行在上方', label: '正换行' },
  { value: 'wrap-reverse', tips: '第一行在下方', label: '逆换行' },
];

const TEXT_ALIGN_ITEMS = [
  { value: 'left', tips: '左对齐' },
  { value: 'center', tips: '居中对齐' },
  { value: 'right', tips: '右对齐' },
  { value: 'justify', tips: '两端对齐' },
];

/* ------------------------------------------------------------------ */
/* 主体                                                                  */
/* ------------------------------------------------------------------ */

export function StyleSetter({ style, onStyleChange, onStyleReplace }: StyleSetterProps) {
  // 引擎 onStyleChange 接收 styleDataList，一次合并多个键；本地复用整体替换通道，
  // 保证「四角模板」「圆角互斥清键」这类多键交互只产生一条历史记录。
  const batch: StyleBatch = (changes) => {
    const next: Record<string, unknown> = { ...style };
    for (const { key, value } of changes) {
      if (value === undefined || value === null) delete next[key];
      else next[key] = value;
    }
    onStyleReplace(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className={styles.setter}>
      <CssCodeSection style={style} onStyleReplace={onStyleReplace} />

      <ModuleCard title="布局" defaultOpen>
        <Row title="布局模式" longTitle active={style.display !== undefined}>
          <IconRadioGroup
            items={DISPLAY_ITEMS}
            icons={DISPLAY_ICONS}
            value={style.display}
            onChange={(v) => onStyleChange('display', v)}
          />
        </Row>

        {style.display === 'flex' ? (
          <>
            <Row title="主轴方向" longTitle active={style.flexDirection !== undefined}>
              <IconRadioGroup
                items={DIRECTION_ITEMS}
                icons={DIRECTION_ICONS}
                value={style.flexDirection}
                onChange={(v) => onStyleChange('flexDirection', v)}
              />
            </Row>
            <Row title="主轴对齐" longTitle active={style.justifyContent !== undefined}>
              <IconRadioGroup
                items={JUSTIFY_ITEMS}
                icons={JUSTIFY_ICONS}
                value={style.justifyContent}
                onChange={(v) => onStyleChange('justifyContent', v)}
              />
            </Row>
            <Row title="辅轴对齐" longTitle active={style.alignItems !== undefined}>
              <IconRadioGroup
                items={ALIGN_ITEMS}
                icons={ALIGN_ICONS}
                value={style.alignItems}
                onChange={(v) => onStyleChange('alignItems', v)}
              />
            </Row>
            <Row title="换行" longTitle active={style.flexWrap !== undefined}>
              <IconRadioGroup
                items={WRAP_ITEMS}
                value={style.flexWrap}
                onChange={(v) => onStyleChange('flexWrap', v)}
              />
            </Row>
          </>
        ) : null}

        <LayoutBox style={style} onStyleChange={onStyleChange} />

        <div className={styles.innerRow}>
          <div className={styles.innerItem}>
            <span className={styles.innerTitle}>宽度</span>
            <UnitNumberInput value={style.width} onChange={(v) => onStyleChange('width', v)} />
          </div>
          <div className={styles.innerItem}>
            <span className={styles.innerTitle}>高度</span>
            <UnitNumberInput value={style.height} onChange={(v) => onStyleChange('height', v)} />
          </div>
        </div>
      </ModuleCard>

      <ModuleCard title="文字" defaultOpen>
        <div className={styles.innerRow}>
          <div className={styles.innerItem}>
            <span className={styles.innerTitle}>字号</span>
            <UnitNumberInput
              value={style.fontSize}
              onChange={(v) => onStyleChange('fontSize', v)}
            />
          </div>
          <div className={styles.innerItem}>
            <span className={styles.innerTitle}>行高</span>
            <UnitNumberInput
              value={style.lineHeight}
              onChange={(v) => onStyleChange('lineHeight', v)}
            />
          </div>
        </div>

        <Row title="字重" active={style.fontWeight !== undefined}>
          <StyleSelect
            value={style.fontWeight}
            options={FONT_WEIGHTS}
            placeholder="请选择"
            onChange={(v) => onStyleChange('fontWeight', v)}
          />
        </Row>
        <Row title="字体" active={style.fontFamily !== undefined}>
          <StyleSelect
            value={style.fontFamily}
            options={FONT_FAMILIES}
            placeholder="请选择"
            onChange={(v) => onStyleChange('fontFamily', v)}
          />
        </Row>
        <Row title="文字颜色" longTitle active={style.color !== undefined}>
          <ColorInput value={style.color} onChange={(v) => onStyleChange('color', v)} />
        </Row>
        <Row title="对齐" active={style.textAlign !== undefined}>
          <IconRadioGroup
            items={TEXT_ALIGN_ITEMS}
            icons={TEXT_ALIGN_ICONS}
            value={style.textAlign}
            onChange={(v) => onStyleChange('textAlign', v)}
          />
        </Row>
        <OpacityRow style={style} onStyleChange={onStyleChange} />
      </ModuleCard>

      {/* 三个模块逐行移植引擎 pro/{background,position,border}，实现见
          StyleSetterExtras.tsx；引擎的五个 Collapse 都默认展开。 */}
      <BackgroundModule style={style} onStyleChange={onStyleChange} batch={batch} />
      <PositionModule style={style} onStyleChange={onStyleChange} batch={batch} />
      <BorderModule style={style} onStyleChange={onStyleChange} batch={batch} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 源码（引擎 CssCode 组件）                                              */
/* ------------------------------------------------------------------ */

function CssCodeSection({
  style,
  onStyleReplace,
}: {
  style: Record<string, unknown>;
  onStyleReplace: StyleSetterProps['onStyleReplace'];
}) {
  const [editorOpen, setEditorOpen] = useState(true);
  const external = styleToCssCode(style);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const parsed = parseToStyleData(draft);
  const valid = parsed !== null;
  // 与当前 style 逐键比对（值都转字符串），完全相同就禁用保存（引擎 isCanSave 同语义）
  const current: Record<string, string> = {};
  for (const [key, value] of Object.entries(style)) current[key] = String(value);
  const dirty = valid && JSON.stringify(parsed) !== JSON.stringify(current);

  const save = () => {
    if (!parsed) return;
    onStyleReplace(Object.keys(parsed).length > 0 ? parsed : undefined);
  };

  return (
    <div className={styles.cssSection}>
      <div className={styles.cssToggleRow}>
        <span className={styles.cssToggleTitle}>行内样式</span>
        <button
          type="button"
          className={styles.cssToggleBtn}
          aria-expanded={editorOpen}
          title={editorOpen ? '收起源码' : '展开源码'}
          onClick={() => setEditorOpen((open) => !open)}
        >
          <code>{'{/}'}</code>
        </button>
      </div>

      {editorOpen ? (
        <div className={styles.cssEditorWrap}>
          <div className={styles.cssHeader}>
            <EngineIcon name="icon-CSS" size={16} className={styles.cssIcon} />
            <Button size="sm" onClick={save} disabled={!valid || !dirty}>
              保存
            </Button>
          </div>
          <div className={styles.cssEditor}>
            <Suspense fallback={<div className={styles.monacoLoading}>编辑器加载中…</div>}>
              <MonacoCssEditor
                value={draft}
                onChange={setDraft}
                onFocusChange={(isFocused) => {
                  focused.current = isFocused;
                  // 引擎 onDidBlurEditorWidget：失焦自动保存
                  if (!isFocused) save();
                }}
              />
            </Suspense>
          </div>
          {!valid ? (
            <p className={styles.cssError}>CSS 解析失败：需保留 #main { } 包装，每行一条声明</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 折叠模块卡片 + 行骨架                                                  */
/* ------------------------------------------------------------------ */

export function ModuleCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={styles.moduleCard}>
      <button
        type="button"
        className={styles.moduleHeader}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={10} strokeWidth={1.5} className={cn(styles.chevron, !open && styles.chevronClosed)} />
        <span>{title}</span>
      </button>
      {open ? <div className={styles.moduleBody}>{children}</div> : null}
    </section>
  );
}

export function Row({
  title,
  longTitle,
  active,
  children,
}: {
  title: string;
  longTitle?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span
        className={cn(
          styles.rowTitle,
          longTitle && styles.rowTitleLong,
          active && styles.rowTitleActive,
        )}
      >
        {title}
      </span>
      <div className={styles.rowContent}>{children}</div>
    </div>
  );
}

/**
 * 分段单选组：shadcn/ui ToggleGroup 的 `type="single"` 变体（radio 语义的
 * 按钮组），视觉规格仍按引擎 Fusion Radio.Group shape="button"。
 *
 * - Root/Item 的 role=radiogroup/radio、aria-checked、方向键漫游由 Radix 负责，
 *   不用再手写 button + checked 状态；再点已选中项 Radix 会给空串，对应引擎
 *   `onRadioItemClick` 提交 null 的取消行为。
 * - 图标项沿用引擎 row/index.less 的等分（flex:1）；纯文字项按内容宽度排
 *   （min-width 48 + padding 0 8），整组 nowrap，窄面板下靠 flex-shrink 收进
 *   一行，不会掉成上下两截。
 */
export function IconRadioGroup({
  items,
  icons,
  value,
  onChange,
}: {
  items: Array<{ value: string; tips: string; label?: string }>;
  /** 不传图标时渲染 label 文字（引擎 RadioGroup 的 item.title 分支） */
  icons?: Partial<Record<string, ReactNode>>;
  value: unknown;
  onChange: (value: string | undefined) => void;
}) {
  const textOnly = !icons;
  return (
    <ToggleGroup
      type="single"
      value={String(value ?? '')}
      onValueChange={(next) => onChange(next || undefined)}
      className={styles.radioGroup}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          title={item.tips}
          className={cn(styles.radioItem, textOnly && styles.radioItemText)}
        >
          {icons?.[item.value] ?? item.label ?? item.value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/* ------------------------------------------------------------------ */
/* 输入控件                                                              */
/* ------------------------------------------------------------------ */

/**
 * 引擎 Fusion NumberPicker + innerAfter 的本地形态：input 与单位后缀是同一
 * 行内两个真实布局单元（table-cell / flex），不是绝对定位盖在输入框上。
 *
 * - 单单位（引擎 unit 传字符串，如全局默认 'px'）：后缀就是纯文本 `px`。
 * - 多单位（引擎 unit 传数组，如 ['px','%']）：后缀是一个无边框、无箭头、
 *   autoWidth:false 的 24px Select，文字完整显示、点击可切换。
 * - 输入框不再为后缀预留 26px 空白，placeholder 在窄面板下也不会被挤断。
 */
export function NumberField({
  value,
  placeholder = '0',
  unit,
  units,
  disabled,
  className,
  onValueChange,
  onUnitChange,
  onFocus,
  onBlur,
}: {
  value: string;
  placeholder?: string;
  /** 当前单位；undefined = 不渲染后缀 */
  unit?: string;
  /** 长度 > 1 时后缀可切换单位 */
  units?: string[];
  disabled?: boolean;
  className?: string;
  onValueChange: (raw: string) => void;
  onUnitChange?: (unit: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div
      className={cn(
        'border-input flex h-7 w-full min-w-0 items-center rounded-[3px] border bg-transparent text-xs outline-none',
        'focus-within:border-primary focus-within:ring-ring focus-within:ring-2',
        'hover:border-muted-foreground/70',
        styles.numberField,
        className,
      )}
    >
      {/* 复用 shadcn Input（统一的 border / radius / placeholder / disabled /
          aria-invalid 令牌），只把边框与聚焦光晕让给外层 shell 承担 */}
      <Input
        type="text"
        inputMode="decimal"
        className={cn(
          'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none outline-none',
          'hover:border-0 focus-visible:border-0 focus-visible:ring-0',
          styles.numberFieldInput,
        )}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        onFocus={(event) => {
          onFocus?.();
          event.currentTarget.select();
        }}
        onBlur={() => onBlur?.()}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {unit === undefined ? null : units && units.length > 1 ? (
        <select
          className={styles.numberUnitSelect}
          value={unit}
          title="单位"
          disabled={disabled}
          onChange={(event) => onUnitChange?.(event.target.value)}
        >
          {units.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      ) : (
        <span className={styles.numberSuffix}>{unit}</span>
      )}
    </div>
  );
}

/** 带单位的数字输入（引擎 Number 组件 + unit='px' 的形态：数值 + px 后缀） */
export function UnitNumberInput({
  value,
  onChange,
  min,
  max,
  placeholder = '0',
  className,
}: {
  value: unknown;
  onChange: (value: string | undefined) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
}) {
  const external = removeUnit(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange(undefined);
      return;
    }
    if (NUMERIC.test(trimmed)) {
      // 引擎 NumberPicker 的 min/max 夹取 + addUnit 补 px
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(trimmed)));
      onChange(`${clamped}px`);
      return;
    }
    // 其余（50%、calc(...)、var(...)）原样
    onChange(trimmed);
  };

  return (
    <div className={styles.unitInput}>
      <NumberField
        value={draft}
        placeholder={placeholder}
        unit="px"
        className={className}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(external);
        }}
        onValueChange={(raw) => {
          setDraft(raw);
          commit(raw);
        }}
      />
    </div>
  );
}

/** 颜色输入（引擎 ColorInput：色块 + 文本，色块点击弹原生取色器） */
export function ColorInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: string | undefined) => void;
}) {
  const external = value === undefined || value === null ? '' : String(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const hex = /^#[0-9a-fA-F]{6}$/.test(external) ? external : '#ffffff';

  return (
    <div className={styles.colorInput}>
      <Input
        type="text"
        className={styles.colorField}
        value={draft}
        placeholder="rgba(0,0,0,0.8)"
        spellCheck={false}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(external);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.target.value;
          onChange(next.trim() === '' ? undefined : next);
        }}
      />
      <label className={styles.colorSwatch} style={{ backgroundColor: draft || '#ffffff' }}>
        <input
          type="color"
          value={hex}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
        />
      </label>
    </div>
  );
}

/** 透明度行：滑杆（0-100）+ 数值框，提交 0~1（引擎 Range + NumberPicker） */
export function OpacityRow({
  style,
  onStyleChange,
}: {
  style: Record<string, unknown>;
  onStyleChange: StyleSetterProps['onStyleChange'];
}) {
  const raw = style.opacity;
  // 引擎 isCssVarBind：绑定了 CSS 变量的字段禁用 Range / NumberPicker
  const disabled = typeof raw === 'string' && /var\(/.test(raw);
  const pct = raw === undefined || raw === null ? 0 : Math.min(100, Math.max(0, Math.round(parseFloat(String(raw)) * 100) || 0));
  const external = raw === undefined || raw === null ? '' : String(pct);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const commitPct = (next: number) => {
    onStyleChange('opacity', `${next / 100}`);
  };

  return (
    <Row title="透明度" active={raw !== undefined}>
      <div className={styles.opacityWrap}>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[pct]}
          disabled={disabled}
          onValueChange={([next]) => commitPct(next ?? 0)}
        />
        <Input
          type="text"
          inputMode="numeric"
          className={styles.opacityInput}
          value={draft}
          disabled={disabled}
          placeholder="0"
          spellCheck={false}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            setDraft(external);
          }}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, '');
            setDraft(next);
            if (next === '') {
              onStyleChange('opacity', undefined);
              return;
            }
            const num = parseInt(next, 10);
            if (Number.isFinite(num)) commitPct(Math.min(100, num));
          }}
        />
      </div>
    </Row>
  );
}

/** 枚举下拉（shadcn Select；「默认」= 删除该样式键） */
export function StyleSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: unknown;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  onChange: (value: string | undefined) => void;
}) {
  const current = value === undefined || value === null ? '' : String(value);
  const label =
    current === ''
      ? undefined
      : (options.find((option) => option.value === current)?.label ?? current);

  // 与 setters.tsx 的 SelectSetter 保持一致：Radix Select 全程受控，
  // 空值用哨兵项而不是 undefined —— 否则首次选中会触发
  // "Select is changing from uncontrolled to controlled" 警告。
  return (
    <Select
      value={current === '' ? SELECT_DEFAULT_VALUE : current}
      onValueChange={(next) => {
        onChange(next === SELECT_DEFAULT_VALUE ? undefined : next);
      }}
    >
      <SelectSetterTrigger className={styles.growField}>
        <span className={current === '' ? 'text-placeholder' : undefined}>
          {label ?? placeholder}
        </span>
      </SelectSetterTrigger>
      <SelectSetterContent>
        <SelectSetterItem value={SELECT_DEFAULT_VALUE}>默认</SelectSetterItem>
        {options.map((option) => (
          <SelectSetterItem key={option.value} value={option.value}>
            {option.label}
          </SelectSetterItem>
        ))}
      </SelectSetterContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* LayoutBox（引擎 pro/layout/layoutBox.tsx + index.less 逐值移植）        */
/* ------------------------------------------------------------------ */

/** 盒模型小输入：透明无边框、居中、上下键 ±1（引擎 LayoutInput 行为） */
function BoxInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: string | undefined) => void;
}) {
  const external = removeUnit(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const commit = (raw: string) => {
    if (raw === '') {
      onChange(undefined);
      return;
    }
    // 引擎 onInputChange：parseInt 可解析才提交
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) onChange(`${parsed}px`);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      maxLength={3}
      /* 全面板控件统一走 shadcn Input；盒模型是透明叠层，只把边框/圆角/
         内距/聚焦光晕这些外壳令牌覆盖掉，几何仍由 .boxInput 控制 */
      className={cn(
        styles.boxInput,
        'block h-5 w-full min-w-0 rounded-none border-0 bg-transparent px-0 shadow-none outline-none',
        'hover:border-0 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
        'aria-invalid:border-0 aria-invalid:ring-0',
      )}
      value={draft}
      placeholder="0"
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(external);
      }}
      onKeyDown={(event) => {
        // 引擎 onInputKeyDown：↑/↓ 增减 1
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const base = parseInt(external, 10) || 0;
        const next = event.key === 'ArrowUp' ? base + 1 : base - 1;
        setDraft(String(next));
        onChange(`${next}px`);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        commit(event.target.value);
      }}
    />
  );
}

function LayoutBox({
  style,
  onStyleChange,
}: {
  style: Record<string, unknown>;
  onStyleChange: StyleSetterProps['onStyleChange'];
}) {
  return (
    <div className={styles.box}>
      {/* 内容区（引擎里透出面板底色，这里给白底对齐截图） */}
      <div className={styles.boxCenter} />

      <div className={cn(styles.face, styles.faceTop, style.marginTop !== undefined && styles.faceSet)}>
        <BoxInput value={style.marginTop} onChange={(v) => onStyleChange('marginTop', v)} />
      </div>
      <div className={cn(styles.face, styles.faceRight, style.marginRight !== undefined && styles.faceSet)}>
        <BoxInput value={style.marginRight} onChange={(v) => onStyleChange('marginRight', v)} />
      </div>
      <div className={cn(styles.face, styles.faceBottom, style.marginBottom !== undefined && styles.faceSet)}>
        <span className={styles.helpTxt}>外边距</span>
        <BoxInput value={style.marginBottom} onChange={(v) => onStyleChange('marginBottom', v)} />
      </div>
      <div className={cn(styles.face, styles.faceLeft, style.marginLeft !== undefined && styles.faceSet)}>
        <BoxInput value={style.marginLeft} onChange={(v) => onStyleChange('marginLeft', v)} />
      </div>

      <div className={cn(styles.face, styles.faceTop, styles.faceTopInset, style.paddingTop !== undefined && styles.faceSet)}>
        <BoxInput value={style.paddingTop} onChange={(v) => onStyleChange('paddingTop', v)} />
      </div>
      <div className={cn(styles.face, styles.faceRight, styles.faceRightInset, style.paddingRight !== undefined && styles.faceSet)}>
        <BoxInput value={style.paddingRight} onChange={(v) => onStyleChange('paddingRight', v)} />
      </div>
      <div className={cn(styles.face, styles.faceBottom, styles.faceBottomInset, style.paddingBottom !== undefined && styles.faceSet)}>
        <span className={styles.helpTxt}>内边距</span>
        <BoxInput value={style.paddingBottom} onChange={(v) => onStyleChange('paddingBottom', v)} />
      </div>
      <div className={cn(styles.face, styles.faceLeft, styles.faceLeftInset, style.paddingLeft !== undefined && styles.faceSet)}>
        <BoxInput value={style.paddingLeft} onChange={(v) => onStyleChange('paddingLeft', v)} />
      </div>
    </div>
  );
}
