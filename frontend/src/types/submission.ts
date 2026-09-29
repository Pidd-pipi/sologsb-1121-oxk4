/** 交验状态：待交验 / 需补测（撤销交验后）/ 已交验（本期锁定） */
export type SubmissionStatus = 'pending' | 'resurvey' | 'submitted';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: '待交验',
  resurvey: '需补测',
  submitted: '已交验',
};

/** 交验问题类别 */
export type IssueKind = 'dbh' | 'negativeGrowth' | 'missingNoReason' | 'browse';

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  dbh: '胸径异常',
  negativeGrowth: '负增长',
  missingNoReason: '本期缺测未写原因',
  browse: '重度啃食',
};

export const ISSUE_KIND_COLOR: Record<IssueKind, string> = {
  dbh: 'orange',
  negativeGrowth: 'red',
  missingNoReason: 'volcano',
  browse: 'magenta',
};

/** 交验检出的单条问题 */
export interface ReviewIssue {
  /** 稳定键：同一树/样方在同一复查口径下保持不变，用于保留处理说明 */
  key: string;
  kind: IssueKind;
  treeNo?: string;
  title: string;
  detail: string;
}

/** 调查员逐条填写的处理说明 */
export interface IssueResolution {
  key: string;
  handlingNote: string;
}

/** 交验操作留痕 */
export interface SubmissionEvent {
  at: number;
  type: 'pass' | 'withdraw';
  /** 撤销交验时必填的补测原因；交验通过一般留空 */
  reason: string;
}

/** 某样地某期的交验记录 */
export interface RoundSubmission {
  id: string;
  plotId: string;
  round: number;
  status: SubmissionStatus;
  /** 问题处理说明，按 issue key 索引；重新扫描后仍可保留已写说明 */
  issueResolutions: IssueResolution[];
  events: SubmissionEvent[];
  createdAt: number;
  updatedAt: number;
}

/** 交验记录主键：样地 + 期次 唯一 */
export function submissionId(plotId: string, round: number): string {
  return `${plotId}__r${round}`;
}
