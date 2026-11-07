import { describe, expect, it } from 'vitest';
import {
  BAR_GAP,
  BAR_HEIGHT,
  BAR_SPACE,
  placeFloatBar,
  placePopup,
} from './float-bar';

const viewport = { width: 1200, height: 800 };
const size = { width: 240, height: BAR_HEIGHT };

describe('常量', () => {
  it('工具条高 20，与节点留 3px 空隙（lowcode 的 20 / 1 / 2）', () => {
    expect(BAR_HEIGHT).toBe(20);
    expect(BAR_SPACE).toBe(23);
    expect(BAR_GAP).toBe(3);
  });
});

describe('placeFloatBar', () => {
  it('上方有空间时贴在节点上沿外，右边界对齐节点右边界', () => {
    const result = placeFloatBar({
      anchor: { x: 400, y: 300, width: 500, height: 200 },
      size,
      viewport,
    });

    expect(result.side).toBe('above');
    expect(result.top).toBe(300 - BAR_SPACE);
    // 右边界对齐：900 + 2（选中框边线）- 工具条宽度
    expect(result.left).toBe(902 - size.width);
  });

  it('贴顶时翻到节点下方，空隙同样是 3px', () => {
    const result = placeFloatBar({
      anchor: { x: 400, y: 20, width: 500, height: 200 },
      size,
      viewport,
    });

    expect(result.side).toBe('below');
    expect(result.top).toBe(220 + BAR_GAP);
  });

  it('上下都放不下时压进节点内部，但不压住 2px 边线', () => {
    const result = placeFloatBar({
      anchor: { x: 400, y: 10, width: 500, height: 790 },
      size,
      viewport,
    });

    expect(result.side).toBe('inside');
    // 10 + BAR_GAP(3)：条顶贴住边线内壁，上边框完整可见
    expect(result.top).toBe(13);
  });

  it('节点右边界不足 160 时改贴节点左边界', () => {
    const result = placeFloatBar({
      anchor: { x: 0, y: 300, width: 100, height: 40 },
      size,
      viewport,
    });

    // 左边贴到节点左边界外扩 2px，再夹到视口内
    expect(result.left).toBe(0);
  });

  it('窄节点但离左边足够远时仍然右对齐', () => {
    const result = placeFloatBar({
      anchor: { x: 300, y: 300, width: 100, height: 40 },
      size,
      viewport,
    });

    expect(result.left).toBe(400 + 2 - size.width);
  });

  it('节点贴右边时右边界不越出视口', () => {
    const result = placeFloatBar({
      anchor: { x: 1100, y: 300, width: 100, height: 40 },
      size,
      viewport,
    });

    expect(result.left).toBe(viewport.width - size.width);
  });

  it('工具条比视口还高时仍然夹在视口内', () => {
    const tall = { width: 240, height: 700 };
    const result = placeFloatBar({
      anchor: { x: 100, y: 500, width: 500, height: 50 },
      size: tall,
      viewport,
    });

    expect(result.top).toBe(viewport.height - tall.height);
  });
});

describe('placePopup', () => {
  const bar = { x: 600, y: 277, width: 240, height: BAR_HEIGHT };

  it('工具条下方有空间时向下展开（引擎 Fusion Popup 的默认对齐）', () => {
    const result = placePopup({ bar, size: { width: 120, height: 68 }, viewport });

    expect(result.side).toBe('below');
    expect(result.top).toBe(277 + BAR_HEIGHT + BAR_GAP);
    expect(result.left).toBe(600);
  });

  it('下方放不下时翻到工具条上方', () => {
    const result = placePopup({
      bar: { ...bar, y: 750 },
      size: { width: 120, height: 68 },
      viewport,
    });

    expect(result.side).toBe('above');
    expect(result.top).toBe(750 - 68 - BAR_GAP);
  });

  it('上下都放不下时仍然按下方落位，夹进视口', () => {
    const result = placePopup({
      bar: { ...bar, y: 20 },
      size: { width: 120, height: 790 },
      viewport,
    });

    expect(result.side).toBe('below');
    expect(result.top).toBe(viewport.height - 790);
  });

  it('面板比工具条宽时左边夹回视口内', () => {
    const result = placePopup({
      bar: { ...bar, x: 1150 },
      size: { width: 300, height: 68 },
      viewport,
    });

    expect(result.left).toBe(viewport.width - 300);
  });
});
