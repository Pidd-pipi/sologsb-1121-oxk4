import type { TreeRecord } from '../types/tree';
import type { RecheckDiff } from '../types/recheck';
import { diffId } from './id';

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 由上下两期样木生成逐株比对表。
 * id 按「样地-上期-本期-树号」稳定生成，同一口径重复生成不会产生新主键，
 * 交验补写的缺失原因也能在重新生成时保留（调用方负责合并）。
 */
export function buildRecheckDiffs(
  plotId: string,
  baseRound: number,
  targetRound: number,
  trees: TreeRecord[],
  generatedAt = Date.now(),
): RecheckDiff[] {
  const baseList = trees.filter((t) => t.plotId === plotId && t.round === baseRound);
  const targetList = trees.filter((t) => t.plotId === plotId && t.round === targetRound);
  const baseMap = new Map<string, TreeRecord>();
  baseList.forEach((t) => baseMap.set(t.treeNo, t));
  const targetMap = new Map<string, TreeRecord>();
  targetList.forEach((t) => targetMap.set(t.treeNo, t));
  const allNos = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()])).sort((a, b) =>
    a.localeCompare(b, 'zh-Hans-CN', { numeric: true }),
  );

  return allNos.map((treeNo) => {
    const b = baseMap.get(treeNo);
    const t = targetMap.get(treeNo);
    const baseDbh = b?.dbhCm;
    const targetDbh = t?.dbhCm;
    const dbhGrowth = baseDbh !== undefined && targetDbh !== undefined ? r2(targetDbh - baseDbh) : 0;
    const heightGrowth = b && t ? r2(t.heightM - b.heightM) : 0;
    const statusChange = b && t && b.status !== t.status ? `${b.status} → ${t.status}` : '';
    const missingReason = !t ? '本期未复测（疑似采伐或倒伏）' : !b ? '本期新增进界木' : '';
    return {
      id: diffId(plotId, baseRound, targetRound, treeNo),
      plotId,
      baseRound,
      targetRound,
      treeNo,
      species: t?.species ?? b?.species ?? '',
      baseDbhCm: baseDbh,
      targetDbhCm: targetDbh,
      baseHeightM: b?.heightM,
      targetHeightM: t?.heightM,
      dbhGrowth,
      heightGrowth,
      statusChange,
      missingReason,
      generatedAt,
    };
  });
}
