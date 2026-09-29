import type { ReactNode } from 'react';
import { Tag, Tooltip } from 'antd';
import {
  CheckCircleTwoTone,
  ClockCircleTwoTone,
  ExclamationCircleTwoTone,
} from '@ant-design/icons';
import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from '../../types/submission';

export interface SubmissionStatusTagProps {
  status: SubmissionStatus;
  /** 待交验 / 需补测时的检出问题数 */
  issueCount?: number;
  /** 未处理问题数（不传则不区分） */
  unresolvedCount?: number;
  showIssue?: boolean;
}

const STATUS_META: Record<SubmissionStatus, { color: string; icon: ReactNode }> = {
  pending: { color: 'default', icon: <ClockCircleTwoTone twoToneColor="#8c8c8c" /> },
  resurvey: { color: 'orange', icon: <ExclamationCircleTwoTone twoToneColor="#d46b08" /> },
  submitted: { color: 'success', icon: <CheckCircleTwoTone twoToneColor="#52c41a" /> },
};

/** 期次交验状态角标：待交验 / 需补测（问题数）/ 已交验 */
export default function SubmissionStatusTag({
  status,
  issueCount,
  unresolvedCount,
  showIssue = true,
}: SubmissionStatusTagProps) {
  const meta = STATUS_META[status];
  const label =
    showIssue && status !== 'submitted' && typeof issueCount === 'number'
      ? `${SUBMISSION_STATUS_LABEL[status]} · 问题 ${issueCount}${
          typeof unresolvedCount === 'number' && unresolvedCount > 0 ? `（待处理 ${unresolvedCount}）` : ''
        }`
      : SUBMISSION_STATUS_LABEL[status];
  const tag = (
    <Tag color={meta.color} icon={meta.icon} data-testid={`submission-status-${status}`}>
      {label}
    </Tag>
  );
  if (status === 'resurvey') {
    return <Tooltip title="该期曾交验锁定，后因补测撤销；补测完成后需重新交验">{tag}</Tooltip>;
  }
  return tag;
}
