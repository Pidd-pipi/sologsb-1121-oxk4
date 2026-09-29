import { isDbhAbnormal, type TreeRecord } from '../types/tree';
import type { RegenShrub } from '../types/regen';
import type { RecheckDiff } from '../types/recheck';
import type { ReviewIssue } from '../types/submission';

export interface ReviewInput {
  plotId: string;
  round: number;
  /** 该样地全部期次样木（胸径异常比较需要同期同树种均值） */
  trees: TreeRecord[];
  /** 该样地全部复查比对结果（取本期 = round 的最新一组） */
  rechecks: RecheckDiff[];
  regens: RegenShrub[];
}

/**
 * 扫描某期交验问题：
 * 1. 胸径异常（数值不合理或偏离同树种同期均值 >60%）
 * 2. 负增长（胸径或树高生长量为负）
 * 3. 本期缺测未写原因（复查比对中本期胸径缺失但缺失原因为空）
 * 4. 重度啃食（本期更新层/灌木样方 browseDamage = 重度）
 */
export function collectReviewIssues(input: ReviewInput): ReviewIssue[] {
  const { plotId, round, trees, rechecks, regens } = input;
  const issues: ReviewIssue[] = [];

  const roundTrees = trees.filter((t) => t.plotId === plotId && t.round === round);

  // 1. 胸径异常
  roundTrees.forEach((t) => {
    if (isDbhAbnormal(t, trees)) {
      issues.push({
        key: `dbh:${t.treeNo}`,
        kind: 'dbh',
        treeNo: t.treeNo,
        title: `${t.treeNo} 号样木（${t.species}）胸径 ${t.dbhCm} cm 异常`,
        detail: '数值超出 0~200 cm，或与同树种同期均值偏离超过 60%，请复核检尺读数或补写说明。',
      });
    }
  });

  // 取本期 = round 的比对结果；同一上下期口径只保留 generatedAt 最新的一组
  const targets = rechecks
    .filter((d) => d.plotId === plotId && d.targetRound === round)
    .sort((a, b) => a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }));
  const pairKey = (d: RecheckDiff) => `${d.baseRound}>${d.targetRound}`;
  const latestPairGen = new Map<string, number>();
  targets.forEach((d) => {
    const k = pairKey(d);
    latestPairGen.set(k, Math.max(latestPairGen.get(k) ?? 0, d.generatedAt));
  });
  let latest: RecheckDiff[] = [];
  let latestGen = -1;
  latestPairGen.forEach((gen, k) => {
    if (gen > latestGen) {
      latestGen = gen;
      latest = targets.filter((d) => pairKey(d) === k);
    }
  });

  // 2. 负增长；3. 本期缺测未写原因
  latest.forEach((d) => {
    if (d.dbhGrowth < 0) {
      issues.push({
        key: `negativeGrowth:${d.treeNo}`,
        kind: 'negativeGrowth',
        treeNo: d.treeNo,
        title: `${d.treeNo} 号样木胸径负增长 ${d.dbhGrowth} cm（${d.baseDbhCm ?? '?'} → ${d.targetDbhCm ?? '缺测'}）`,
        detail: `第 ${d.baseRound} 期 → 第 ${d.targetRound} 期胸径生长量为负，请核实是否检尺位置变化或录入错误。`,
      });
    }
    if (d.heightGrowth < 0 && d.dbhGrowth >= 0) {
      issues.push({
        key: `negativeGrowthHeight:${d.treeNo}`,
        kind: 'negativeGrowth',
        treeNo: d.treeNo,
        title: `${d.treeNo} 号样木树高负增长 ${d.heightGrowth} m（${d.baseHeightM ?? '?'} → ${d.targetHeightM ?? '缺测'}）`,
        detail: `第 ${d.baseRound} 期 → 第 ${d.targetRound} 期树高生长量为负，请核实测高读数或树冠折断等情况。`,
      });
    }
    if (d.targetDbhCm === undefined && !d.missingReason.trim()) {
      issues.push({
        key: `missingNoReason:${d.treeNo}`,
        kind: 'missingNoReason',
        treeNo: d.treeNo,
        title: `${d.treeNo} 号样木本期缺测，未填写复查原因`,
        detail: `第 ${round} 期未复测到该树，请在复查比对页写明缺失原因（采伐、倒伏、漏测等）。`,
      });
    }
  });

  // 4. 重度啃食
  regens
    .filter((r) => r.plotId === plotId && r.round === round && r.browseDamage === '重度')
    .forEach((r) => {
      issues.push({
        key: `browse:${r.id}`,
        kind: 'browse',
        title: `${r.layer} · ${r.species}（${r.count} 株）存在重度啃食`,
        detail: `高度 ${r.heightCm} cm、${r.ageGroup}、分布${r.distribution}，请说明啃食动物、危害程度与后续处理。`,
      });
    });

  return issues;
}
