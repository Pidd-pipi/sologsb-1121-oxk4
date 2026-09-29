import { Tag } from 'antd';
import type { InspectionStatus } from '../../types/inspection';

export interface RoundTagProps {
  round: number;
  /** 兼容旧调用：仅表示已锁定 */
  locked?: boolean;
  /** 本期交验状态，优先于 locked */
  status?: InspectionStatus;
}

/** 复查期次角标：附交验状态（待交验 / 需补测 / 已交验·已锁定） */
export default function RoundTag({ round, locked = false, status }: RoundTagProps) {
  const resolved: InspectionStatus = status ?? (locked ? '已交验' : '待交验');
  const color = resolved === '已交验' ? 'green' : resolved === '需补测' ? 'volcano' : round > 1 ? 'geekblue' : 'default';
  const suffix = resolved === '已交验' ? ' · 已锁定' : resolved === '需补测' ? ' · 需补测' : '';
  return (
    <Tag color={color} data-testid={`round-tag-${round}`}>
      第 {round} 期{suffix}
    </Tag>
  );
}
