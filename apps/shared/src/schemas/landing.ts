import type { PageSchema } from '@lowcode-next/protocol';

/**
 * 原子组件示例页（§12.16）：用这批 14 个原子物料，演示它们自己。
 *
 * 物料面板只保留原子组件后，页面没有 Stack / Section 这类容器可用了 ——
 * 所以这份 schema 是**纯纵向流**：块级组件（Typography / Input / Alert…）
 * 依次往下排，行内组件（Tag / Link / Button）天然并排。
 * 页面根是隐藏的 `Page` 壳，它不吃面板位置、只负责渲染与容纳。
 *
 * 这份 schema 手写，兼当「协议长什么样」的可执行文档。
 */

export const landingSchema: PageSchema = {
  version: '1.0.1',
  componentsMap: [
    { componentName: 'Page', package: '@lowcode-next/renderer', exportName: 'Page' },
    { componentName: 'Typography', package: '@lowcode-next/renderer', exportName: 'Typography' },
    { componentName: 'Link', package: '@lowcode-next/renderer', exportName: 'Link' },
    { componentName: 'Button', package: '@lowcode-next/renderer', exportName: 'Button' },
    { componentName: 'Input', package: '@lowcode-next/renderer', exportName: 'Input' },
    { componentName: 'TextArea', package: '@lowcode-next/renderer', exportName: 'TextArea' },
    { componentName: 'Select', package: '@lowcode-next/renderer', exportName: 'Select' },
    { componentName: 'Checkbox', package: '@lowcode-next/renderer', exportName: 'Checkbox' },
    { componentName: 'Switch', package: '@lowcode-next/renderer', exportName: 'Switch' },
    { componentName: 'Tag', package: '@lowcode-next/renderer', exportName: 'Tag' },
    { componentName: 'Divider', package: '@lowcode-next/renderer', exportName: 'Divider' },
    { componentName: 'Image', package: '@lowcode-next/renderer', exportName: 'Image' },
    { componentName: 'Progress', package: '@lowcode-next/renderer', exportName: 'Progress' },
    { componentName: 'Empty', package: '@lowcode-next/renderer', exportName: 'Empty' },
    { componentName: 'Alert', package: '@lowcode-next/renderer', exportName: 'Alert' },
  ],
  componentsTree: {
    id: 'page_root',
    componentName: 'Page',
    props: {
      style: {
        maxWidth: 720,
        margin: '0 auto',
        padding: '56px 24px 80px',
      },
    },
    children: [
      /* ---------------- 首屏 ---------------- */
      {
        id: 'hero_tag',
        componentName: 'Tag',
        props: { tone: 'accent' },
        children: ['v1.0 · 原子组件示例'],
      },
      {
        id: 'hero_title',
        componentName: 'Typography',
        props: { type: 'h1', tone: 'gradient' },
        children: ['把页面的结构，还给数据'],
      },
      {
        id: 'hero_desc',
        componentName: 'Typography',
        props: { type: 'body', tone: 'muted', style: { marginTop: 12 } },
        children: [
          '组件库面板里只有这一批原子组件。页面根是一个隐藏的 Page 壳 —— 选中它改样式，或者从面板拖任意组件进来，落点就是页面本身。',
        ],
      },
      {
        id: 'hero_btn_primary',
        componentName: 'Button',
        props: { variant: 'primary', size: 'lg', style: { marginTop: 18 } },
        children: ['拖一个组件试试'],
      },
      {
        id: 'hero_btn_ghost',
        componentName: 'Button',
        props: { variant: 'ghost', size: 'lg', style: { marginLeft: 10 } },
        children: ['选中节点按 Delete'],
      },
      {
        id: 'hero_link_doc',
        componentName: 'Link',
        props: { href: '#', tone: 'default', style: { display: 'inline-block', marginTop: 14 } },
        children: ['设计文档'],
      },
      {
        id: 'hero_link_schema',
        componentName: 'Link',
        props: { href: '#', tone: 'default', style: { marginLeft: 14 } },
        children: ['协议'],
      },

      {
        id: 'divider_1',
        componentName: 'Divider',
        props: { spacing: 34 },
      },

      /* ---------------- 录入演示 ---------------- */
      {
        id: 'form_title',
        componentName: 'Typography',
        props: { type: 'h2' },
        children: ['录入组件是受控的'],
      },
      {
        id: 'form_desc',
        componentName: 'Typography',
        props: { type: 'body', tone: 'muted', style: { marginTop: 8 } },
        children: [
          '在这里打字、勾选、切换，值会实时写回 schema（走 command，undo/redo 生效），属性面板同步显示。',
        ],
      },
      {
        id: 'form_name_label',
        componentName: 'Typography',
        props: { type: 'caption', tone: 'muted', style: { marginTop: 20 } },
        children: ['单行输入'],
      },
      {
        id: 'form_name',
        componentName: 'Input',
        props: { value: '', placeholder: '输入点什么试试', style: { marginTop: 6 } },
      },
      {
        id: 'form_bio_label',
        componentName: 'Typography',
        props: { type: 'caption', tone: 'muted', style: { marginTop: 14 } },
        children: ['多行输入'],
      },
      {
        id: 'form_bio',
        componentName: 'TextArea',
        props: { value: '', placeholder: '写点介绍', rows: 3, style: { marginTop: 6 } },
      },
      {
        id: 'form_city_label',
        componentName: 'Typography',
        props: { type: 'caption', tone: 'muted', style: { marginTop: 14 } },
        children: ['下拉选择'],
      },
      {
        id: 'form_city',
        componentName: 'Select',
        props: {
          value: '',
          options: ['北京', '上海', '深圳'],
          style: { marginTop: 6 },
        },
      },
      {
        id: 'form_check',
        componentName: 'Checkbox',
        props: { label: '我已阅读说明', checked: true, style: { marginTop: 16 } },
      },
      {
        id: 'form_switch',
        componentName: 'Switch',
        props: { label: '自动保存', checked: true, style: { marginTop: 10 } },
      },

      {
        id: 'divider_2',
        componentName: 'Divider',
        props: { spacing: 34 },
      },

      /* ---------------- 展示演示 ---------------- */
      {
        id: 'show_title',
        componentName: 'Typography',
        props: { type: 'h2' },
        children: ['展示组件'],
      },
      {
        id: 'show_tags',
        componentName: 'Typography',
        props: { type: 'caption', tone: 'muted', style: { marginTop: 14 } },
        children: ['标签'],
      },
      {
        id: 'show_tag_new',
        componentName: 'Tag',
        props: { tone: 'accent', style: { marginTop: 6 } },
        children: ['新功能'],
      },
      {
        id: 'show_tag_beta',
        componentName: 'Tag',
        props: { tone: 'neutral', style: { marginLeft: 8 } },
        children: ['Beta'],
      },
      {
        id: 'show_tag_warn',
        componentName: 'Tag',
        props: { tone: 'warning', style: { marginLeft: 8 } },
        children: ['实验性'],
      },
      {
        id: 'show_progress_label',
        componentName: 'Typography',
        props: { type: 'caption', tone: 'muted', style: { marginTop: 20 } },
        children: ['进度'],
      },
      {
        id: 'show_progress',
        componentName: 'Progress',
        props: { percent: 64, showText: true, style: { marginTop: 6 } },
      },
      {
        id: 'show_alert',
        componentName: 'Alert',
        props: {
          type: 'info',
          title: '这是一条提示',
          description: '运行态可以关闭；编辑态关掉只是内部状态，节点仍在 schema 里，所以面板禁用了关闭。',
          style: { marginTop: 18 },
        },
      },
      {
        id: 'show_image',
        componentName: 'Image',
        props: { alt: '图片占位', style: { marginTop: 18, height: 160 } },
      },
      {
        id: 'show_empty',
        componentName: 'Empty',
        props: { text: '这里是空状态 —— 没有数据时的兜底视图', style: { marginTop: 18 } },
      },
    ],
  },
  // 页面数据源（lowcode 协议的 dataSource.list）：一条 fetch 指向本服务的 mock，
  // 数据源面板打开就有东西可看、可调试。
  dataSource: {
    list: [
      {
        id: 'info',
        type: 'fetch',
        description: '引擎元信息（mock）',
        isInit: true,
        options: { uri: '/mock/info.json', method: 'GET', timeout: 5000 },
      },
    ],
  },
};
