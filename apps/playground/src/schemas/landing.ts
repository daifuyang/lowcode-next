import type { PageSchema } from '@lowcode-next/protocol';

/**
 * 落地页示例：用这套引擎自己的物料，介绍它自己。
 *
 * 这份 schema 是手写的，不是拖出来的 —— 目的有两个：
 * 1. 当 playground 的启动内容，打开就是一个像样的页面，而不是两个按钮；
 * 2. 当"协议长什么样"的可执行文档，把 loop / condition / style 覆盖口
 *    这些能力在真实结构里用一遍。
 */

const PROTOCOL_SNIPPET = `componentsTree: {
  id: 'hero_title',
  componentName: 'Heading',
  props: { level: 1, tone: 'gradient' },
  children: ['把页面的结构，还给数据'],
}`;

export const landingSchema: PageSchema = {
  version: '1.0.1',
  componentsMap: [
    { componentName: 'Div', package: '@lowcode-next/renderer', exportName: 'Div' },
    { componentName: 'Stack', package: '@lowcode-next/renderer', exportName: 'Stack' },
    { componentName: 'Grid', package: '@lowcode-next/renderer', exportName: 'Grid' },
    { componentName: 'Section', package: '@lowcode-next/renderer', exportName: 'Section' },
    { componentName: 'Card', package: '@lowcode-next/renderer', exportName: 'Card' },
    { componentName: 'Heading', package: '@lowcode-next/renderer', exportName: 'Heading' },
    { componentName: 'Text', package: '@lowcode-next/renderer', exportName: 'Text' },
    { componentName: 'Button', package: '@lowcode-next/renderer', exportName: 'Button' },
    { componentName: 'Link', package: '@lowcode-next/renderer', exportName: 'Link' },
    { componentName: 'Badge', package: '@lowcode-next/renderer', exportName: 'Badge' },
    { componentName: 'Divider', package: '@lowcode-next/renderer', exportName: 'Divider' },
    { componentName: 'Navbar', package: '@lowcode-next/renderer', exportName: 'Navbar' },
    { componentName: 'Hero', package: '@lowcode-next/renderer', exportName: 'Hero' },
    { componentName: 'FeatureCard', package: '@lowcode-next/renderer', exportName: 'FeatureCard' },
    { componentName: 'Stat', package: '@lowcode-next/renderer', exportName: 'Stat' },
    { componentName: 'CodeBlock', package: '@lowcode-next/renderer', exportName: 'CodeBlock' },
    { componentName: 'Footer', package: '@lowcode-next/renderer', exportName: 'Footer' },
  ],
  componentsTree: {
    id: 'root',
    componentName: 'Div',
    props: {
      style: {
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        // 白底由画布文档 canvas.css 的 html/body 提供，这里不要再写 background
        // 简写：属性面板会写 backgroundSize 这类非简写属性，React 不允许简写与
        // 非简写混用（删除 backgroundSize 时会报 warning）；写 backgroundColor
        // 也不行，会让背景模块每次 style 变化都把 bgType 反推成「颜色填充」。
      },
    },
    children: [
      /* ---------------- 导航 ---------------- */
      {
        id: 'nav',
        componentName: 'Navbar',
        props: { brand: 'lowcode-next', mark: 'L' },
        children: [
          {
            id: 'nav_link_feature',
            componentName: 'Link',
            props: { href: '#features', tone: 'muted' },
            children: ['核心能力'],
          },
          {
            id: 'nav_link_arch',
            componentName: 'Link',
            props: { href: '#packages', tone: 'muted' },
            children: ['五个包'],
          },
          {
            id: 'nav_link_schema',
            componentName: 'Link',
            props: { href: '#schema', tone: 'muted' },
            children: ['协议'],
          },
          {
            id: 'nav_cta',
            componentName: 'Button',
            props: { variant: 'primary', size: 'sm' },
            children: ['拖一个物料'],
          },
        ],
      },

      /* ---------------- 首屏 ---------------- */
      {
        id: 'hero',
        componentName: 'Hero',
        children: [
          {
            id: 'hero_stack',
            componentName: 'Stack',
            props: { direction: 'column', align: 'center', gap: 22 },
            children: [
              {
                id: 'hero_badge',
                componentName: 'Badge',
                props: { tone: 'invert' },
                children: ['v1.0 · M0–M5 已跑通'],
              },
              {
                id: 'hero_title',
                componentName: 'Heading',
                props: { level: 1, tone: 'gradient', align: 'center' },
                children: ['把页面的结构，还给数据'],
              },
              {
                id: 'hero_desc',
                componentName: 'Text',
                props: {
                  size: 'lg',
                  tone: 'invert',
                  align: 'center',
                  style: { maxWidth: 620 },
                },
                children: [
                  'lowcode-next 是一套从 schema 协议、可变文档模型、三段式渲染，到几何拖拽引擎全部自研的低代码内核。拖拽层不认识 React，框架无关不是文档里的口号。',
                ],
              },
              {
                id: 'hero_actions',
                componentName: 'Stack',
                props: { direction: 'row', gap: 12, justify: 'center', align: 'center', wrap: true },
                children: [
                  {
                    id: 'hero_action_drag',
                    componentName: 'Button',
                    props: { variant: 'primary', size: 'lg' },
                    children: ['从左边拖一个物料'],
                  },
                  {
                    id: 'hero_action_code',
                    componentName: 'Button',
                    props: { variant: 'ghost', size: 'lg' },
                    children: ['看看它怎么算落点'],
                  },
                ],
              },
              {
                id: 'hero_divider',
                componentName: 'Divider',
                props: { spacing: 18, invert: true, style: { maxWidth: 640 } },
              },
              {
                id: 'hero_stats',
                componentName: 'Stack',
                props: {
                  direction: 'row',
                  gap: 52,
                  justify: 'center',
                  align: 'center',
                  wrap: true,
                },
                children: [
                  {
                    id: 'hero_stat_packages',
                    componentName: 'Stat',
                    props: { value: '5', suffix: '个', label: '从协议到设计器的自研包', invert: true },
                  },
                  {
                    id: 'hero_stat_tests',
                    componentName: 'Stat',
                    props: { value: '65', suffix: '条', label: '几何 / 命令 / 协议守卫单测', invert: true },
                  },
                  {
                    id: 'hero_stat_commands',
                    componentName: 'Stat',
                    props: { value: '6', suffix: '个', label: '全部支持 revert 的命令', invert: true },
                  },
                  {
                    id: 'hero_stat_deps',
                    componentName: 'Stat',
                    props: { value: '0', suffix: '个', label: '拖拽引擎的框架依赖', invert: true },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ---------------- 核心能力 ---------------- */
      {
        id: 'features',
        componentName: 'Section',
        props: { tone: 'muted', padding: 'md' },
        children: [
          {
            id: 'features_stack',
            componentName: 'Stack',
            props: { direction: 'column', gap: 34 },
            children: [
              {
                id: 'features_head',
                componentName: 'Stack',
                props: { direction: 'column', align: 'center', gap: 12 },
                children: [
                  {
                    id: 'features_badge',
                    componentName: 'Badge',
                    props: { tone: 'accent' },
                    children: ['核心能力'],
                  },
                  {
                    id: 'features_title',
                    componentName: 'Heading',
                    props: { level: 2, align: 'center' },
                    children: ['六个不打算妥协的地方'],
                  },
                  {
                    id: 'features_desc',
                    componentName: 'Text',
                    props: { size: 'lg', tone: 'muted', align: 'center', style: { maxWidth: 560 } },
                    children: ['低代码引擎的难点不在渲染，在几何、状态和可回溯性。'],
                  },
                ],
              },
              {
                id: 'features_grid',
                componentName: 'Grid',
                props: { minColumn: 220, gap: 18 },
                children: [
                  {
                    id: 'feat_locate',
                    componentName: 'FeatureCard',
                    props: {
                      icon: '⌗',
                      title: '几何定位是纯函数',
                      desc: 'locate() 只吃矩形数组，不认识 Node，也不碰 DOM。14 条几何用例毫秒级跑完，不用开浏览器。',
                    },
                  },
                  {
                    id: 'feat_state',
                    componentName: 'FeatureCard',
                    props: {
                      icon: '◈',
                      title: '四态拖拽状态机',
                      desc: 'idle → pending → dragging → dropping。入口只有一处，所以「拖拽卡死」这类问题只需要排查一条路径。',
                    },
                  },
                  {
                    id: 'feat_rect',
                    componentName: 'FeatureCard',
                    props: {
                      icon: '◱',
                      title: '矩形缓存会自查',
                      desc: 'dragstart 采一次，滚动、尺寸变化、DOM 变更才整批重建。不在每帧强制同步布局。',
                    },
                  },
                  {
                    id: 'feat_command',
                    componentName: 'FeatureCard',
                    props: {
                      icon: '↺',
                      title: '命令全部可回滚',
                      desc: 'Insert / Move / Remove / SetProps 都实现了 revert，撤销重做只差一个 History 栈。',
                    },
                  },
                  {
                    id: 'feat_edit',
                    componentName: 'FeatureCard',
                    props: {
                      icon: '▤',
                      title: '编辑态一节点一 DOM',
                      desc: 'loop 在编辑态只渲染一次，不做 1:N 展开。拖拽拿到的矩形永远只对应一个节点。',
                    },
                  },
                  {
                    id: 'feat_flatten',
                    componentName: 'FeatureCard',
                    props: {
                      icon: '⊹',
                      title: '没有包装层',
                      desc: 'data-node-id 直接透传到物料根元素，不用 display:contents —— 那种元素没有盒子，命中框会全变成 0。',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ---------------- 五个包 ---------------- */
      {
        id: 'packages',
        componentName: 'Section',
        props: { tone: 'light', padding: 'md' },
        children: [
          {
            id: 'packages_stack',
            componentName: 'Stack',
            props: { direction: 'column', gap: 30 },
            children: [
              {
                id: 'packages_head',
                componentName: 'Stack',
                props: { direction: 'column', gap: 10 },
                children: [
                  {
                    id: 'packages_badge',
                    componentName: 'Badge',
                    props: { tone: 'neutral' },
                    children: ['架构'],
                  },
                  {
                    id: 'packages_title',
                    componentName: 'Heading',
                    props: { level: 2 },
                    children: ['五个包，一条单向依赖链'],
                  },
                  {
                    id: 'packages_desc',
                    componentName: 'Text',
                    props: { size: 'lg', tone: 'muted', style: { maxWidth: 600 } },
                    children: [
                      '依赖只允许从右往左：designer 认识所有层，drag 谁都不认识，所以它能脱离低代码场景单独用。',
                    ],
                  },
                ],
              },
              {
                id: 'packages_grid',
                componentName: 'Grid',
                props: { minColumn: 200, gap: 16 },
                children: [
                  {
                    id: 'pkg_protocol',
                    componentName: 'Card',
                    props: { tone: 'white', padding: 18, radius: 12 },
                    children: [
                      {
                        id: 'pkg_protocol_inner',
                        componentName: 'Stack',
                        props: { direction: 'column', gap: 6 },
                        children: [
                          {
                            id: 'pkg_protocol_no',
                            componentName: 'Text',
                            props: { size: 'xs', tone: 'primary', mono: true },
                            children: ['01'],
                          },
                          {
                            id: 'pkg_protocol_name',
                            componentName: 'Heading',
                            props: { level: 4, mono: true },
                            children: ['protocol'],
                          },
                          {
                            id: 'pkg_protocol_desc',
                            componentName: 'Text',
                            props: { size: 'sm', tone: 'muted' },
                            children: ['schema、物料协议与 zod 校验。校验失败摊平成可读路径，不是一句 Invalid input。'],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'pkg_model',
                    componentName: 'Card',
                    props: { tone: 'white', padding: 18, radius: 12 },
                    children: [
                      {
                        id: 'pkg_model_inner',
                        componentName: 'Stack',
                        props: { direction: 'column', gap: 6 },
                        children: [
                          {
                            id: 'pkg_model_no',
                            componentName: 'Text',
                            props: { size: 'xs', tone: 'primary', mono: true },
                            children: ['02'],
                          },
                          {
                            id: 'pkg_model_name',
                            componentName: 'Heading',
                            props: { level: 4, mono: true },
                            children: ['model'],
                          },
                          {
                            id: 'pkg_model_desc',
                            componentName: 'Text',
                            props: { size: 'sm', tone: 'muted' },
                            children: ['可变节点树、选区与命令模式。变更通过 subscribe 广播，不依赖任何框架。'],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'pkg_renderer',
                    componentName: 'Card',
                    props: { tone: 'white', padding: 18, radius: 12 },
                    children: [
                      {
                        id: 'pkg_renderer_inner',
                        componentName: 'Stack',
                        props: { direction: 'column', gap: 6 },
                        children: [
                          {
                            id: 'pkg_renderer_no',
                            componentName: 'Text',
                            props: { size: 'xs', tone: 'primary', mono: true },
                            children: ['03'],
                          },
                          {
                            id: 'pkg_renderer_name',
                            componentName: 'Heading',
                            props: { level: 4, mono: true },
                            children: ['renderer'],
                          },
                          {
                            id: 'pkg_renderer_desc',
                            componentName: 'Text',
                            props: { size: 'sm', tone: 'muted' },
                            children: ['Evaluator 纯函数 + 物料注册表 + Driver。整个系统只有 Driver 认识 React。'],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'pkg_drag',
                    componentName: 'Card',
                    props: { tone: 'white', padding: 18, radius: 12 },
                    children: [
                      {
                        id: 'pkg_drag_inner',
                        componentName: 'Stack',
                        props: { direction: 'column', gap: 6 },
                        children: [
                          {
                            id: 'pkg_drag_no',
                            componentName: 'Text',
                            props: { size: 'xs', tone: 'primary', mono: true },
                            children: ['04'],
                          },
                          {
                            id: 'pkg_drag_name',
                            componentName: 'Heading',
                            props: { level: 4, mono: true },
                            children: ['drag'],
                          },
                          {
                            id: 'pkg_drag_desc',
                            componentName: 'Text',
                            props: { size: 'sm', tone: 'muted' },
                            children: ['Locator、RectCache、Overlay、DragManager、AutoScroller。只认 id 与矩形。'],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'pkg_designer',
                    componentName: 'Card',
                    props: { tone: 'white', padding: 18, radius: 12 },
                    children: [
                      {
                        id: 'pkg_designer_inner',
                        componentName: 'Stack',
                        props: { direction: 'column', gap: 6 },
                        children: [
                          {
                            id: 'pkg_designer_no',
                            componentName: 'Text',
                            props: { size: 'xs', tone: 'primary', mono: true },
                            children: ['05'],
                          },
                          {
                            id: 'pkg_designer_name',
                            componentName: 'Heading',
                            props: { level: 4, mono: true },
                            children: ['designer'],
                          },
                          {
                            id: 'pkg_designer_desc',
                            componentName: 'Text',
                            props: { size: 'sm', tone: 'muted' },
                            children: ['落点规则、物料面板、画布、选中与删除。把上面四层组装成能用界面。'],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'pkg_next',
                    componentName: 'Card',
                    props: { tone: 'outline', padding: 18, radius: 12 },
                    children: [
                      {
                        id: 'pkg_next_inner',
                        componentName: 'Stack',
                        props: { direction: 'column', gap: 6 },
                        children: [
                          {
                            id: 'pkg_next_no',
                            componentName: 'Text',
                            props: { size: 'xs', tone: 'subtle', mono: true },
                            children: ['next'],
                          },
                          {
                            id: 'pkg_next_name',
                            componentName: 'Heading',
                            props: { level: 4, mono: true },
                            children: ['history'],
                          },
                          {
                            id: 'pkg_next_desc',
                            componentName: 'Text',
                            props: { size: 'sm', tone: 'muted' },
                            children: ['命令已经可回滚，接上 History 栈就是撤销重做。'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ---------------- 协议 ---------------- */
      {
        id: 'schema',
        componentName: 'Section',
        props: { tone: 'dark', padding: 'md' },
        children: [
          {
            id: 'schema_grid',
            componentName: 'Grid',
            props: { minColumn: 330, gap: 34 },
            children: [
              {
                id: 'schema_copy',
                componentName: 'Stack',
                props: { direction: 'column', gap: 14 },
                children: [
                  {
                    id: 'schema_badge',
                    componentName: 'Badge',
                    props: { tone: 'invert' },
                    children: ['协议'],
                  },
                  {
                    id: 'schema_title',
                    componentName: 'Heading',
                    props: { level: 2, tone: 'invert' },
                    children: ['schema 是唯一事实来源'],
                  },
                  {
                    id: 'schema_desc',
                    componentName: 'Text',
                    props: { tone: 'invert' },
                    children: [
                      '页面就是一个 JSON 树。渲染器、拖拽引擎、将来的导出器都只读它，没有第二份状态。',
                    ],
                  },
                  {
                    id: 'schema_points',
                    componentName: 'Stack',
                    props: { direction: 'column', gap: 9, style: { marginTop: 4 } },
                    children: [
                      {
                        id: 'schema_point_1',
                        componentName: 'Text',
                        props: { size: 'sm', tone: 'invert' },
                        children: ['· 文本是 children 里的字符串项，不塞进 props.children'],
                      },
                      {
                        id: 'schema_point_2',
                        componentName: 'Text',
                        props: { size: 'sm', tone: 'invert' },
                        children: ['· condition / loop 是节点级指令，不混进 props'],
                      },
                      {
                        id: 'schema_point_3',
                        componentName: 'Text',
                        props: { size: 'sm', tone: 'invert' },
                        children: ['· 每个节点有全局唯一 id，拖拽靠它定位'],
                      },
                    ],
                  },
                  {
                    id: 'schema_note',
                    componentName: 'Text',
                    props: { size: 'sm', tone: 'subtle' },
                    children: ['右边这一版，就是本页首屏标题的真实节点。'],
                  },
                ],
              },
              {
                id: 'schema_code',
                componentName: 'CodeBlock',
                props: { filename: 'page.schema.ts', code: PROTOCOL_SNIPPET },
              },
            ],
          },
        ],
      },

      /* ---------------- 结尾 ---------------- */
      {
        id: 'cta',
        componentName: 'Section',
        props: { tone: 'accent', padding: 'md' },
        children: [
          {
            id: 'cta_stack',
            componentName: 'Stack',
            props: { direction: 'column', align: 'center', gap: 16 },
            children: [
              {
                id: 'cta_title',
                componentName: 'Heading',
                props: { level: 2, align: 'center' },
                children: ['现在就可以拖着试'],
              },
              {
                id: 'cta_desc',
                componentName: 'Text',
                props: { size: 'lg', tone: 'muted', align: 'center', style: { maxWidth: 560 } },
                children: [
                  '左边 20 个物料，拖到画布上松手就插入。画布内按住节点可以重排，拖出画布松手会取消。',
                ],
              },
              {
                id: 'cta_actions',
                componentName: 'Stack',
                props: { direction: 'row', gap: 12, justify: 'center', wrap: true },
                children: [
                  {
                    id: 'cta_action_drag',
                    componentName: 'Button',
                    props: { variant: 'primary', size: 'lg' },
                    children: ['拖一个 Hero 进来'],
                  },
                  {
                    id: 'cta_action_delete',
                    componentName: 'Button',
                    props: { variant: 'outline', size: 'lg' },
                    children: ['选中节点按 Delete'],
                  },
                ],
              },
            ],
          },
        ],
      },

      /* ---------------- 页脚 ---------------- */
      {
        id: 'footer',
        componentName: 'Footer',
        props: { copyright: '© 2026 lowcode-next · M0–M5 最小闭环' },
        children: [
          {
            id: 'footer_link_doc',
            componentName: 'Link',
            props: { href: '#', tone: 'invert' },
            children: ['设计文档'],
          },
          {
            id: 'footer_link_schema',
            componentName: 'Link',
            props: { href: '#', tone: 'invert' },
            children: ['协议'],
          },
          {
            id: 'footer_link_repo',
            componentName: 'Link',
            props: { href: '#', tone: 'invert' },
            children: ['仓库'],
          },
        ],
      },
    ],
  },
  // 页面数据源（lowcode 协议的 dataSource.list）：引擎 demo 同款示例，
  // 一条 fetch 指向本服务的 mock，数据源面板打开就有东西可看、可调试。
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
