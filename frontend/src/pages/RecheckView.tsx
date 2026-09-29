import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { SaveOutlined, LockOutlined } from '@ant-design/icons';
import { usePlotStore } from '../stores/plotStore';
import { useTreeStore } from '../stores/treeStore';
import { useRecheckStore } from '../stores/recheckStore';
import GrowthDiffTable from '../components/common/GrowthDiffTable';
import RoundTag from '../components/common/RoundTag';
import InspectionActions from '../components/inspection/InspectionActions';
import { useInspection } from '../hooks/useInspection';
import { newId } from '../utils/id';
import { growthRate, isDiffAbnormal, type RecheckDiff } from '../types/recheck';
import type { TreeRecord } from '../types/tree';

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** /plots/:id/recheck 复查比对：逐株显示两期胸径/树高与生长量，标记缺失与状态变化 */
export default function RecheckView() {
  const { id = '' } = useParams();
  const plot = usePlotStore((s) => s.items.find((p) => p.id === id));
  const trees = useTreeStore((s) => s.items);
  const savedDiffs = useRecheckStore((s) => s.items);
  const saveRound = useRecheckStore((s) => s.saveRound);
  const updateOne = useRecheckStore((s) => s.updateOne);

  const rounds = useMemo(
    () => Array.from(new Set(trees.filter((t) => t.plotId === id).map((t) => t.round))).sort((a, b) => a - b),
    [trees, id],
  );

  const [baseRound, setBaseRound] = useState<number>(rounds[0] ?? 1);
  const [targetRound, setTargetRound] = useState<number>(rounds[rounds.length - 1] ?? 2);
  const [diffs, setDiffs] = useState<RecheckDiff[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const inspection = useInspection(id, targetRound);
  const locked = inspection?.status === '已交验';

  useEffect(() => {
    if (rounds.length >= 2) {
      setBaseRound(rounds[rounds.length - 2]);
      setTargetRound(rounds[rounds.length - 1]);
    }
  }, [rounds.join(',')]);

  // 已保存的该上下期比对结果自动载入（已保存行被修改时不覆盖未保存的内存表）
  useEffect(() => {
    const rows = savedDiffs
      .filter((d) => d.plotId === id && d.baseRound === baseRound && d.targetRound === targetRound)
      .sort((a, b) => a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }));
    setDiffs((prev) => {
      if (prev.length > 0 && rows.length > 0) {
        const touched = new Set(prev.map((d) => d.id));
        if (rows.every((d) => touched.has(d.id))) return prev;
      }
      return rows;
    });
  }, [id, savedDiffs, baseRound, targetRound]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const generate = () => {
    if (locked) return;
    if (baseRound === targetRound) {
      setError('上期与本期不能是同一期次');
      return;
    }
    const baseList = trees.filter((t) => t.plotId === id && t.round === baseRound);
    const targetList = trees.filter((t) => t.plotId === id && t.round === targetRound);
    const baseMap = new Map<string, TreeRecord>();
    baseList.forEach((t) => baseMap.set(t.treeNo, t));
    const targetMap = new Map<string, TreeRecord>();
    targetList.forEach((t) => targetMap.set(t.treeNo, t));
    const allNos = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()])).sort((a, b) =>
      a.localeCompare(b, 'zh-Hans-CN', { numeric: true }),
    );

    const next: RecheckDiff[] = allNos.map((treeNo) => {
      const b = baseMap.get(treeNo);
      const t = targetMap.get(treeNo);
      const baseDbh = b?.dbhCm;
      const targetDbh = t?.dbhCm;
      const dbhGrowth =
        baseDbh !== undefined && targetDbh !== undefined ? r2(targetDbh - baseDbh) : 0;
      const heightGrowth =
        b && t ? r2(t.heightM - b.heightM) : 0;
      const statusChange = b && t && b.status !== t.status ? `${b.status} → ${t.status}` : '';
      // 缺测原因须由调查员补写：仅上期已采伐木自动标注，其余缺测/进界留空（留空即交验问题）
      const missingReason = !t && b?.status === '采伐' ? '上期已采伐，本期无此木' : '';
      return {
        id: newId('diff'),
        plotId: id,
        baseRound,
        targetRound,
        treeNo,
        species: t?.species ?? b?.species ?? '',
        baseDbhCm: baseDbh,
        targetDbhCm: targetDbh,
        baseHeightM: b?.heightM,
        targetHeightM: t?.heightM,
        dbhGrowth,
        heightGrowth,
        statusChange,
        missingReason,
        generatedAt: Date.now(),
      };
    });

    setDiffs(next);
    setError('');
    setToast(`已生成第 ${baseRound} 期 → 第 ${targetRound} 期的逐株比对表，共 ${next.length} 条；缺测行请补写原因`);
  };

  const save = async () => {
    if (locked) return;
    if (diffs.length === 0) {
      setError('请先生成比对表');
      return;
    }
    await saveRound(id, baseRound, targetRound, diffs);
    setToast(`逐株比对表已写入本地档案库（${diffs.length} 条）`);
  };

  const abnormal = diffs.filter(isDiffAbnormal).length;
  const missing = diffs.filter((d) => !d.targetDbhCm || !d.baseDbhCm).length;
  const missingNoReason = diffs.filter(
    (d) => (d.targetDbhCm === undefined || d.baseDbhCm === undefined) && !d.missingReason.trim(),
  ).length;
  const avgRate =
    diffs.filter((d) => d.targetDbhCm).length === 0
      ? 0
      : r2(
          diffs.filter((d) => d.targetDbhCm).reduce((s, d) => s + growthRate(d), 0) /
            diffs.filter((d) => d.targetDbhCm).length,
        );

  if (!plot) {
    return (
      <Space direction="vertical">
        <Alert type="warning" showIcon message="未找到该样地" />
        <Link to="/plots">返回样地台账</Link>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          复查比对 · {plot.plotNo}
        </Typography.Title>
        <RoundTag round={targetRound} status={inspection?.status} />
        <Tag>样地面积 {plot.area} m²</Tag>
        {inspection ? <InspectionActions plotId={plot.id} round={targetRound} /> : null}
        <div style={{ flex: 1 }} />
        <Button type="link">
          <Link to={`/plots/${plot.id}/trees`}>样木录入</Link>
        </Button>
        <Button type="link">
          <Link to={`/plots/${plot.id}/regen`}>更新与灌木</Link>
        </Button>
        <Button type="link">
          <Link to={`/summary/${plot.id}`}>林分汇总</Link>
        </Button>
      </Space>

      {toast ? <Alert type="success" showIcon message={toast} closable onClose={() => setToast('')} /> : null}
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}

      {locked ? (
        <Alert
          type="success"
          showIcon
          icon={<LockOutlined />}
          message={`第 ${targetRound} 期已交验并锁定，复查比对只可查看。如需补测请先撤销交验并填写原因。`}
        />
      ) : (
        <Alert
          type="info"
          showIcon
          message="缺测行必须补写复查原因（输入框提供常用原因候选），保存后交验扫描才会认可；负增长、重度啃食等请在交验单中逐条写处理说明。"
        />
      )}

      <Card size="small">
        <Space wrap size={10}>
          <span>
            上期
            <Select
              style={{ width: 120, marginLeft: 6 }}
              value={baseRound}
              onChange={setBaseRound}
              disabled={locked}
              options={rounds.map((r) => ({ value: r, label: `第 ${r} 期` }))}
            />
          </span>
          <span>
            本期
            <Select
              style={{ width: 120, marginLeft: 6 }}
              value={targetRound}
              onChange={setTargetRound}
              options={rounds.map((r) => ({ value: r, label: `第 ${r} 期` }))}
            />
          </span>
          <Button type="primary" onClick={generate} disabled={locked}>
            生成逐株比对表
          </Button>
          <Button icon={<SaveOutlined />} onClick={save} disabled={locked}>
            保存比对结果
          </Button>
          <Typography.Text type="secondary">
            可选期次：{rounds.length === 0 ? '暂无数据' : rounds.map((r) => `第 ${r} 期`).join('、')}
          </Typography.Text>
        </Space>
      </Card>

      <Row gutter={12}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="比对数" value={diffs.length} suffix="株" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="平均保留木生长率" value={avgRate} precision={2} suffix="%" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="缺测 / 无法匹配" value={missing} suffix="株" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="交验相关问题"
              value={abnormal + missingNoReason}
              suffix={`条（其中缺测未写原因 ${missingNoReason}）`}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="两期逐株差值表">
        <GrowthDiffTable
          diffs={diffs}
          readOnly={locked}
          onReasonChange={
            locked
              ? undefined
              : (diffId, reason) => {
                  setDiffs((prev) => prev.map((d) => (d.id === diffId ? { ...d, missingReason: reason } : d)));
                  const saved = savedDiffs.find((d) => d.id === diffId);
                  if (saved) void updateOne(diffId, { missingReason: reason });
                }
          }
        />
        {!locked && diffs.length > 0 ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            补写缺测原因后请点「保存比对结果」；已保存的行也会即时写入档案库。
          </Typography.Paragraph>
        ) : null}
      </Card>
    </Space>
  );
}
