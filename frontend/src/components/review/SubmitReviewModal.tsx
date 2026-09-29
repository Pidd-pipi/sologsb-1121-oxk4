import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Progress,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  type TableProps,
} from 'antd';
import { CheckCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useSubmissionStore } from '../../stores/submissionStore';
import { useRecheckStore } from '../../stores/recheckStore';
import { useRoundReview } from '../../hooks/useRoundReview';
import {
  ISSUE_KIND_COLOR,
  ISSUE_KIND_LABEL,
  type IssueResolution,
  type ReviewIssue,
} from '../../types/submission';

export interface SubmitReviewModalProps {
  open: boolean;
  plotId: string;
  round: number;
  onClose: () => void;
  onPassed?: () => void;
}

type Columns = NonNullable<TableProps<ReviewIssue>['columns']>;

/** 交验弹窗：列出四类问题，调查员逐条写处理说明，问题清零方可交验通过并锁定 */
export default function SubmitReviewModal({ open, plotId, round, onClose, onPassed }: SubmitReviewModalProps) {
  const review = useRoundReview(plotId, round);
  const saveDraft = useSubmissionStore((s) => s.saveDraft);
  const pass = useSubmissionStore((s) => s.pass);
  const rechecks = useRecheckStore((s) => s.items);
  const saveRechecks = useRecheckStore((s) => s.saveMany);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const draftTimer = useRef<number | undefined>(undefined);

  const keySignature = useMemo(() => review.issues.map((i) => i.key).join('|'), [review.issues]);

  // 每次打开 / 检出问题集合变化时，用已存草稿初始化处理说明
  useEffect(() => {
    if (!open) return;
    setMessage('');
    const map: Record<string, string> = {};
    review.resolutions.forEach((r) => {
      map[r.key] = r.handlingNote;
    });
    setNotes(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, keySignature]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, []);

  const resolutionList: IssueResolution[] = useMemo(
    () => review.issues.map((i) => ({ key: i.key, handlingNote: notes[i.key] ?? '' })),
    [review.issues, notes],
  );

  const unresolvedCount = resolutionList.filter((r) => r.handlingNote.trim() === '').length;
  const filledCount = review.issues.length - unresolvedCount;
  const percent = review.issues.length === 0 ? 100 : Math.round((filledCount / review.issues.length) * 100);

  const persistDraft = (next: IssueResolution[], force = false) => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    const run = () => {
      void saveDraft(plotId, round, next).then(() => {
        if (force) setMessage('处理说明已暂存');
      });
    };
    if (force) run();
    else draftTimer.current = window.setTimeout(run, 600);
  };

  const handleChange = (key: string, value: string) => {
    const nextMap = { ...notes, [key]: value };
    setNotes(nextMap);
    persistDraft(review.issues.map((i) => ({ key: i.key, handlingNote: nextMap[i.key] ?? '' })));
  };

  const handleClose = async () => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    // 关闭前保存一次草稿（状态保持待交验/需补测）
    await saveDraft(plotId, round, resolutionList);
    onClose();
  };

  const handlePass = async () => {
    if (review.issues.length === 0) {
      setSaving(true);
      try {
        await pass(plotId, round, []);
        onPassed?.();
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }
    if (unresolvedCount > 0) {
      setMessage(`还有 ${unresolvedCount} 条问题未写处理说明，问题清零后才能交验通过`);
      return;
    }
    setSaving(true);
    try {
      // 「本期缺测未写原因」类问题：处理说明即复查原因，同步写回比对结果
      const missingKeys = new Set(
        review.issues.filter((i) => i.kind === 'missingNoReason').map((i) => i.key),
      );
      if (missingKeys.size > 0) {
        const treeByKey = new Map(
          review.issues.filter((i) => i.kind === 'missingNoReason').map((i) => [i.key, i.treeNo ?? '']),
        );
        const patched = rechecks
          .filter((d) => d.plotId === plotId && d.targetRound === round && d.targetDbhCm === undefined)
          .map((d) => {
            const key = `missingNoReason:${d.treeNo}`;
            if (!missingKeys.has(key)) return d;
            return { ...d, missingReason: notes[key] ?? treeByKey.get(key) ?? d.missingReason };
          });
        await saveRechecks(patched);
      }
      await pass(plotId, round, resolutionList);
      onPassed?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const columns: Columns = [
    {
      title: '类别',
      dataIndex: 'kind',
      width: 150,
      render: (kind: ReviewIssue['kind']) => (
        <Tag color={ISSUE_KIND_COLOR[kind]} data-testid={`issue-kind-${kind}`}>
          {ISSUE_KIND_LABEL[kind]}
        </Tag>
      ),
    },
    {
      title: '问题',
      width: 320,
      render: (_: unknown, row: ReviewIssue) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{row.title}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.detail}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '调查员处理说明（必填）',
      render: (_: unknown, row: ReviewIssue) => (
        <Input.TextArea
          aria-label={`处理说明 ${row.key}`}
          rows={2}
          maxLength={200}
          showCount
          value={notes[row.key] ?? ''}
          status={(notes[row.key] ?? '').trim() ? undefined : 'error'}
          placeholder="逐条写明核实结果或处理措施，如：复核为检尺位置上移 10cm，已按新位置更正；已确认采伐留根"
          onChange={(e) => handleChange(row.key, e.target.value)}
        />
      ),
    },
  ];

  const history = [...(review.submission?.events ?? [])].reverse();

  return (
    <Modal
      open={open}
      title={
        <Space>
          <SafetyCertificateOutlined />
          交验检查 · 第 {round} 期
        </Space>
      }
      width={900}
      onCancel={handleClose}
      maskClosable={false}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Tag color={review.issues.length === 0 ? 'success' : unresolvedCount > 0 ? 'red' : 'orange'}>
              检出问题 {review.issues.length} 条 · 已处理 {filledCount} 条 · 待处理 {unresolvedCount} 条
            </Tag>
            {message ? <Typography.Text type="danger">{message}</Typography.Text> : null}
          </Space>
          <Space>
            <Button onClick={handleClose}>稍后处理</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={saving}
              data-testid="submit-pass-btn"
              onClick={handlePass}
            >
              问题清零，交验通过并锁定
            </Button>
          </Space>
        </Space>
      }
    >
      {review.issues.length === 0 ? (
        <Empty
          style={{ padding: '24px 0' }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span>
              未发现胸径异常、负增长、缺测未写原因或重度啃食问题，可直接交验通过，锁定第 {round} 期数据。
            </span>
          }
        />
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 10 }}
            message="提交交验时按「胸径异常 / 负增长 / 本期缺测未写原因 / 重度啃食」列出问题，须逐条填写处理说明；问题清零才能交验通过。"
          />
          <Progress
            percent={percent}
            size="small"
            status={unresolvedCount === 0 ? 'success' : 'active'}
            format={() => `${filledCount}/${review.issues.length}`}
            style={{ marginBottom: 10 }}
          />
          <div data-testid="review-issue-table">
            <Table<ReviewIssue>
              rowKey="key"
              size="small"
              columns={columns}
              dataSource={review.issues}
              pagination={false}
              scroll={{ y: 340 }}
            />
          </div>
        </>
      )}
      {history.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <Typography.Text type="secondary">交验留痕</Typography.Text>
          <Timeline
            style={{ marginTop: 8, marginBottom: 0 }}
            items={history.map((e) => ({
              color: e.type === 'pass' ? 'green' : 'orange',
              children: (
                <span>
                  <Typography.Text strong>{e.type === 'pass' ? '交验通过' : '撤销交验（需补测）'}</Typography.Text>
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
    </Modal>
  );
}
