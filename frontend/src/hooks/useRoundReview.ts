import { useMemo } from 'react';
import { useTreeStore } from '../stores/treeStore';
import { useRegenStore } from '../stores/regenStore';
import { useRecheckStore } from '../stores/recheckStore';
import { useSubmissionStore } from '../stores/submissionStore';
import { collectReviewIssues } from '../utils/review';
import type { IssueResolution, SubmissionStatus } from '../types/submission';

export interface RoundReview {
  status: SubmissionStatus;
  /** 交验记录（待交验时可能不存在） */
  submission?: ReturnType<ReturnType<typeof useSubmissionStore.getState>['byRound']>;
  issues: ReturnType<typeof collectReviewIssues>;
  issueCount: number;
  /** 未填写处理说明的问题数 */
  unresolvedCount: number;
  locked: boolean;
  resolutions: IssueResolution[];
  /** 最近一次撤销交验（补测）原因 */
  lastWithdrawReason?: string;
}

/**
 * 汇总某样地某期的交验状态、检出问题与处理说明。
 * locked = 已交验：三个录入页只读，补测须先撤销交验。
 */
export function useRoundReview(plotId: string | undefined, round: number): RoundReview {
  const trees = useTreeStore((s) => s.items);
  const regens = useRegenStore((s) => s.items);
  const rechecks = useRecheckStore((s) => s.items);
  const submission = useSubmissionStore((s) =>
    plotId ? s.items.find((x) => x.plotId === plotId && x.round === round) : undefined,
  );

  return useMemo<RoundReview>(() => {
    const pid = plotId ?? '';
    const issues = collectReviewIssues({ plotId: pid, round, trees, rechecks, regens });
    const noteByKey = new Map((submission?.issueResolutions ?? []).map((r) => [r.key, r.handlingNote]));
    const resolutions = issues.map((i) => ({ key: i.key, handlingNote: noteByKey.get(i.key) ?? '' }));
    const unresolvedCount = resolutions.filter((r) => r.handlingNote.trim() === '').length;
    const withdrawEvents = (submission?.events ?? []).filter((e) => e.type === 'withdraw');
    return {
      status: submission?.status ?? 'pending',
      submission,
      issues,
      issueCount: issues.length,
      unresolvedCount,
      locked: submission?.status === 'submitted',
      resolutions,
      lastWithdrawReason: withdrawEvents[withdrawEvents.length - 1]?.reason,
    };
  }, [plotId, round, trees, regens, rechecks, submission]);
}
