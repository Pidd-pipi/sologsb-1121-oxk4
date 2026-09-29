import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
  type TableProps,
} from 'antd';
import { CheckCircleOutlined, FileDoneOutlined, RollbackOutlined } from '@ant-design/icons';
import { usePlotStore } from '../../stores/plotStore';
import { useInspectionStore } from '../../stores/inspectionStore';
import { useInspection } from '../../hooks/useInspection';
import { inspectionId } from '../../utils/db';
import InspectionStatusTag from './InspectionStatusTag';
import { ISSUE_KIND_COLOR, ISSUE_KIND_LABEL, type Inspection, type InspectionIssue } from '../../types/inspection';

export interface InspectionActionsProps {
  plotId: string;
  round: number;
  size?: 'small' | 'middle' | 'large';
  /** 在按钮前展示当前状态角标 */
  showTag?: boolean;
}

type Columns = NonNullable<TableProps<InspectionIssue>['columns']>;

/**
 * 交验入口：
 * - 待交验/需补测：打开交验单，逐条写处理说明，问题清零才能通过并锁定本期；
 * - 已交验：撤销交验并写原因，转回需补测、本期解锁。
 */
export default function InspectionActions({ plotId, round, size = 'small', showTag = false }: InspectionActionsProps) {
  const view = useInspection(plotId, round);
  const inspectionStore = useInspectionStore();
  const updatePlot = usePlotStore((s) => s.update);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [revokeReason, setRevokeReason] = useState('');

  useEffect(() => {
    if (submitOpen) setNotes({ ...(view?.notes ?? {}) });
  }, [submitOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftRows = useMemo(() => view?.issues ?? [], [view]);
  const openKeys = useMemo(
    () => new Set(draftRows.filter((i) => !notes[i.key]?.trim()).map((i) => i.key)),
    [draftRows, notes],
  );

  if (!view) return null;
  const locked = view.status === '已交验';

  const persistNotes = async (next: Record<string, string>, pass: boolean) => {
    if (pass) {
      await inspectionStore.submit(plotId, round, next);
      await updatePlot(plotId, { locked: true });
    } else {
      const base: Inspection =
        inspectionStore.byPlotRound(plotId, round) ?? {
          id: inspectionId(plotId, round),
          plotId,
          round,
          status: '待交验',
          notes: {},
          revokeReason: '',
        };
      await inspectionStore.save({ ...base, notes: { ...base.notes, ...next } });
    }
  };

  const doPass = async () => {
    if (openKeys.size > 0) return;
    await persistNotes(notes, true);
    setSubmitOpen(false);
    message.success(`第 ${round} 期交验通过，该期数据已锁定`);
  };

  const doRevoke = async () => {
    if (!revokeReason.trim()) {
      message.warning('请先填写撤销交验（补测）原因');
      return;
    }
    await inspectionStore.revoke(plotId, round, revokeReason.trim());
    await updatePlot(plotId, { locked: false });
    setRevokeOpen(false);
    setRevokeReason('');
    message.success(`已撤销第 ${round} 期交验，状态转为需补测`);
  };

  const columns: Columns = [
    {
      title: '类别',
      dataIndex: 'kind',
      width: 130,
      render: (kind: InspectionIssue['kind']) => <Tag color={ISSUE_KIND_COLOR[kind]}>{ISSUE_KIND_LABEL[kind]}</Tag>,
    },
    {
      title: '问题对象',
      dataIndex: 'subject',
      width: 200,
    },
    {
      title: '问题描述',
      dataIndex: 'message',
      width: 300,
      render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text>,
    },
    {
      title: '处理状态',
      width: 100,
      render: (_: unknown, row: InspectionIssue) =>
        notes[row.key]?.trim() ? <Tag color="green">已写说明</Tag> : <Tag color="red">待处理</Tag>,
    },
    {
      title: '处理说明（逐条填写）',
      render: (_: unknown, row: InspectionIssue) => (
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={notes[row.key] ?? ''}
          status={openKeys.has(row.key) ? 'error' : ''}
          placeholder="写明现场核实与处理情况，如复测确认、伐桩核实等"
          onChange={(e) => setNotes((prev) => ({ ...prev, [row.key]: e.target.value }))}
        />
      ),
    },
  ];

  return (
    <>
      <Space size={6} wrap>
        {showTag ? <InspectionStatusTag status={view.status} openCount={view.openIssues.length} /> : null}
        {locked ? (
          <Button
            size={size}
            danger
            icon={<RollbackOutlined />}
            onClick={() => setRevokeOpen(true)}
            data-testid="inspection-revoke-btn"
          >
            撤销交验（补测）
          </Button>
        ) : (
          <Badge count={view.openIssues.length} size="small">
            <Button
              size={size}
              type="primary"
              ghost
              icon={<FileDoneOutlined />}
              onClick={() => setSubmitOpen(true)}
              data-testid="inspection-submit-btn"
            >
              {view.status === '需补测' ? '补测后重新交验' : '交验'}
            </Button>
          </Badge>
        )}
      </Space>

      <Modal
        open={submitOpen}
        width={920}
        title={`第 ${round} 期交验单 · 问题逐条处理`}
        onCancel={() => setSubmitOpen(false)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type={openKeys.size > 0 ? 'danger' : 'success'}>
              {openKeys.size > 0
                ? `还有 ${openKeys.size} 条问题未写处理说明，问题清零后才可交验`
                : `全部 ${draftRows.length} 条问题已处理，可以交验`}
            </Typography.Text>
            <Space>
              <Button
                onClick={async () => {
                  await persistNotes(notes, false);
                  message.success('处理说明已暂存');
                }}
              >
                暂存说明
              </Button>
              <Button onClick={() => setSubmitOpen(false)}>关闭</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={openKeys.size > 0}
                onClick={doPass}
                data-testid="inspection-pass-btn"
              >
                交验通过并锁定
              </Button>
            </Space>
          </Space>
        }
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {view.status === '需补测' && view.revokeReason ? (
            <Alert
              type="warning"
              showIcon
              message={`本期处于需补测状态，上次撤销交验原因：${view.revokeReason}`}
            />
          ) : null}
          {draftRows.length === 0 ? (
            <Alert
              type="success"
              showIcon
              message="本期未扫描到交验问题（胸径异常、负增长、缺测未写原因、重度啃食均无），可直接交验通过"
            />
          ) : (
            <>
              <Alert
                type={openKeys.size > 0 ? 'error' : 'success'}
                showIcon
                message={
                  openKeys.size > 0
                    ? `共 ${draftRows.length} 条问题，${openKeys.size} 条待处理。请逐条填写处理说明，问题清零后才能交验通过并锁定本期数据。`
                    : `共 ${draftRows.length} 条问题，均已填写处理说明。`
                }
              />
              {view.staleNoteCount > 0 ? (
                <Alert type="info" showIcon message={`另有 ${view.staleNoteCount} 条历史说明对应的问题已通过改正数据消除。`} />
              ) : null}
              <Table<InspectionIssue>
                rowKey="key"
                size="small"
                columns={columns}
                dataSource={draftRows}
                pagination={false}
                scroll={{ y: 380 }}
              />
            </>
          )}
        </Space>
      </Modal>

      <Modal
        open={revokeOpen}
        width={520}
        title={`撤销第 ${round} 期交验 · 转补测`}
        onCancel={() => setRevokeOpen(false)}
        onOk={doRevoke}
        okText="确认撤销并解锁"
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="撤销交验后本期样木、更新层、复查三个录入页将解锁可改，状态转为「需补测」；补测完成后需重新交验。"
          />
          <Input.TextArea
            rows={3}
            value={revokeReason}
            placeholder="必填：撤销交验、安排补测的原因，如现场补测胸径、核实采伐情况"
            onChange={(e) => setRevokeReason(e.target.value)}
            data-testid="inspection-revoke-reason"
          />
        </Space>
      </Modal>
    </>
  );
}
