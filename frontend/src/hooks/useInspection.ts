import { useMemo } from 'react';
import { usePlotStore } from '../stores/plotStore';
import { useTreeStore } from '../stores/treeStore';
import { useRegenStore } from '../stores/regenStore';
import { useRecheckStore } from '../stores/recheckStore';
import { useInspectionStore } from '../stores/inspectionStore';
import { scanIssues } from '../utils/inspection';
import type { Inspection, InspectionIssue, InspectionStatus } from '../types/inspection';

export interface InspectionView extends Inspection {
  /** 按最新数据重新扫描出的问题 */
  issues: InspectionIssue[];
  /** 仍未清零的问题（数据未改正且没有处理说明） */
  openIssues: InspectionIssue[];
  /** 已通过改正数据消除、或已写处理说明的问题 */
  closedCount: number;
  /** 处理说明已失效（对应问题已不复存在）的条数 */
  staleNoteCount: number;
}

function buildView(record: Inspection, input: Parameters<typeof scanIssues>[0]): InspectionView {
  const issues = scanIssues(input);
  const openKeys = new Set(issues.map((i) => i.key));
  const openIssues = issues.filter((i) => !record.notes[i.key]?.trim());
  const staleNoteCount = Object.keys(record.notes).filter(
    (k) => record.notes[k]?.trim() && !openKeys.has(k),
  ).length;
  return {
    ...record,
    issues,
    openIssues,
    closedCount: issues.length - openIssues.length,
    staleNoteCount,
  };
}

/** 单个样地某期的交验视图：问题清单、未清零数、状态 */
export function useInspection(plotId: string | undefined, round: number): InspectionView | undefined {
  const record = useInspectionStore((s) =>
    plotId ? s.items.find((it) => it.plotId === plotId && it.round === round) : undefined,
  );
  const trees = useTreeStore((s) => s.items);
  const regens = useRegenStore((s) => s.items);
  const rechecks = useRecheckStore((s) => s.items);

  return useMemo(() => {
    if (!plotId) return undefined;
    const base: Inspection =
      record ?? {
        id: `insp_${plotId}_r${round}`,
        plotId,
        round,
        status: '待交验',
        notes: {},
        revokeReason: '',
      };
    return buildView(base, {
      round,
      trees: trees.filter((t) => t.plotId === plotId),
      regens: regens.filter((r) => r.plotId === plotId),
      rechecks: rechecks.filter((d) => d.plotId === plotId),
    });
  }, [plotId, round, record, trees, regens, rechecks]);
}

export interface PlotInspectionSummary {
  status: InspectionStatus;
  /** 未清零问题数 */
  openCount: number;
  /** 扫描问题总数 */
  issueCount: number;
}

/** 台账/汇总页用：在不逐卡构建完整视图的情况下汇总每个样地本期状态与问题数 */
export function usePlotInspectionMap(): Map<string, PlotInspectionSummary> {
  const plots = usePlotStore((s) => s.items);
  const inspections = useInspectionStore((s) => s.items);
  const trees = useTreeStore((s) => s.items);
  const regens = useRegenStore((s) => s.items);
  const rechecks = useRecheckStore((s) => s.items);

  return useMemo(() => {
    const map = new Map<string, PlotInspectionSummary>();
    plots.forEach((plot) => {
      const record = inspections.find((it) => it.plotId === plot.id && it.round === plot.surveyRound);
      const issues = scanIssues({
        round: plot.surveyRound,
        trees: trees.filter((t) => t.plotId === plot.id),
        regens: regens.filter((r) => r.plotId === plot.id),
        rechecks: rechecks.filter((d) => d.plotId === plot.id),
      });
      const openCount = issues.filter((i) => !record?.notes[i.key]?.trim()).length;
      map.set(plot.id, {
        status: record?.status ?? '待交验',
        openCount,
        issueCount: issues.length,
      });
    });
    return map;
  }, [plots, inspections, trees, regens, rechecks]);
}
