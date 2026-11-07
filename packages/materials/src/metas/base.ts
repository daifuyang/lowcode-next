import { defineMaterial, propOptions } from '@lowcode-next/protocol';
import type { ComponentMeta } from '@lowcode-next/protocol';

/**
 * 原子物料的描述（14 个，2026-11-07 按 lowcode 基础示例对齐）。
 *
 * 分组顺序即物料面板顺序：文字 → 操作 → 录入 → 展示。
 *
 * **这里的取舍**
 *
 * - `Typography` 合并了原来的 `Heading` + `Text`：两者的 tone / align / weight /
 *   mono 逐项相同，只差标签，合成一个 `type` 属性（h1–h4 / body / caption）更贴近
 *   antd 的 `Typography`，面板也少一栏让人犹豫的选择。
 * - `Tag` 由 `Badge` 改名：它做的是分类/状态标签，业界（antd Tag）都这么叫；
 *   Badge 指的是数字角标（未读数那种），不是同一个东西。
 * - 删掉 `Icon` 与 `Spacer`：前者是"往 span 里打一个字符"，不是图标组件 ——
 *   真图标要图标集，而物料包不该依赖它；后者 `style.margin` 就能表达，
 *   留着只会让 schema 堆满无意义节点。
 *
 * 常量一律导出 —— 两套视图层的实现 import 它们做 `pick()` 校验，与 meta 的
 * `propOptions()` 共用同一个数组，面板下拉和画布渲染不可能抄漏一个选项。
 */

/* ------------------------------------------------------------------ */
/* 共用枚举                                                            */
/* ------------------------------------------------------------------ */

export const ALIGNS = ['left', 'center', 'right'] as const;
export const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;

export const ALIGN_LABEL: Record<string, string> = { left: '左', center: '中', right: '右' };

export const WEIGHT_LABEL: Record<string, string> = {
  normal: '常规',
  medium: '中等',
  semibold: '半粗',
  bold: '粗',
};

/** 语义字重 → 数值。实现里拼进 inline style，不在 CSS 里重复定义 */
export const WEIGHT_VALUE: Record<(typeof WEIGHTS)[number], number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/* ------------------------------------------------------------------ */
/* Typography —— 原 Heading + Text 合并                                */
/* ------------------------------------------------------------------ */

export const TYPOGRAPHY_TYPES = ['h1', 'h2', 'h3', 'h4', 'body', 'caption'] as const;

/** `type` 同时决定"渲染成哪个标签"和"默认多大字号"，实现里查这张表 */
export const TYPOGRAPHY_TAG: Record<(typeof TYPOGRAPHY_TYPES)[number], string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  body: 'p',
  caption: 'span',
};

/**
 * 色调取两个旧枚举的并集。
 *
 * `gradient` 只在标题上有意义，但不禁用 —— 正文用渐变文字是排版上的合法选择，
 * 物料层不该替用户做审美判断。
 */
export const TYPOGRAPHY_TONES = [
  'default',
  'muted',
  'subtle',
  'primary',
  'invert',
  'invert-strong',
  'gradient',
] as const;

export const TYPOGRAPHY_TYPE_LABEL: Record<string, string> = {
  h1: '大标题',
  h2: '标题',
  h3: '小标题',
  h4: '次标题',
  body: '正文',
  caption: '辅助文字',
};

export const TONE_LABEL: Record<string, string> = {
  default: '默认',
  muted: '次要',
  subtle: '弱化',
  primary: '主色',
  invert: '反色',
  'invert-strong': '反色强调',
  gradient: '渐变',
};

export const typographyMaterial: ComponentMeta = defineMaterial({
  componentName: 'Typography',
  title: '文字',
  group: '文字',
  props: {
    type: {
      title: '类型',
      type: 'string',
      defaultValue: 'body',
      options: propOptions(TYPOGRAPHY_TYPES, TYPOGRAPHY_TYPE_LABEL),
    },
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(TYPOGRAPHY_TONES, TONE_LABEL),
    },
    align: {
      title: '对齐',
      type: 'string',
      defaultValue: 'left',
      options: propOptions(ALIGNS, ALIGN_LABEL),
    },
    weight: {
      title: '字重',
      type: 'string',
      defaultValue: 'normal',
      options: propOptions(WEIGHTS, WEIGHT_LABEL),
    },
    mono: { title: '等宽', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true, loop: true },
  },
  defaultSchema: {
    componentName: 'Typography',
    props: { type: 'body', tone: 'default' },
    children: ['在这里写一段说明文字。'],
  },
});

/* ------------------------------------------------------------------ */
/* Link                                                               */
/* ------------------------------------------------------------------ */

export const LINK_TONES = ['default', 'invert', 'muted'] as const;

export const linkMaterial: ComponentMeta = defineMaterial({
  componentName: 'Link',
  title: '链接',
  group: '文字',
  props: {
    href: { title: '地址', type: 'string', defaultValue: '#' },
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(LINK_TONES, { default: '默认', invert: '反色', muted: '次要' }),
    },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Link',
    props: { href: '#' },
    children: ['链接'],
  },
});

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

export const BUTTON_VARIANTS = ['primary', 'default', 'ghost', 'outline'] as const;
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;

export const BUTTON_VARIANT_LABEL: Record<string, string> = {
  primary: '主按钮',
  default: '次按钮',
  ghost: '文字按钮',
  outline: '描边按钮',
};

export const BUTTON_SIZE_LABEL: Record<string, string> = { sm: '小', md: '中', lg: '大' };

export const buttonMaterial: ComponentMeta = defineMaterial({
  componentName: 'Button',
  title: '按钮',
  group: '操作',
  props: {
    variant: {
      title: '风格',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(BUTTON_VARIANTS, BUTTON_VARIANT_LABEL),
    },
    size: {
      title: '尺寸',
      type: 'string',
      defaultValue: 'md',
      options: propOptions(BUTTON_SIZES, BUTTON_SIZE_LABEL),
    },
    block: { title: '撑满', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Button',
    props: { variant: 'primary' },
    children: ['按钮'],
  },
});

/* ------------------------------------------------------------------ */
/* 录入：Input / TextArea / Select / Checkbox / Switch                 */
/* ------------------------------------------------------------------ */

/** 录入类共用尺寸档，语义与 Button 的 sm/md/lg 一致 */
export const FIELD_SIZES = ['sm', 'md', 'lg'] as const;
export const FIELD_SIZE_LABEL: Record<string, string> = { sm: '小', md: '中', lg: '大' };

/**
 * 录入类组件都**受控**：值为 `props.value`，改动经 `PROP_SETTER` 回写。
 *
 * 编辑态有 setter，打字即改 schema；运行态没有 setter，组件退回内部 state
 * （见 `materials-react` 的 `useFieldValue`）。两条路读的都是同一个 `props.value`，
 * 所以编辑器里看到的值就是线上初始值。
 */
export const inputMaterial: ComponentMeta = defineMaterial({
  componentName: 'Input',
  title: '输入框',
  group: '录入',
  props: {
    value: { title: '值', type: 'string', defaultValue: '' },
    placeholder: { title: '占位提示', type: 'string', defaultValue: '请输入' },
    size: {
      title: '尺寸',
      type: 'string',
      defaultValue: 'md',
      options: propOptions(FIELD_SIZES, FIELD_SIZE_LABEL),
    },
    disabled: { title: '禁用', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Input',
    props: { value: '', placeholder: '请输入' },
  },
});

export const textAreaMaterial: ComponentMeta = defineMaterial({
  componentName: 'TextArea',
  title: '多行输入',
  group: '录入',
  props: {
    value: { title: '值', type: 'string', defaultValue: '' },
    placeholder: { title: '占位提示', type: 'string', defaultValue: '请输入' },
    // 长文本属性面板用多行控件，单行输入写到一半就看不见前面了
    rows: { title: '行数', type: 'number', defaultValue: 3 },
    disabled: { title: '禁用', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'TextArea',
    props: { value: '', placeholder: '请输入', rows: 3 },
  },
});

export const selectMaterial: ComponentMeta = defineMaterial({
  componentName: 'Select',
  title: '下拉选择',
  group: '录入',
  props: {
    value: { title: '值', type: 'string', defaultValue: '' },
    // 选项走 JSON 控件：属性面板里是 ["选项一","选项二"]，改完立刻反映到画布
    options: {
      title: '选项',
      type: 'array',
      defaultValue: ['选项一', '选项二', '选项三'],
    },
    size: {
      title: '尺寸',
      type: 'string',
      defaultValue: 'md',
      options: propOptions(FIELD_SIZES, FIELD_SIZE_LABEL),
    },
    disabled: { title: '禁用', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Select',
    props: { value: '', options: ['选项一', '选项二', '选项三'] },
  },
});

export const checkboxMaterial: ComponentMeta = defineMaterial({
  componentName: 'Checkbox',
  title: '多选框',
  group: '录入',
  props: {
    label: { title: '文案', type: 'string', defaultValue: '选项' },
    checked: { title: '选中', type: 'bool', defaultValue: true },
    disabled: { title: '禁用', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Checkbox',
    props: { label: '选项', checked: true },
  },
});

export const switchMaterial: ComponentMeta = defineMaterial({
  componentName: 'Switch',
  title: '开关',
  group: '录入',
  props: {
    label: { title: '文案', type: 'string' },
    checked: { title: '开启', type: 'bool', defaultValue: true },
    disabled: { title: '禁用', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Switch',
    props: { checked: true },
  },
});

/* ------------------------------------------------------------------ */
/* 展示：Tag / Divider / Image / Progress / Empty / Alert              */
/* ------------------------------------------------------------------ */

export const TAG_TONES = [
  'accent',
  'neutral',
  'success',
  'warning',
  'error',
  'invert',
  'outline',
] as const;

export const TAG_TONE_LABEL: Record<string, string> = {
  accent: '强调',
  neutral: '中性',
  success: '成功',
  warning: '警告',
  error: '错误',
  invert: '反色',
  outline: '描边',
};

export const tagMaterial: ComponentMeta = defineMaterial({
  componentName: 'Tag',
  title: '标签',
  group: '展示',
  props: {
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'accent',
      options: propOptions(TAG_TONES, TAG_TONE_LABEL),
    },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Tag',
    props: { tone: 'accent' },
    children: ['新'],
  },
});

export const dividerMaterial: ComponentMeta = defineMaterial({
  componentName: 'Divider',
  title: '分割线',
  group: '展示',
  props: {
    spacing: { title: '上下间距', type: 'number', defaultValue: 0 },
    invert: { title: '反色', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Divider',
    props: { spacing: 20 },
  },
});

export const imageMaterial: ComponentMeta = defineMaterial({
  componentName: 'Image',
  title: '图片',
  group: '展示',
  props: {
    src: { title: '图片地址', type: 'string' },
    alt: { title: '替代文本', type: 'string' },
    radius: { title: '圆角', type: 'number', defaultValue: 12 },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Image',
    props: { alt: '图片', radius: 12 },
  },
});

export const PROGRESS_TONES = ['default', 'success', 'warning', 'error'] as const;

export const PROGRESS_TONE_LABEL: Record<string, string> = {
  default: '主色',
  success: '成功',
  warning: '警告',
  error: '错误',
};

export const progressMaterial: ComponentMeta = defineMaterial({
  componentName: 'Progress',
  title: '进度条',
  group: '展示',
  props: {
    percent: { title: '进度', type: 'number', defaultValue: 40 },
    tone: {
      title: '色调',
      type: 'string',
      defaultValue: 'default',
      options: propOptions(PROGRESS_TONES, PROGRESS_TONE_LABEL),
    },
    showText: { title: '显示百分比', type: 'bool', defaultValue: true },
    height: { title: '粗细', type: 'number', defaultValue: 8 },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Progress',
    props: { percent: 40, tone: 'default' },
  },
});

export const emptyMaterial: ComponentMeta = defineMaterial({
  componentName: 'Empty',
  title: '空状态',
  group: '展示',
  props: {
    text: { title: '说明', type: 'string', defaultValue: '暂无数据' },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Empty',
    props: { text: '暂无数据' },
  },
});

export const ALERT_TYPES = ['info', 'success', 'warning', 'error'] as const;

export const ALERT_TYPE_LABEL: Record<string, string> = {
  info: '提示',
  success: '成功',
  warning: '警告',
  error: '错误',
};

export const alertMaterial: ComponentMeta = defineMaterial({
  componentName: 'Alert',
  title: '提示条',
  group: '展示',
  props: {
    type: {
      title: '类型',
      type: 'string',
      defaultValue: 'info',
      options: propOptions(ALERT_TYPES, ALERT_TYPE_LABEL),
    },
    title: { title: '标题', type: 'string', defaultValue: '提示' },
    description: {
      title: '描述',
      type: 'string',
      defaultValue: '这里是一段补充说明。',
      setter: 'TextAreaSetter',
    },
    closable: { title: '可关闭', type: 'bool', defaultValue: false },
    style: { title: '样式', type: 'object' },
  },
  configure: {
    component: {},
    supports: { style: true, condition: true },
  },
  defaultSchema: {
    componentName: 'Alert',
    props: { type: 'info', title: '提示', description: '这里是一段补充说明。' },
  },
});
