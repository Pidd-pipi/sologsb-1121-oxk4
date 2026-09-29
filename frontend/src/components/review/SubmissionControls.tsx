import { useState } from 'react';
import { Button, Popconfirm, Space } from 'antd';
import { LockOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons';
import { useRoundReview } from '../../hooks/useRoundReview';
import SubmissionStatusTag from './SubmissionStatusTag';
import SubmitReviewModal from './SubmitReviewModal';
import WithdrawModal from './WithdrawModal';

export interface SubmissionControlsProps {
  plotId: string;
  round: number;
  /** 按钮形态：link 用于卡片/页内链接区，button 用于醒目操作条 */
  variant?: 'link' | 'button';
  /** 是否同时显示状态角标 */
  showTag?: boolean;
  /** 交验通过/撤销后的回调（可用于提示） */
  onChange?: () => void;
}

/**
 * 期次交验操作区：
 * - 待交验：提交交验
 * - 需补测：继续补测后提交交验（显示问题数）
 * - 已交验：撤销交验（须写补测原因）
 * 弹窗状态在组件内部自管，台账卡片与页面操作条共用。
 */
export default function SubmissionControls({
  plotId,
  round,
  variant = 'link',
  showTag = true,
  onChange,
}: SubmissionControlsProps) {
  const review = useRoundReview(plotId, round);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const isLink = variant === 'link';

  return (
    <>
      <Space size={6} wrap>
        {showTag ? (
          <SubmissionStatusTag
            status={review.status}
            issueCount={review.issueCount}
            unresolvedCount={review.unresolvedCount}
          />
        ) : null}
        {review.locked ? (
          <Popconfirm
            title="撤销交验需要填写补测原因"
            description="撤销后本期录入页恢复编辑，补测完成后须重新交验。"
            okText="继续"
            cancelText="取消"
            onConfirm={() => setWithdrawOpen(true)}
          >
            <Button
              size={isLink ? 'small' : 'middle'}
              type={isLink ? 'link' : 'default'}
              danger
              icon={<RollbackOutlined />}
            >
              撤销交验
            </Button>
          </Popconfirm>
        ) : (
          <Button
            size={isLink ? 'small' : 'middle'}
            type={isLink ? 'link' : 'primary'}
            icon={review.status === 'resurvey' ? <SendOutlined /> : <LockOutlined />}
            danger={review.unresolvedCount > 0}
            onClick={() => setReviewOpen(true)}
            data-testid={`submit-review-btn-${round}`}
          >
            {review.status === 'resurvey' ? '补测完成，提交交验' : '提交交验'}
          </Button>
        )}
      </Space>
      <SubmitReviewModal
        open={reviewOpen}
        plotId={plotId}
        round={round}
        onClose={() => setReviewOpen(false)}
        onPassed={() => onChange?.()}
      />
      <WithdrawModal
        open={withdrawOpen}
        plotId={plotId}
        round={round}
        onClose={() => setWithdrawOpen(false)}
        onDone={() => onChange?.()}
      />
    </>
  );
}
