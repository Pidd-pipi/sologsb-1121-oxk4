/** 生成本地唯一 id */
export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 下一个期次 */
export function nextRound(rounds: number[]): number {
  return rounds.length === 0 ? 1 : Math.max(...rounds) + 1;
}

/** 数值区间裁剪 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 复查比对结果稳定主键：同一样地两期一株树保持不变 */
export function diffId(plotId: string, baseRound: number, targetRound: number, treeNo: string): string {
  return `diff_${plotId}_${baseRound}_${targetRound}_${treeNo}`;
}
