let sequence = 0;

/**
 * 节点 id 生成。
 *
 * 用递增序号 + 时间戳而不是随机串：调试时能看出创建顺序，
 * 也不会像纯随机那样在快照测试里每次都变。
 */
export function createNodeId(prefix = 'node'): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}${sequence.toString(36)}`;
}
