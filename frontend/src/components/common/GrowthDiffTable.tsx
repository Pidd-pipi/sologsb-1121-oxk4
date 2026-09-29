import { Input, Table, Tag, Tooltip, Typography, type TableProps } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { growthRate, isDiffAbnormal, type RecheckDiff } from '../../types/recheck';

export interface GrowthDiffTableProps {
  diffs: RecheckDiff[];
  emptyText?: string;
  /** 传入后，本期缺测行可直接补写缺失原因；不传或 readOnly 时纯展示 */
  onMissingReasonChange?: (id: string, reason: string) => void;
  readOnly?: boolean;
}

type Columns = NonNullable<TableProps<RecheckDiff>['columns']>;

/** 两期逐株差值表，生长量为负或缺失时高亮；本期缺测原因可行内补写 */
export default function GrowthDiffTable({
  diffs,
  emptyText = '暂无复查比对结果',
  onMissingReasonChange,
  readOnly = false,
}: GrowthDiffTableProps) {
  const sorted = [...diffs].sort((a, b) =>
    a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }),
  );
  const editable = !!onMissingReasonChange && !readOnly;

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
      title: '复查原因 / 缺失说明',
      dataIndex: 'missingReason',
      width: 260,
      render: (value: string, row: RecheckDiff) => {
        // 本期缺测（含新增进界木之外的未复测）行：原因是交验检查项
        const missing = row.targetDbhCm === undefined;
        const needReason = missing && !value.trim();
        if (editable && missing) {
          return (
            <Input
              size="small"
              defaultValue={value}
              status={needReason ? 'error' : undefined}
              placeholder="必填：采伐 / 倒伏 / 漏测等核实情况"
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== value) onMissingReasonChange?.(row.id, v);
              }}
            />
          );
        }
        if (needReason) {
          return (
            <Tooltip title="本期缺测且未写复查原因，交验时将列为问题">
              <Tag color="volcano" data-testid={`missing-reason-empty-${row.treeNo}`}>
                缺原因 <EditOutlined />
              </Tag>
            </Tooltip>
          );
        }
        return value ? <Tag color={missing ? 'red' : 'blue'}>{value}</Tag> : '—';
      },
    },
  ];

  return (
    <div data-testid="growth-diff-table">
      <Table<RecheckDiff>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={sorted}
        pagination={false}
        scroll={{ x: 1300 }}
        locale={{ emptyText }}
        rowClassName={(row) => (isDiffAbnormal(row) ? 'diff-row-abnormal' : '')}
      />
    </div>
  );
}
