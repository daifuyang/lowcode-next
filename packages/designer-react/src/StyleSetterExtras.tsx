/**
 * 样式页签的「背景 / 位置 / 边框」三个模块 —— lowcode-engine-ext
 * `src/setter/style-setter/pro/{background,position,border}` 的逐行逻辑移植
 * （DESIGN-v1 §7.14）。布局 / 文字模块仍在 StyleSetter.tsx。
 *
 * 对齐的不只是外观，而是引擎这三条链路的完整行为：
 * - 背景：类型（颜色/图片）是**本地状态**，不写进 style；图片 url() 包装与回显、
 *   尺寸三态（默认→宽高双值 / contain / cover）、定位 9 宫格 + 左/顶双值、
 *   重复显示、透明度。所有双值字段都写成 "w h" 单键，两个都 auto 时删键。
 * - 位置：定位非 static 才出现 3D 盒；absolute 额外给四角模板（一次写四个键）；
 *   zIndex / float / clear 三行。
 * - 边框：圆角「固定 / 分别定义」互斥并清理对方残留键；五方向边框选择器
 *   （选中方向才渲染宽度/颜色/样式）；内外阴影切换与 boxShadow 五段解析。
 *
 * 与引擎的有意偏离：
 * - 控件壳用本地 shadcn（Input/Select/Slider），图标用内联 SVG 等价 iconfont；
 * - 不做 useComputedStyle 的画布计算值预填，也不做 SketchPicker 取色弹层
 *   （ColorInput 用原生取色器）；
 * - css var(...) 绑定沿用引擎的「禁用输入」语义，但不渲染引擎的 ghost 文本。
 */
import { useEffect, useRef, useState } from 'react';
import {
  ColorInput,
  IconRadioGroup,
  ModuleCard,
  NumberField,
  OpacityRow,
  POSITION_OPTIONS,
  Row,
  StyleSelect,
  UnitNumberInput,
} from './StyleSetter';
import type { StyleBatch, StyleSetterProps } from './StyleSetter';
import {
  addUnit,
  formatBgImgUrl,
  isNil,
  isVarBind,
  multiPart,
  pairValue,
  parseBgImgUrl,
  splitUnit,
  toText,
} from '@lowcode-next/designer-core';
import { EngineIcon, engineIcons } from './EngineIcons';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { cn } from './lib/utils';
import styles from '@lowcode-next/designer-ui/StyleSetter.module.css';

export interface StyleModuleProps {
  style: Record<string, unknown>;
  onStyleChange: StyleSetterProps['onStyleChange'];
  batch: StyleBatch;
}

/* ------------------------------------------------------------------ */
/* 引擎 utils/index.tsx 的等价物                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 图标：全部直接复用 lowcode-engine 的 iconfont（EngineIcons.tsx）      */
/* 图标名与引擎各模块 locale/zh-CN.json 的 icon 字段一一对应              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 枚举（照抄引擎各模块 zh-CN locale）                                   */
/* ------------------------------------------------------------------ */

const BG_TYPE_ITEMS = [
  { value: 'color', tips: '颜色填充' },
  { value: 'bgImg', tips: '背景图片' },
];
const BG_TYPE_ICONS = engineIcons({
  color: 'icon-beijingse',
  bgImg: 'icon-beijingtupian',
});

const BG_SIZE_ITEMS = [
  { value: 'default', tips: '默认', label: '默认' },
  { value: 'contain', tips: '等比填充contain', label: '等比填充' },
  { value: 'cover', tips: '等比覆盖cover', label: '等比覆盖' },
];

/** 引擎 backgroundPosition.dataList：title / position / 九宫格坐标 */
const BG_POSITIONS = [
  { title: 'leftTop', position: '0 0', row: 0, col: 0, tips: '左上角' },
  { title: 'midTop', position: '50% 0', row: 0, col: 1, tips: '顶部' },
  { title: 'rightTop', position: '100% 0', row: 0, col: 2, tips: '右上角' },
  { title: 'leftMid', position: '0 50%', row: 1, col: 0, tips: '靠左' },
  { title: 'mid', position: '50% 50%', row: 1, col: 1, tips: '居中' },
  { title: 'rightMid', position: '100% 50%', row: 1, col: 2, tips: '靠右' },
  { title: 'leftBottom', position: '0 100%', row: 2, col: 0, tips: '左下角' },
  { title: 'midBottom', position: '50% 100%', row: 2, col: 1, tips: '底部' },
  { title: 'rightBottom', position: '100% 100%', row: 2, col: 2, tips: '右下角' },
];
const BG_POSITION_ICONS = engineIcons({
  leftTop: 'icon-zuoshangjiao',
  midTop: 'icon-dingbu',
  rightTop: 'icon-youshangjiao',
  leftMid: 'icon-kaozuo',
  mid: 'icon--quanbubiankuang',
  rightMid: 'icon-kaoyou',
  leftBottom: 'icon-zuoxiajiao',
  midBottom: 'icon-dibu',
  rightBottom: 'icon-youxiajiao',
});

const BG_REPEAT_ITEMS = [
  { value: 'repeat', tips: '垂直方向和水平方向重复 repeat' },
  { value: 'repeat-x', tips: '水平方向重复 repeat-x' },
  { value: 'repeat-y', tips: '垂直方向重复 repeat-y' },
  { value: 'no-repeat', tips: '不重复 no-repeat' },
];
const BG_REPEAT_ICONS = engineIcons({
  repeat: 'icon-jiugongge',
  'repeat-x': 'icon-hengxiangpingfen',
  'repeat-y': 'icon-zongxiangpingfen',
  'no-repeat': 'icon-shanchu2',
});

const FLOAT_ITEMS = [
  { value: 'none', tips: '不浮动' },
  { value: 'left', tips: '左浮动' },
  { value: 'right', tips: '右浮动' },
];
const FLOAT_ICONS = engineIcons({
  none: 'icon-close',
  left: 'icon-formatfloatleft',
  right: 'icon-formatfloatright',
});

const CLEAR_ITEMS = [
  { value: 'none', tips: '不清除' },
  { value: 'left', tips: '左清除' },
  { value: 'right', tips: '右清除' },
  { value: 'both', tips: '两边清除' },
];
const CLEAR_ICONS = engineIcons({
  none: 'icon-close',
  left: 'icon-qingchuzuoce',
  right: 'icon-qingchuyouce',
  both: 'icon-qingchuliangce',
});

const POSITION_TEMPLATES = [
  { value: 'topLeft', tips: '左上角' },
  { value: 'topRight', tips: '右上角' },
  { value: 'bottomLeft', tips: '左下角' },
  { value: 'bottomRight', tips: '右下角' },
];
const POSITION_TEMPLATE_ICONS = engineIcons({
  topLeft: 'icon-zuoshangcopy',
  topRight: 'icon-youshangcopy',
  bottomLeft: 'icon-zuoxiacopy',
  bottomRight: 'icon-youxiacopy',
});

const RADIUS_TYPE_ITEMS = [
  { value: 'fixedBorder', tips: '固定圆角' },
  { value: 'partBorder', tips: '分别定义' },
];
const RADIUS_TYPE_ICONS = engineIcons({
  fixedBorder: 'icon-yuanjiaofangkuang',
  partBorder: 'icon-yuanjiao',
});

const BORDER_DIRECTIONS = [
  { key: 'borderTop', icon: 'icon--shangbiankuang' },
  { key: 'borderLeft', icon: 'icon--zuobiankuang' },
  { key: 'border', icon: 'icon--quanbubiankuang' },
  { key: 'borderRight', icon: 'icon--youbiankuang' },
  { key: 'borderBottom', icon: 'icon--xiabiankuang' },
] as const;

const SHADOW_ITEMS = [
  { value: 'outerShadow', tips: '外阴影' },
  { value: 'insetShadow', tips: '内阴影' },
];
const SHADOW_ICONS = engineIcons({
  outerShadow: 'icon-yinying',
  insetShadow: 'icon-yinying-outside',
});

const BORDER_STYLE_OPTIONS = [
  { label: 'solid', value: 'solid' },
  { label: 'dashed', value: 'dashed' },
  { label: 'dotted', value: 'dotted' },
];

const RADIUS_CORNERS = [
  { key: 'borderTopLeftRadius', icon: 'icon-radius-upleft' },
  { key: 'borderTopRightRadius', icon: 'icon-radius-upright' },
  { key: 'borderBottomLeftRadius', icon: 'icon-radius-bottomleft' },
  { key: 'borderBottomRightRadius', icon: 'icon-radius-bottomright' },
] as const;

const BORDER_MAX = 30;
const SHADOW_DEFAULT = ['0', '0', '0', '0', '#000'];

/* ------------------------------------------------------------------ */
/* 公共输入控件                                                          */
/* ------------------------------------------------------------------ */

/** 引擎 components/number 的 multiProp 分支：数值 + px/% 单位下拉 */
function MultiPropNumber({
  raw,
  units = ['px', '%'],
  min,
  max,
  placeholder = '0',
  onChange,
}: {
  raw: unknown;
  units?: string[];
  min?: number;
  max?: number;
  placeholder?: string;
  onChange: (value: string, unit: string) => void;
}) {
  const { value, unit } = splitUnit(raw);
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const clamp = (text: string) => {
    const num = Number(text);
    if (!Number.isFinite(num)) return text;
    return String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, num)));
  };

  return (
    <div className={styles.multiNumber}>
      <NumberField
        value={draft}
        placeholder={placeholder}
        unit={unit}
        units={units}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(value);
        }}
        onValueChange={(next) => {
          setDraft(next);
          onChange(next.trim() === '' ? '' : clamp(next), unit);
        }}
        onUnitChange={(nextUnit) =>
          onChange(draft === '' ? value : clamp(draft), nextUnit)
        }
      />
    </div>
  );
}

/** 纯数字输入（引擎 NumberPicker，zIndex 用） */
function PlainNumber({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const external = isNil(value) ? '' : String(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={styles.growField}
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
        const next = event.target.value;
        setDraft(next);
        if (next.trim() === '') {
          onChange(undefined);
          return;
        }
        const num = Number(next);
        if (Number.isFinite(num)) onChange(num);
      }}
    />
  );
}

/** 引擎 pro/position/positionBox 的四向输入：noborder + auto 占位 + 上下键 ±1 */
function PositionInput({ value, onCommit }: { value: unknown; onCommit: (value: unknown) => void }) {
  const external = splitUnit(value).value;
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={4}
      className={styles.posInput}
      value={draft}
      placeholder="auto"
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(external);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() === '') {
          onCommit(undefined);
          return;
        }
        // 引擎 isNaN(parseInt(value)) 才拦截
        if (!Number.isFinite(parseInt(raw, 10))) return;
        onCommit(addUnit(raw.trim(), 'px'));
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const base = parseInt(external, 10) || 0;
        const next = event.key === 'ArrowUp' ? base + 1 : base - 1;
        setDraft(String(next));
        onCommit(addUnit(next, 'px'));
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 背景（引擎 pro/background）                                           */
/* ------------------------------------------------------------------ */

export function BackgroundModule({ style, onStyleChange }: StyleModuleProps) {
  const [bgType, setBgType] = useState<string | null>(null);
  const [bgSizeType, setBgSizeType] = useState<string | null>('default');
  const [bgRepeatType, setBgRepeatType] = useState<string | null>(null);
  const [bgPositionType, setBgPositionType] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const urlFocused = useRef(false);
  // 引擎 useEffect([styleData]) 每次外部样式变化都反推本地状态；用签名代替对象引用，
  // 避免本地 `style ?? {}` 每次渲染产生新引用导致 effect 空转。
  const signature = JSON.stringify(style);

  useEffect(() => {
    setBgType(style.backgroundColor ? 'color' : style.backgroundImage ? 'bgImg' : null);
    setBgRepeatType(isNil(style.backgroundRepeat) ? null : String(style.backgroundRepeat));
    const size = toText(style.backgroundSize);
    setBgSizeType(size === 'contain' || size === 'cover' ? size : 'default');
    setBgPositionType(BG_POSITIONS.find((item) => item.position === style.backgroundPosition)?.title ?? '');
    if (!urlFocused.current) setUrlDraft(parseBgImgUrl(style.backgroundImage));
  }, [signature]);

  const setSizePair = (direction: 'width' | 'height', raw: string, unit: string) => {
    const unified = raw.trim() === '' ? 'auto' : String(addUnit(raw, unit) ?? 'auto');
    onStyleChange('backgroundSize', pairValue(style.backgroundSize, direction, unified));
  };

  const setPositionPair = (direction: 'horizontal' | 'vertical', raw: string, unit: string) => {
    const trimmed = raw.trim();
    // 引擎 onBgPositionChange：整数补单位，其余（50%、var(...)）原样，空值 auto
    const unified = trimmed === '' ? 'auto' : /^-?[0-9]\d*$/.test(trimmed) ? String(addUnit(trimmed, unit)) : trimmed;
    onStyleChange('backgroundPosition', pairValue(style.backgroundPosition, direction, unified));
  };

  return (
    <ModuleCard title="背景" defaultOpen>
      <Row title="背景" active={bgType !== null}>
        <IconRadioGroup
          items={BG_TYPE_ITEMS}
          icons={BG_TYPE_ICONS}
          value={bgType}
          onChange={(value) => setBgType(value ?? null)}
        />
      </Row>

      {bgType === 'color' ? (
        <Row title=" " active={style.backgroundColor !== undefined}>
          <ColorInput
            value={style.backgroundColor}
            onChange={(value) => onStyleChange('backgroundColor', value)}
          />
        </Row>
      ) : null}

      {bgType === 'bgImg' ? (
        <>
          <Row title=" " active={style.backgroundImage !== undefined}>
            <div className={styles.urlInput}>
              <span className={styles.urlPrefix}>
                <EngineIcon name="icon-suffix-url" />
              </span>
              <Input
                type="text"
                className={styles.urlField}
                value={urlDraft}
                placeholder="输入图片url"
                spellCheck={false}
                onFocus={() => {
                  urlFocused.current = true;
                }}
                onBlur={() => {
                  urlFocused.current = false;
                  setUrlDraft(parseBgImgUrl(style.backgroundImage));
                }}
                onChange={(event) => {
                  const next = event.target.value;
                  setUrlDraft(next);
                  onStyleChange('backgroundImage', formatBgImgUrl(next));
                }}
              />
            </div>
          </Row>

          <Row title="尺寸" active={bgSizeType !== 'default'}>
            <IconRadioGroup
              items={BG_SIZE_ITEMS}
              value={bgSizeType}
              onChange={(value) => {
                // 引擎 onBgSizeTypeChange：先清 backgroundSize，非 default 再写回枚举值；
                // 再点已选中项拿到 null，尺寸类型为空、宽高输入随之隐藏。
                setBgSizeType(value ?? null);
                onStyleChange('backgroundSize', !value || value === 'default' ? undefined : value);
              }}
            />
          </Row>

          {bgSizeType === 'default' ? (
            <div className={styles.pairRow}>
              <span className={styles.pairTitle}>宽</span>
              <MultiPropNumber
                raw={multiPart(style.backgroundSize, 0)}
                placeholder="auto"
                min={0}
                onChange={(value, unit) => setSizePair('width', value, unit)}
              />
              <span className={styles.pairTitle}>高</span>
              <MultiPropNumber
                raw={multiPart(style.backgroundSize, 1)}
                placeholder="auto"
                min={0}
                onChange={(value, unit) => setSizePair('height', value, unit)}
              />
            </div>
          ) : null}

          <Row title="定位" active={style.backgroundPosition !== undefined}>
            <div className={styles.bgPosition}>
              <div className={styles.bgPositionGrid}>
                {BG_POSITIONS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    title={item.tips}
                    aria-pressed={bgPositionType === item.title}
                    className={cn(styles.iconBtn, bgPositionType === item.title && styles.iconBtnActive)}
                    onClick={() => {
                      setBgPositionType(item.title);
                      onStyleChange('backgroundPosition', item.position);
                    }}
                  >
                    {BG_POSITION_ICONS[item.title]}
                  </button>
                ))}
              </div>
              <div className={styles.bgPositionNums}>
                <div className={styles.pairItem}>
                  <span className={styles.pairTitle}>左</span>
                  <MultiPropNumber
                    raw={multiPart(style.backgroundPosition, 0)}
                    placeholder="auto"
                    onChange={(value, unit) => setPositionPair('horizontal', value, unit)}
                  />
                </div>
                <div className={styles.pairItem}>
                  <span className={styles.pairTitle}>顶</span>
                  <MultiPropNumber
                    raw={multiPart(style.backgroundPosition, 1)}
                    placeholder="auto"
                    min={-10}
                    onChange={(value, unit) => setPositionPair('vertical', value, unit)}
                  />
                </div>
              </div>
            </div>
          </Row>

          <Row title="重复显示" longTitle active={style.backgroundRepeat !== undefined}>
            <IconRadioGroup
              items={BG_REPEAT_ITEMS}
              icons={BG_REPEAT_ICONS}
              value={bgRepeatType}
              onChange={(value) => {
                setBgRepeatType(value ?? null);
                onStyleChange('backgroundRepeat', value);
              }}
            />
          </Row>
        </>
      ) : null}

      {/* 引擎 font 与 background 两个模块都有一条透明度行，这里照抄 */}
      <OpacityRow style={style} onStyleChange={onStyleChange} />
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/* 位置（引擎 pro/position + positionBox）                               */
/* ------------------------------------------------------------------ */

export function PositionModule({ style, onStyleChange, batch }: StyleModuleProps) {
  const [template, setTemplate] = useState<string | null>(null);
  const position = toText(style.position);
  const showBox = position !== '' && position !== 'static';

  /** 引擎 onPositionTempleteChange：一次写四个方向（0 或删键） */
  const applyTemplate = (value: string | undefined) => {
    setTemplate(value ?? null);
    if (!value) return;
    const presets: Record<string, Record<string, unknown>> = {
      topLeft: { top: 0, left: 0, bottom: undefined, right: undefined },
      topRight: { top: 0, right: 0, left: undefined, bottom: undefined },
      bottomLeft: { bottom: 0, left: 0, top: undefined, right: undefined },
      bottomRight: { bottom: 0, right: 0, top: undefined, left: undefined },
    };
    batch(Object.entries(presets[value] ?? {}).map(([key, val]) => ({ key, value: val })));
  };

  return (
    <ModuleCard title="位置" defaultOpen>
      <Row title="定位" active={style.position !== undefined}>
        <StyleSelect
          value={style.position}
          options={POSITION_OPTIONS}
          placeholder="请选择"
          onChange={(value) => onStyleChange('position', value)}
        />
      </Row>

      {showBox ? (
        <>
          {position === 'absolute' ? (
            <Row title=" " active={template !== null}>
              <IconRadioGroup
                items={POSITION_TEMPLATES}
                icons={POSITION_TEMPLATE_ICONS}
                value={template}
                onChange={applyTemplate}
              />
            </Row>
          ) : null}
          <PositionBox style={style} onStyleChange={onStyleChange} />
        </>
      ) : null}

      <Row title="zIndex" active={style.zIndex !== undefined}>
        <PlainNumber
          value={style.zIndex}
          disabled={isVarBind(style.zIndex)}
          onChange={(value) => onStyleChange('zIndex', value)}
        />
      </Row>

      <Row title="浮动方向" longTitle active={style.float !== undefined}>
        <IconRadioGroup
          items={FLOAT_ITEMS}
          icons={FLOAT_ICONS}
          value={style.float}
          onChange={(value) => onStyleChange('float', value)}
        />
      </Row>

      <Row title="清除" active={style.clear !== undefined}>
        <IconRadioGroup
          items={CLEAR_ITEMS}
          icons={CLEAR_ICONS}
          value={style.clear}
          onChange={(value) => onStyleChange('clear', value)}
        />
      </Row>
    </ModuleCard>
  );
}

/** 引擎 positionBox.tsx 的 3D 梯形盒（30px 边框） */
function PositionBox({ style, onStyleChange }: Pick<StyleModuleProps, 'style' | 'onStyleChange'>) {
  const faceClass: Record<string, string> = {
    top: styles.posFaceTop!,
    right: styles.posFaceRight!,
    bottom: styles.posFaceBottom!,
    left: styles.posFaceLeft!,
  };
  return (
    <div className={styles.positionBox}>
      {(['top', 'right', 'bottom', 'left'] as const).map((key) => (
        <div key={key} className={cn(styles.posFace, faceClass[key])}>
          <PositionInput
            value={style[key]}
            onCommit={(value) => onStyleChange(key, value)}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 边框（引擎 pro/border）                                               */
/* ------------------------------------------------------------------ */

export function BorderModule({ style, onStyleChange, batch }: StyleModuleProps) {
  const [radiusType, setRadiusType] = useState<string | null>(null);
  const [borderDirection, setBorderDirection] = useState<string | null>(null);
  const [shadow, setShadow] = useState('');
  const signature = JSON.stringify(style);

  useEffect(() => {
    // 引擎 init：有 borderRadius → 固定圆角；否则任一角 → 分别定义
    setRadiusType(
      style.borderRadius
        ? 'fixedBorder'
        : RADIUS_CORNERS.some((corner) => style[corner.key])
          ? 'partBorder'
          : null,
    );
    // 引擎只在未选中时从 styleData 推断一次方向，之后保持用户选择
    setBorderDirection((previous) => {
      if (previous) return previous;
      for (const key of Object.keys(style)) {
        const found = BORDER_DIRECTIONS.find((item) => item.key !== 'border' && key.indexOf(item.key) >= 0);
        if (found) return found.key;
        if (key === 'border') return 'border';
      }
      return null;
    });
    const parts = toText(style.boxShadow).trim().split(/\s+/).filter(Boolean);
    setShadow(parts[0] === 'inset' ? 'insetShadow' : parts.length > 0 ? 'outerShadow' : '');
  }, [signature]);

  /** 引擎 onRangeChange：写 borderRadius 同时清掉四个分角，避免两种圆角冲突 */
  const commitFixedRadius = (value: string | undefined) => {
    batch([
      { key: 'borderRadius', value },
      ...RADIUS_CORNERS.map((corner) => ({ key: corner.key, value: undefined })),
    ]);
  };

  /** 引擎 onPartBorderRadiusChange：写某个角时清掉 borderRadius */
  const commitCorner = (key: string, value: string | undefined) => {
    const changes: Array<{ key: string; value: unknown }> = [{ key, value }];
    if (style.borderRadius) changes.push({ key: 'borderRadius', value: undefined });
    batch(changes);
  };

  /** 引擎 onBoxShadowChange：五段数组就地替换；inset 会让所有序号 +1 */
  const applyShadow = (
    raw: unknown,
    index?: number,
    unit?: string,
    shadowPosition?: string,
    isColor?: boolean,
  ) => {
    const text = toText(style.boxShadow).trim();
    const parts = text ? text.split(/\s+/) : [...SHADOW_DEFAULT];
    if (shadowPosition === 'outerShadow' && parts[0] === 'inset') parts.shift();
    else if (shadowPosition === 'insetShadow' && parts[0] !== 'inset') parts.unshift('inset');
    setShadow(parts[0] === 'inset' ? 'insetShadow' : 'outerShadow');

    let value = raw;
    if ((!value || isNil(value)) && isColor) value = '#000';
    if (isNil(value) || value === '') return;
    const unified = unit ? addUnit(value, unit) : String(value);
    if (index !== undefined && unified !== null) parts[index] = unified;
    onStyleChange('boxShadow', parts.join(' '));
  };

  const radiusValue = Number(splitUnit(style.borderRadius).value) || 0;
  const shadowText = toText(style.boxShadow).trim();
  const shadowParts = shadowText ? shadowText.split(/\s+/) : [...SHADOW_DEFAULT];
  const shift = shadow === 'insetShadow' ? 1 : 0;
  const widthKey = borderDirection ? `${borderDirection}Width` : '';
  const colorKey = borderDirection ? `${borderDirection}Color` : '';
  const styleKey = borderDirection ? `${borderDirection}Style` : '';

  return (
    <ModuleCard title="边框" defaultOpen>
      <Row title="圆角" active={radiusType !== null}>
        <IconRadioGroup
          items={RADIUS_TYPE_ITEMS}
          icons={RADIUS_TYPE_ICONS}
          value={radiusType}
          onChange={(value) => setRadiusType(value ?? null)}
        />
      </Row>

      {radiusType === 'fixedBorder' ? (
        <Row title=" " active={style.borderRadius !== undefined}>
          <div className={styles.radiusRange}>
            <Slider
              min={0}
              max={BORDER_MAX}
              step={1}
              value={[Math.min(BORDER_MAX, radiusValue)]}
              onValueChange={([next]) => commitFixedRadius(`${next ?? 0}px`)}
            />
            <UnitNumberInput
              value={style.borderRadius}
              min={0}
              max={BORDER_MAX}
              className={styles.radiusNumber}
              onChange={commitFixedRadius}
            />
          </div>
        </Row>
      ) : null}

      {radiusType === 'partBorder' ? (
        <>
          <div className={styles.cornerRow}>
            {RADIUS_CORNERS.slice(0, 2).map((corner) => (
              <div key={corner.key} className={styles.cornerItem}>
                <span className={styles.cornerIcon}>
                  <EngineIcon name={corner.icon} />
                </span>
                <UnitNumberInput
                  value={style[corner.key]}
                  min={0}
                  max={BORDER_MAX}
                  onChange={(value) => commitCorner(corner.key, value)}
                />
              </div>
            ))}
          </div>
          <div className={styles.cornerRow}>
            {RADIUS_CORNERS.slice(2, 4).map((corner) => (
              <div key={corner.key} className={styles.cornerItem}>
                <span className={styles.cornerIcon}>
                  <EngineIcon name={corner.icon} />
                </span>
                <UnitNumberInput
                  value={style[corner.key]}
                  min={0}
                  max={BORDER_MAX}
                  onChange={(value) => commitCorner(corner.key, value)}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}

      <Row title="边框" active={borderDirection !== null}>
        <div className={styles.borderLayout}>
          <div className={styles.borderIconGrid}>
            {BORDER_DIRECTIONS.map((item, index) => (
              <button
                key={item.key}
                type="button"
                title={item.key}
                aria-pressed={borderDirection === item.key}
                className={cn(
                  styles.iconBtn,
                  styles[`borderCell${index}` as keyof typeof styles],
                  borderDirection === item.key && styles.iconBtnActive,
                )}
                onClick={() => setBorderDirection(item.key)}
              >
                <EngineIcon name={item.icon} />
              </button>
            ))}
          </div>
          {borderDirection ? (
            <div className={styles.borderFields}>
              <UnitNumberInput
                value={style[widthKey]}
                min={0}
                max={BORDER_MAX}
                onChange={(value) => onStyleChange(widthKey, value)}
              />
              <ColorInput
                value={style[colorKey]}
                onChange={(value) => onStyleChange(colorKey, value)}
              />
              <StyleSelect
                value={style[styleKey]}
                options={BORDER_STYLE_OPTIONS}
                placeholder="请选择"
                onChange={(value) => onStyleChange(styleKey, value)}
              />
            </div>
          ) : null}
        </div>
      </Row>

      <Row title="阴影" active={shadow !== ''}>
        <IconRadioGroup
          items={SHADOW_ITEMS}
          icons={SHADOW_ICONS}
          value={shadow}
          onChange={(value) => {
            // 引擎把 shadowPosition 一起传进去，仅增删首段 inset
            applyShadow(value, undefined, undefined, value ?? undefined);
          }}
        />
      </Row>

      <div className={styles.shadowGrid}>
        <div className={styles.shadowRow}>
          <span className={styles.shadowLabel}>阴影颜色</span>
          <ColorInput
            value={shadowParts[shift + 4]}
            onChange={(value) => applyShadow(value, shift + 4, undefined, undefined, true)}
          />
        </div>
        <div className={styles.shadowRow}>
          <div className={styles.shadowItem}>
            <span className={styles.shadowLabel}>x</span>
            <MultiPropNumber
              raw={shadowParts[shift]}
              units={['px']}
              onChange={(value, unit) => applyShadow(value, shift, unit)}
            />
          </div>
          <div className={styles.shadowItem}>
            <span className={styles.shadowLabel}>y</span>
            <MultiPropNumber
              raw={shadowParts[shift + 1]}
              units={['px']}
              onChange={(value, unit) => applyShadow(value, shift + 1, unit)}
            />
          </div>
        </div>
        <div className={styles.shadowRow}>
          <div className={styles.shadowItem}>
            <span className={styles.shadowLabel}>模糊</span>
            <MultiPropNumber
              raw={shadowParts[shift + 2]}
              units={['px']}
              min={2}
              onChange={(value, unit) => applyShadow(value, shift + 2, unit)}
            />
          </div>
          <div className={styles.shadowItem}>
            <span className={styles.shadowLabel}>扩展</span>
            <MultiPropNumber
              raw={shadowParts[shift + 3]}
              units={['px']}
              min={3}
              onChange={(value, unit) => applyShadow(value, shift + 3, unit)}
            />
          </div>
        </div>
      </div>
    </ModuleCard>
  );
}
