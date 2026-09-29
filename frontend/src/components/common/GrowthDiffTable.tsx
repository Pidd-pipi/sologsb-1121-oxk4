import { Input, Table, Tag, Typography, type TableProps } from 'antd';
import { growthRate, isDiffAbnormal, type RecheckDiff } from '../../types/recheck';

export interface GrowthDiffTableProps {
  diffs: RecheckDiff[];
  emptyText?: string;
  /** 行内补写/修改缺测原因；不传则缺失原因只读 */
  onReasonChange?: (id: string, reason: string) => void;
  /** 已锁定（已交验）时整表只读 */
  readOnly?: boolean;
}

type Columns = NonNullable<TableProps<RecheckDiff>['columns']>;

const MISSING_REASON_OPTIONS = [
  '本期未复测（疑似采伐或倒伏）',
  '现场确认伐桩，已采伐',
  '倒伏枯损，保留样地外',
  '树号标识缺失，下期补挂',
  '本期新增进界木',
];

/** 两期逐株差值表，生长量为负或缺失时高亮；缺测原因可在行内补写 */
export default function GrowthDiffTable({
  diffs,
  emptyText = '暂无复查比对结果',
  onReasonChange,
  readOnly = false,
}: GrowthDiffTableProps) {
  const sorted = [...diffs].sort((a, b) =>
    a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }),
  );

  const columns: Columns = [
    { title: '树号', dataIndex: 'treeNo', width: 80 },
    { title: '树种', dataIndex: 'species', width: 110 },
    {
      title: '上期胸径 cm',
      dataIndex: 'baseDbhCm',
      width: 120,
      render: (value?: number) => (value === undefined ? <Tag color="red">缺测</Tag> : value),
    },
    {
      title: '本期胸径 cm',
      dataIndex: 'targetDbhCm',
      width: 120,
      render: (value?: number) => (value === undefined ? <Tag color="red">缺测</Tag> : value),
    },
    {
      title: '胸径生长量 cm',
      dataIndex: 'dbhGrowth',
      width: 140,
      render: (value: number) => (
        <Typography.Text type={value < 0 ? 'danger' : value > 0 ? 'success' : undefined}>
          {value > 0 ? `+${value}` : value}
        </Typography.Text>
      ),
    },
    {
      title: '树高生长量 m',
      dataIndex: 'heightGrowth',
      width: 140,
      render: (value: number) => (
        <Typography.Text type={value < 0 ? 'danger' : value > 0 ? 'success' : undefined}>
          {value > 0 ? `+${value}` : value}
        </Typography.Text>
      ),
    },
    {
      title: '保留木生长率',
      width: 130,
      render: (_: unknown, row: RecheckDiff) => {
        const rate = growthRate(row);
        return rate === 0 ? '—' : `${rate} %`;
      },
    },
    {
      title: '状态变化',
      dataIndex: 'statusChange',
      width: 170,
      render: (value: string) => (value ? <Tag color="orange">{value}</Tag> : '—'),
    },
    {
      title: '缺失/复查原因',
      dataIndex: 'missingReason',
      width: 260,
      render: (value: string, row: RecheckDiff) => {
        const needsReason = row.targetDbhCm === undefined || row.baseDbhCm === undefined;
        if (!onReasonChange || readOnly) {
          return needsReason && value ? <Tag color="red">{value}</Tag> : '—';
        }
        return (
          <Input
            size="small"
            value={value}
            status={needsReason && !value.trim() ? 'error' : undefined}
            placeholder={needsReason ? '缺测必须填写原因' : '—'}
            disabled={!needsReason}
            onChange={(e) => onReasonChange(row.id, e.target.value)}
            list={`reason-options-${row.id}`}
          />
        );
      },
    },
  ];

  return (
    <div data-testid="growth-diff-table">
      {/* 单行输入的常用原因候选（datalist 不影响布局） */}
      {sorted.map((d) => (
        <datalist key={d.id} id={`reason-options-${d.id}`}>
          {MISSING_REASON_OPTIONS.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      ))}
      <Table<RecheckDiff>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={sorted}
        pagination={false}
        scroll={{ x: 1300 }}
        locale={{ emptyText }}
        rowClassName={(row) => {
          const missingNoReason =
            (row.targetDbhCm === undefined || row.baseDbhCm === undefined) &&
            !row.missingReason.trim() &&
            !readOnly;
          return missingNoReason || isDiffAbnormal(row) ? 'diff-row-abnormal' : '';
        }}
      />
    </div>
  );
}
