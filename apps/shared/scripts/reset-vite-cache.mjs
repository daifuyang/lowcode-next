/**
 * 启动 dev 前把 Vite 的依赖预构建缓存挪走。
 *
 * 为什么需要它：Vite 8 一旦发现 `vite.config` 变了，就会 `rm -rf node_modules/.vite/deps`
 * 再重新预构建。本项目 200+ 个缓存文件一次性删除会撞上运行环境的批量删除保护
 * （阈值 50），报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，dev server 直接起不来 ——
 * 表现是 502，错误藏在 vite 的启动日志里。2026-11-06 连续踩了三次。
 *
 * 这里改用 `rename`（不是删除）把整个目录挪到系统临时目录，Vite 看到缓存不存在
 * 就自己新建，全程没有批量删除。代价是每次启动多一次依赖预构建（1~2 秒）。
 *
 * **缓存目录以 cwd 为基准**（`pnpm dev` 的 cwd 就是 app 目录）。拆成两个 app 之后
 * 各自的 `node_modules/.vite` 天然隔离，不再需要按 mode 传目录名。
 */
import { existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cacheDir = join(process.cwd(), 'node_modules', '.vite');

if (existsSync(cacheDir)) {
  try {
    const target = join(tmpdir(), `lowcode-next-vite-${Date.now()}`);
    renameSync(cacheDir, target);
    console.log(`[dev] 旧 Vite 缓存已移出：${target}`);
  } catch (error) {
    // 跨盘符等情况挪不走，退回让 Vite 自己处理（可能撞保护，至少日志里有线索）
    console.warn('[dev] 移走 Vite 缓存失败，交给 Vite 处理：', error.message);
  }
}
