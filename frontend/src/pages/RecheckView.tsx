import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { usePlotStore } from '../stores/plotStore';
import { useTreeStore } from '../stores/treeStore';
import { useRecheckStore } from '../stores/recheckStore';
import { useRoundReview } from '../hooks/useRoundReview';
import GrowthDiffTable from '../components/common/GrowthDiffTable';
import RoundTag from '../components/common/RoundTag';
import RoundSubmissionBar from '../components/review/RoundSubmissionBar';
import SubmissionStatusTag from '../components/review/SubmissionStatusTag';
import { buildRecheckDiffs } from '../utils/recheck';
import { growthRate, isDiffAbnormal, type RecheckDiff } from '../types/recheck';

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** /plots/:id/recheck 复查比对：逐株显示两期胸径/树高与生长量，标记缺失与状态变化 */
export default function RecheckView() {
  const { id = '' } = useParams();
  const plot = usePlotStore((s) => s.items.find((p) => p.id === id));
  const trees = useTreeStore((s) => s.items);
  const allDiffs = useRecheckStore((s) => s.items);
  const saveMany = useRecheckStore((s) => s.saveMany);
  const updateDiff = useRecheckStore((s) => s.update);

  const rounds = useMemo(
    () => Array.from(new Set(trees.filter((t) => t.plotId === id).map((t) => t.round))).sort((a, b) => a - b),
    [trees, id],
  );

  const [baseRound, setBaseRound] = useState<number>(1);
  const [targetRound, setTargetRound] = useState<number>(2);
  const [diffs, setDiffs] = useState<RecheckDiff[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (rounds.length >= 2) {
      setBaseRound(rounds[rounds.length - 2]);
      setTargetRound(rounds[rounds.length - 1]);
    } else if (rounds.length === 1) {
      setBaseRound(rounds[0]);
      setTargetRound(rounds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds.join(',')]);

  const signature = `${id}|${baseRound}|${targetRound}`;
  useEffect(() => {
    if (!id || baseRound === targetRound) return;
    const existing = allDiffs
      .filter((d) => d.plotId === id && d.baseRound === baseRound && d.targetRound === targetRound)
      .sort((a, b) => a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }));
    if (existing.length > 0) setDiffs(existing);
  }, [signature, allDiffs, id, baseRound, targetRound]);

  // 目标期次锁定时，复查页同样只读
  const review = useRoundReview(id, targetRound);
  const locked = review.locked;

  useEffect(() => {
    if (!toast && !error) return;
    const timer = window.setTimeout(() => {
      setToast('');
      setError('');
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [toast, error]);

  const generate = () => {
    if (locked) {
      setError('本期已交验锁定，如需重新生成比对表，请先撤销交验');
      return;
    }
    if (baseRound === targetRound) {
      setError('上期与本期不能是同一期次');
      return;
    }
    const generated = buildRecheckDiffs(id, baseRound, targetRound, trees);
    // 重新生成时保留已补写的缺失原因与状态变化（同树号合并）
    const prevMap = new Map(diffs.filter((d) => d.id.startsWith(`diff_${id}_`)).map((d) => [d.treeNo, d]));
    const merged = generated.map((d) => {
      const prev = prevMap.get(d.treeNo);
      return prev
        ? { ...d, missingReason: d.missingReason || prev.missingReason, statusChange: d.statusChange || prev.statusChange }
        : d;
    });
    setDiffs(merged);
    setError('');
    setToast(`已生成第 ${baseRound} 期 → 第 ${targetRound} 期的逐株比对表，共 ${merged.length} 条`);
  };

  const save = async () => {
    if (locked) {
      setError('本期已交验锁定，不能保存比对结果，请先撤销交验');
      return;
    }
    if (diffs.length === 0) {
      setError('请先生成比对表');
      return;
    }
    await saveMany(diffs);
    setToast(`逐株比对表已写入本地档案库（${diffs.length} 条）`);
  };

  const abnormal = diffs.filter(isDiffAbnormal).length;
  const missing = diffs.filter((d) => !d.targetDbhCm).length;
  const missingWithoutReason = diffs.filter((d) => d.targetDbhCm === undefined && !d.missingReason.trim()).length;
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
        <RoundTag round={targetRound} />
        <SubmissionStatusTag
          status={review.status}
          issueCount={review.issueCount}
          unresolvedCount={review.unresolvedCount}
        />
        <Tag>样地面积 {plot.area} m²</Tag>
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

      <RoundSubmissionBar plotId={plot.id} round={targetRound} pageName="复查页" />

      {toast ? <Alert type="success" showIcon message={toast} closable onClose={() => setToast('')} /> : null}
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}
      {!locked && missingWithoutReason > 0 ? (
        <Alert
          type="warning"
          showIcon
          data-testid="missing-reason-alert"
          message={`有 ${missingWithoutReason} 株本期缺测样木尚未填写复查原因，交验时将列为「本期缺测未写原因」问题，请在下方逐株补写后保存。`}
        />
      ) : null}

      <Card size="small">
        <Space wrap size={10}>
          <span>
            上期
            <Select
              style={{ width: 120, marginLeft: 6 }}
              value={baseRound}
              disabled={locked}
              onChange={setBaseRound}
              options={rounds.map((r) => ({ value: r, label: `第 ${r} 期` }))}
            />
          </span>
          <span>
            本期
            <Select
              style={{ width: 120, marginLeft: 6 }}
              value={targetRound}
              disabled={locked}
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
              title="异常标注（含未写原因）"
              value={abnormal}
              suffix="条"
              valueStyle={missingWithoutReason > 0 ? { color: '#cf1322' } : undefined}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={`两期逐株差值表（第 ${baseRound} 期 → 第 ${targetRound} 期）${locked ? ' · 本期已锁定只读' : ''}`}>
        <GrowthDiffTable
          diffs={diffs}
          readOnly={locked}
          onMissingReasonChange={(diffId, reason) => {
            if (locked) return;
            setDiffs((prev) => prev.map((d) => (d.id === diffId ? { ...d, missingReason: reason } : d)));
            // 即时写库，避免交验弹窗同步时漏取
            void updateDiff(diffId, { missingReason: reason }).then(() =>
              setToast('复查原因已保存'),
            );
          }}
        />
      </Card>
    </Space>
  );
}
