/** 交验状态：待交验 / 需补测（撤销交验后）/ 已交验（本期已锁定） */
export type InspectionStatus = '待交验' | '需补测' | '已交验';

export const INSPECTION_STATUSES: InspectionStatus[] = ['待交验', '需补测', '已交验'];

/** 交验问题类别 */
export type IssueKind = 'dbh_abnormal' | 'negative_growth' | 'missing_reason' | 'heavy_browse';

export const ISSUE_KIND_ORDER: IssueKind[] = [
  'dbh_abnormal',
  'negative_growth',
  'missing_reason',
  'heavy_browse',
];

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  dbh_abnormal: '胸径异常',
  negative_growth: '负增长',
  missing_reason: '缺测未写原因',
  heavy_browse: '重度啃食',
};

export const ISSUE_KIND_COLOR: Record<IssueKind, string> = {
  dbh_abnormal: 'orange',
  negative_growth: 'red',
  missing_reason: 'volcano',
  heavy_browse: 'magenta',
};

/** 交验扫描出的单条问题 */
export interface InspectionIssue {
  /** 稳定键，调查员的处理说明按此键保存（类别:定位） */
  key: string;
  kind: IssueKind;
  /** 问题对象，如「树号 1（红松）」 */
  subject: string;
  /** 问题详情 */
  message: string;
  /** 关联记录 id（样木 / 更新层样方 / 复查比对行） */
  refId?: string;
}

/** 一期数据的交验记录（按期次锁定） */
export interface Inspection {
  /** 形如 insp_${plotId}_r${round} */
  id: string;
  plotId: string;
  /** 被交验锁定的复查期次 */
  round: number;
  status: InspectionStatus;
  /** 逐条问题处理说明，键为 InspectionIssue.key */
  notes: Record<string, string>;
  /** 最近一次撤销交验（转补测）的原因 */
  revokeReason: string;
  submittedAt?: number;
  revokedAt?: number;
}
