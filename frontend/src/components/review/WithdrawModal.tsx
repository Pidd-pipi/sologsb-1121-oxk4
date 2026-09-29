import { useEffect, useState } from 'react';
import { Alert, Input, Modal, Timeline, Typography } from 'antd';
import { useSubmissionStore } from '../../stores/submissionStore';
import { SUBMISSION_STATUS_LABEL } from '../../types/submission';

export interface WithdrawModalProps {
  open: boolean;
  plotId: string;
  round: number;
  onClose: () => void;
  onDone?: () => void;
}

/** 撤销交验弹窗：必须填写补测原因，撤销后该期转为「需补测」、录入页恢复可编辑 */
export default function WithdrawModal({ open, plotId, round, onClose, onDone }: WithdrawModalProps) {
  const submission = useSubmissionStore((s) =>
    s.items.find((x) => x.plotId === plotId && x.round === round),
  );
  const withdraw = useSubmissionStore((s) => s.withdraw);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  const history = [...(submission?.events ?? [])].reverse();

  const confirm = async () => {
    if (reason.trim().length < 5) {
      setError('请填写补测原因（至少 5 个字），撤销交验必须留痕');
      return;
    }
    setSaving(true);
    try {
      await withdraw(plotId, round, reason.trim());
      onDone?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`撤销交验 · 第 ${round} 期`}
      okText="撤销交验并转补测"
      cancelText="取消"
      okButtonProps={{ danger: true, loading: saving }}
      onOk={confirm}
      onCancel={onClose}
      width={620}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="撤销后本期数据解除锁定，样木、更新层与复查页恢复编辑；补测完成后须重新交验。"
      />
      <Typography.Text strong>补测原因（必填）</Typography.Text>
      {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 8 }} /> : null}
      <Input.TextArea
        data-testid="withdraw-reason"
        style={{ marginTop: 8 }}
        rows={3}
        maxLength={200}
        showCount
        placeholder="如：2 号样木胸径检尺位置存疑，需外业复测；更新层重度啃食需补写处理说明"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {history.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <Typography.Text type="secondary">交验留痕</Typography.Text>
          <Timeline
            style={{ marginTop: 8, marginBottom: 0 }}
            items={history.map((e) => ({
              color: e.type === 'pass' ? 'green' : 'orange',
              children: (
                <span>
                  <Typography.Text strong>{e.type === 'pass' ? '交验通过' : '撤销交验'}</Typography.Text>
                  <Typography.Text type="secondary">
                    {' '}
                    · {new Date(e.at).toLocaleString('zh-CN')}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </Typography.Text>
                </span>
              ),
            }))}
          />
        </div>
      ) : null}
      {submission ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          当前状态：{SUBMISSION_STATUS_LABEL[submission.status]}
        </Typography.Text>
      ) : null}
    </Modal>
  );
}
