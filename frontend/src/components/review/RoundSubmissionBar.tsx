import { Alert, Card, Space, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useRoundReview } from '../../hooks/useRoundReview';
import SubmissionControls from './SubmissionControls';

export interface RoundSubmissionBarProps {
  plotId: string;
  round: number;
  /** 三个录入页名称，用于只读提示文案 */
  pageName: string;
}

/**
 * 期次交验状态条（样木 / 更新层 / 复查页顶部）：
 * - 已交验：提示该期已锁定、本页只读，提供撤销交验入口
 * - 待交验/需补测：提示待处理问题数，提供提交交验入口
 */
export default function RoundSubmissionBar({ plotId, round, pageName }: RoundSubmissionBarProps) {
  const review = useRoundReview(plotId, round);

  if (review.locked) {
    return (
      <Card size="small" data-testid="round-locked-banner">
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Alert
            type="success"
            showIcon
            style={{ flex: 1, minWidth: 320 }}
            icon={<LockOutlined />}
            message={`第 ${round} 期已交验锁定，${pageName}仅供查看，不能增删改。`}
            description={
              review.submission?.events.some((e) => e.type === 'pass')
                ? `最近交验通过：${new Date(
                    [...review.submission!.events].reverse().find((e) => e.type === 'pass')!.at,
                  ).toLocaleString('zh-CN')}；如需补测，请先撤销交验并写明原因。`
                : '如需补测，请先撤销交验并写明原因。'
            }
          />
          <SubmissionControls plotId={plotId} round={round} showTag={false} />
        </Space>
      </Card>
    );
  }

  const isResurvey = review.status === 'resurvey';
  return (
    <Card size="small" data-testid="round-open-banner">
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Alert
          type={isResurvey ? 'warning' : 'info'}
          showIcon
          style={{ flex: 1, minWidth: 320 }}
          message={
            isResurvey
              ? `第 ${round} 期处于需补测状态，${pageName}可继续修改。`
              : `第 ${round} 期尚未交验，${pageName}可编辑。`
          }
          description={
            <Space direction="vertical" size={2}>
              <Typography.Text type="secondary">
                交验将检查胸径异常、负增长、本期缺测未写原因、重度啃食共 {review.issueCount} 条问题
                {review.unresolvedCount > 0 ? `，其中 ${review.unresolvedCount} 条未写处理说明` : ''}
                ，问题清零方可交验通过并锁定。
              </Typography.Text>
              {isResurvey && review.lastWithdrawReason ? (
                <Typography.Text type="warning">补测原因：{review.lastWithdrawReason}</Typography.Text>
              ) : null}
            </Space>
          }
        />
        <SubmissionControls plotId={plotId} round={round} showTag />
      </Space>
    </Card>
  );
}
