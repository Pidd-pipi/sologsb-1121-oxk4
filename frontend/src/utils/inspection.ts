import { isDbhAbnormal, type TreeRecord } from '../types/tree';
import type { RegenShrub } from '../types/regen';
import type { RecheckDiff } from '../types/recheck';
import type { InspectionIssue, IssueKind } from '../types/inspection';

export interface ScanInput {
  /** 本期期次 */
  round: number;
  /** 该样地全部样木（含往期，用于负增长比对与胸径同期均值） */
  trees: TreeRecord[];
  /** 该样地全部更新与灌木样方 */
  regens: RegenShrub[];
  /** 已保存的复查比对结果（用于缺测原因判断） */
  rechecks: RecheckDiff[];
}

const KIND_PRIORITY: Record<IssueKind, number> = {
  dbh_abnormal: 0,
  negative_growth: 1,
  missing_reason: 2,
  heavy_browse: 3,
};

function subjectOf(tree: TreeRecord): string {
  return `树号 ${tree.treeNo}（${tree.species || '未知树种'}）`;
}

/** 扫描一期数据的全部交验问题：胸径异常、负增长、本期缺测未写原因、重度啃食 */
export function scanIssues(input: ScanInput): InspectionIssue[] {
  const { round, trees, regens, rechecks } = input;
  const issues: InspectionIssue[] = [];

  const current = trees.filter((t) => t.round === round);
  const prevRounds = Array.from(new Set(trees.filter((t) => t.round < round).map((t) => t.round))).sort(
    (a, b) => a - b,
  );
  const baseRound = prevRounds[prevRounds.length - 1];
  const baseTrees = baseRound === undefined ? [] : trees.filter((t) => t.round === baseRound);
  const currentByNo = new Map(current.map((t) => [t.treeNo, t]));

  // 1) 胸径异常：数值不合理或与本树种同期均值偏离过大
  current.forEach((tree) => {
    if (isDbhAbnormal(tree, trees)) {
      issues.push({
        key: `dbh_abnormal:${tree.id}`,
        kind: 'dbh_abnormal',
        subject: subjectOf(tree),
        message: `本期胸径 ${tree.dbhCm} cm 异常（超出 0~200 cm 或与本树种同期均值偏离超过 60%）`,
        refId: tree.id,
      });
    }
  });

  // 2) 负增长 & 3) 本期缺测未写原因：优先从上一期样木逐株比对得出
  const missingByNo = new Map<string, InspectionIssue>();
  baseTrees.forEach((base) => {
    const target = currentByNo.get(base.treeNo);
    if (!target) {
      // 上期采伐木本就不该再出现，不计缺测；其余状态（活立木/枯立木/倒木）缺测必须写原因
      if (base.status !== '采伐') {
        missingByNo.set(
          base.treeNo,
          {
            key: `missing_reason:${base.id}`,
            kind: 'missing_reason',
            subject: subjectOf(base),
            message: `该树第 ${baseRound} 期后本期（第 ${round} 期）缺测，未填写复查原因`,
            refId: base.id,
          },
        );
      }
      return;
    }
    if (target.dbhCm - base.dbhCm < 0) {
      issues.push({
        key: `negative_growth:${target.id}`,
        kind: 'negative_growth',
        subject: subjectOf(target),
        message: `胸径由上期 ${base.dbhCm} cm 变为本期 ${target.dbhCm} cm，生长量为负`,
        refId: target.id,
      });
    }
    if (target.heightM - base.heightM < 0) {
      issues.push({
        key: `negative_growth:h:${target.id}`,
        kind: 'negative_growth',
        subject: subjectOf(target),
        message: `树高由上期 ${base.heightM} m 变为本期 ${target.heightM} m，生长量为负`,
        refId: target.id,
      });
    }
  });

  // 已保存的复查比对行可补写缺测原因：有原因则关闭问题，空白原因保持问题存在
  rechecks
    .filter((d) => d.targetRound === round && d.baseDbhCm !== undefined && d.targetDbhCm === undefined)
    .forEach((d) => {
      if (d.missingReason && d.missingReason.trim()) {
        missingByNo.delete(d.treeNo);
      } else if (!missingByNo.has(d.treeNo)) {
        missingByNo.set(d.treeNo, {
          key: `missing_reason:diff:${d.id}`,
          kind: 'missing_reason',
          subject: `树号 ${d.treeNo}（${d.species || '未知树种'}）`,
          message: `本期（第 ${round} 期）缺测，未填写复查原因`,
          refId: d.id,
        });
      }
    });
  issues.push(...missingByNo.values());

  // 4) 重度啃食：更新苗与灌木样方
  regens
    .filter((r) => r.round === round && r.browseDamage === '重度')
    .forEach((r) => {
      issues.push({
        key: `heavy_browse:${r.id}`,
        kind: 'heavy_browse',
        subject: `${r.layer} · ${r.species}（${r.count} 株）`,
        message: `本期啃食情况为重度，需说明处理措施`,
        refId: r.id,
      });
    });

  return issues.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.subject.localeCompare(b.subject));
}
