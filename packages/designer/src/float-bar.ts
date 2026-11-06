import type { Rect } from '@lowcode-next/drag';

/**
 * 选中工具条的几何换算。
 *
 * 数值全部来自 lowcode-engine 的 `bem-tools/border-selecting.tsx`：
 * `BAR_HEIGHT = 20`、`MARGIN = 1`、`BORDER = 2`，即工具条高 20，
 * 落在选中框上沿外 23px 处 —— 工具条与节点之间正好留 3px（1 + 2）。
 *
 * 引擎是在画布坐标系里把工具条塞进选中框内部的（`top: -23` / `right: -2`），
 * 这里换成屏幕坐标的 fixed 定位，规则一一对应：
 * 上/下翻转、贴右边、节点太窄时改贴左边、上下都放不下时压进节点上沿。
 */

export const BAR_HEIGHT = 20;
export const BAR_MARGIN = 1;
export const BAR_BORDER = 2;
/** 选中框边线到工具条远边的距离：条高 + 间隙 + 边线 */
export const BAR_SPACE = BAR_HEIGHT + BAR_MARGIN + BAR_BORDER;
/** 节点右边界不足这个宽度时，工具条改贴节点左边界（引擎的 SPACE_MINIMUM_WIDTH） */
export const BAR_MIN_ANCHOR_WIDTH = 160;
/** 工具条与节点边缘之间的实际空隙 */
export const BAR_GAP = BAR_SPACE - BAR_HEIGHT;

export interface Size {
  width: number;
  height: number;
}

/** 上方外侧 / 下方外侧 / 被迫压进节点内部 */
export type FloatBarSide = 'above' | 'below' | 'inside';
export type PopupSide = 'above' | 'below';

export interface FloatBarPlacement {
  left: number;
  top: number;
  side: FloatBarSide;
}

export interface PopupPlacement {
  left: number;
  top: number;
  side: PopupSide;
}

export interface PlaceFloatBarInput {
  /** 选中节点的屏幕矩形 */
  anchor: Rect;
  /** 工具条自身尺寸 */
  size: Size;
  /** 视口尺寸，一般是 window.innerWidth / innerHeight */
  viewport: Size;
  /**
   * 画布可视矩形（屏幕坐标）。给了就只在画布范围内落位 —— 否则节点贴着画布顶部时，
   * 工具条会"翻到节点上方"翻到应用顶栏上去，看着像浮在无关区域。
   */
  bounds?: Rect;
}

export function placeFloatBar(input: PlaceFloatBarInput): FloatBarPlacement {
  const { anchor, size, viewport, bounds } = input;

  // 落位边界：默认整屏，给了画布矩形就收窄到画布
  const minX = bounds ? bounds.x : 0;
  const minY = bounds ? bounds.y : 0;
  const maxX = bounds ? bounds.x + bounds.width : viewport.width;
  const maxY = bounds ? bounds.y + bounds.height : viewport.height;

  // 纵向：优先节点上方，其次节点下方，都不行才压进节点内部。
  //
  // 这里有一处**不能偷懒用 clamp 代替分支**的地方：节点上沿贴着画布顶部时
  // （选中「区块」这种比画布还高的节点，reveal 后上沿就在可视区顶），
  // 「上方」算出来的 top 会小于 minY，clamp 一下正好落到画布顶 ——
  // 而工具条高 20，盖住的恰恰是选区**上边框**（见 §7.5）。结果就是四边里
  // 上边被条压掉、下边在视口外、左边被浮动面板压住，看起来"没有选中"。
  //
  // 所以分成四档：上方放得下 → 上方；下方放得下 → 下方；节点上沿还在画布内 →
  // 贴到框内上沿（BAR_GAP 处，正好避开 2px 边线）；上沿已滚出画布 →
  // 钉在画布顶部（此时框的顶边本来就在视口外，压不到）。
  let top: number;
  let side: FloatBarSide;

  if (anchor.y - BAR_SPACE >= minY) {
    top = anchor.y - BAR_SPACE;
    side = 'above';
  } else if (anchor.y + anchor.height + BAR_SPACE <= maxY) {
    // 下方落位同样留 BAR_GAP 的空隙，和上方对称
    top = anchor.y + anchor.height + BAR_GAP;
    side = 'below';
  } else if (anchor.y >= minY) {
    // 压在节点内部，但落在框线**里侧**：BAR_GAP = 边线 2 + 间隙 1，
    // 条的上沿正好贴着 2px 边线的内壁，边框完整露出来
    top = anchor.y + BAR_GAP;
    side = 'inside';
  } else {
    // 节点上沿已滚出可视区：顶边在屏外，条钉在画布顶部不会压住任何东西
    top = minY + BAR_MARGIN;
    side = 'inside';
  }

  // 横向：默认右边界对齐节点右边界（外扩边线宽度），但不越出边界
  const anchorRight = anchor.x + anchor.width;
  const preferLeft = anchorRight < BAR_MIN_ANCHOR_WIDTH;
  let left = preferLeft ? anchor.x - BAR_BORDER : anchorRight + BAR_BORDER - size.width;

  left = clamp(left, minX, Math.max(minX, maxX - size.width));
  top = clamp(top, minY, Math.max(minY, maxY - size.height));

  return { left, top, side };
}

export interface PlacePopupInput {
  /** 工具条的屏幕矩形 */
  bar: Rect;
  /** 面板自身尺寸 */
  size: Size;
  viewport: Size;
}

/**
 * 工具条该不该出现。
 *
 * 引擎的工具条长在画布坐标系里（`top: -23` 挂在选中框上沿），所以节点滚出视野时
 * 它是"跟着一起滚走"的。这边是 `position: fixed`，不判断就会把条夹到视口边缘，
 * 变成一个浮在无关内容上的小条 —— 比不显示更让人困惑。
 *
 * 判据只有一条：**节点和视口有没有交集**。完全滚出去就不显示。
 *
 * 不能像以前那样连"上沿在视口之上"也判掉：选中「区块」这种比视口还高的节点时，
 * 它的上沿经常刚好压在视口上方（reveal 只在完全看不见时才滚），此时工具条是唯一
 * 能确认"选中了谁、怎么往上跳"的入口，藏掉之后画布上只剩一条贴着视口右缘的线，
 * 看上去就像根本没有选中。这种时候 `placeFloatBar` 的 `inside` 分支会把条钳到
 * 视口顶部，正好压在节点自己身上，不算"浮在无关内容上"。
 */
export function anchorOnScreen(anchor: Rect, viewport: Size): boolean {
  return (
    anchor.x + anchor.width > 0 &&
    anchor.y + anchor.height > 0 &&
    anchor.x < viewport.width &&
    anchor.y < viewport.height
  );
}

/**
 * 层级面板的落位：贴在工具条**下方**，放不下才向上翻。
 *
 * 引擎用 Fusion 的 Popup（默认对齐 `bl`，即面板在触发器下方，空间不足时自动翻转），
 * 这里把那套行为显式写出来，顺序与它一致：先试下方，再试上方，都不行就钉在下方并夹进视口。
 *
 * 落位方向也决定了祖先列表的读法：面板在下方时，紧贴工具条的自然是最近的父级，
 * 引擎那份「由近及远」的顺序直接可用，不必再排序。
 */
export function placePopup(input: PlacePopupInput): PopupPlacement {
  const { bar, size, viewport } = input;

  const below = bar.y + bar.height + BAR_GAP;
  const above = bar.y - size.height - BAR_GAP;

  let top: number;
  let side: PopupSide;

  if (below + size.height <= viewport.height) {
    top = below;
    side = 'below';
  } else if (above >= 0) {
    top = above;
    side = 'above';
  } else {
    // 上下都放不下：仍然按下方落位，再夹进视口，至少不把工具条本身盖住
    top = clamp(below, 0, Math.max(0, viewport.height - size.height));
    side = 'below';
  }

  const left = clamp(bar.x, 0, Math.max(0, viewport.width - size.width));
  return { left, top: clamp(top, 0, Math.max(0, viewport.height - size.height)), side };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
