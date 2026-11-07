import type { ReactNode } from 'react';
import { Database, LayoutGrid, ListTree } from 'lucide-react';
import styles from '@lowcode-next/designer-ui/ActivityRail.module.css';

export interface ActivityItem {
  key: string;
  label: string;
  icon: ReactNode;
}

export interface ActivityRailProps {
  items: ActivityItem[];
  /** 当前**正在显示**的面板；面板收起时传 null —— 收起状态下没有任何入口是高亮的 */
  active: string | null;
  onChange: (key: string) => void;
}

/**
 * 最左侧图标栏（lowcode-engine 的 `leftArea`）。
 *
 * 面板入口用图标栏而不是页签：页签占了面板顶部一整行，而这一行在
 * 「大纲树」模式下是浪费的；图标栏还让后续加「数据源 / 历史」等面板
 * 不用改布局结构。只负责导航，面板内容由宿主按 active 渲染。
 *
 * 尺寸与高亮都照 `editor-skeleton/src/layouts/workbench.less`：
 * 栏宽 48、每项 46×46、图标 20、顶部留 12；**激活只染图标色，不铺底色、
 * 不挂指示条** —— 引擎的 `.lc-title.actived` 就只有一句 `color: brand`。
 *
 * 高亮跟着「面板是否展开」走：面板收起时一个入口都不亮。否则默认收起的状态下
 * 大纲那个图标一直是品牌蓝，"点开了哪个"就无从判断了。
 */
export function ActivityRail({ items, active, onChange }: ActivityRailProps) {
  return (
    <nav className={styles.rail} aria-label="面板导航">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={styles.item}
          data-active={item.key === active || undefined}
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.key === active}
          onClick={() => onChange(item.key)}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}

/**
 * 面板入口图标统一取 lucide（ISC 协议、24 网格线性图标）。
 *
 * 之前大纲那个是拿引擎的 path 直接贴过来的（1024 网格实心），
 * 组件库那个是照观感自绘的实心四宫格 —— 两个图标放在一起还算齐，
 * 但和面板里后来加的一堆线性图标（树箭头、眼睛、锁、铅笔）不是一个体系，
 * 20px 下实心和线性混排会显得一重一轻。统一成线性之后整栏是一条视觉基线。
 *
 * 线宽 1.7：48px 栏里 20px 图标，2 会糊、1.5 会飘。
 */
const railIcon = { size: 20, strokeWidth: 1.7, 'aria-hidden': true } as const;

/** 大纲：分支缩进的树列表（`ListTree`） */
export function OutlineTabIcon() {
  return <ListTree {...railIcon} />;
}

/** 组件库：四宫格（`LayoutGrid`） */
export function MaterialTabIcon() {
  return <LayoutGrid {...railIcon} />;
}

/** 数据源：圆柱数据库（`Database`）—— 引擎用的 next-icon-shujuyuan 就是这个形 */
export function DataSourceTabIcon() {
  return <Database {...railIcon} />;
}
