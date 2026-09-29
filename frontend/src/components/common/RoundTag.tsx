import { Tag } from 'antd';

export interface RoundTagProps {
  round: number;
  /** @deprecated 期次锁定状态改由 SubmissionStatusTag 展示 */
  locked?: boolean;
}

/** 复查期次角标（交验状态见 SubmissionStatusTag），被样地台账、各录入页消费 */
export default function RoundTag({ round }: RoundTagProps) {
  return (
    <Tag color={round > 1 ? 'geekblue' : 'default'} data-testid={`round-tag-${round}`}>
      第 {round} 期
    </Tag>
  );
}
