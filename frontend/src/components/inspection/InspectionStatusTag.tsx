import { Badge, Tag } from 'antd';
import type { InspectionStatus } from '../../types/inspection';

export interface InspectionStatusTagProps {
  status: InspectionStatus;
  /** 未清零问题数 */
  openCount?: number;
  showIssueCount?: boolean;
}

const STATUS_COLOR: Record<InspectionStatus, string> = {
  待交验: 'gold',
  需补测: 'volcano',
  已交验: 'green',
};

/** 交验状态角标：待交验 / 需补测 / 已交验，附未清零问题数 */
export default function InspectionStatusTag({
  status,
  openCount = 0,
  showIssueCount = true,
}: InspectionStatusTagProps) {
  const pending = status !== '已交验' && showIssueCount && openCount > 0;
  return (
    <Badge count={pending ? openCount : 0} size="small" offset={[-4, 0]}>
      <Tag
        color={STATUS_COLOR[status]}
        data-testid={`inspection-status-${status}`}
        style={{ marginInlineEnd: 0 }}
      >
        {status}
        {showIssueCount && status !== '已交验' ? ` · ${openCount} 个问题` : ''}
      </Tag>
    </Badge>
  );
}
