import Dexie, { type Table } from 'dexie';
import type { Plot } from '../types/plot';
import type { TreeRecord } from '../types/tree';
import type { RegenShrub } from '../types/regen';
import type { RecheckDiff } from '../types/recheck';
import type { RoundSubmission } from '../types/submission';
import { newId, diffId } from './id';
import { submissionId } from '../types/submission';

export const DB_NAME = 'gbforestplot';
export const DB_VERSION = 3;
export const LS_VERSION_KEY = 'gbforestplot:db-version';

class ForestPlotDB extends Dexie {
  plots!: Table<Plot, string>;
  trees!: Table<TreeRecord, string>;
  regens!: Table<RegenShrub, string>;
  rechecks!: Table<RecheckDiff, string>;
  submissions!: Table<RoundSubmission, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      plots: 'id, plotNo, locality, forestType, surveyRound, createdAt',
      trees: 'id, plotId, treeNo, species, round, status',
      regens: 'id, plotId, layer, species, round',
      rechecks: 'id, plotId, baseRound, targetRound, treeNo',
    });
    this.version(2)
      .stores({
        plots: 'id, plotNo, locality, forestType, surveyRound, locked, createdAt',
        trees: 'id, plotId, treeNo, species, round, status, measuredAt',
        regens: 'id, plotId, layer, species, round, heightCm',
        rechecks: 'id, plotId, baseRound, targetRound, treeNo, generatedAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('plots')
          .toCollection()
          .modify((row: any) => {
            if (row.locked === undefined) row.locked = false;
            if (row.surveyRound === undefined) row.surveyRound = 1;
          });
        await tx
          .table('trees')
          .toCollection()
          .modify((row: any) => {
            if (row.round === undefined) row.round = 1;
            if (row.measuredAt === undefined) row.measuredAt = Date.now();
          });
      });
    // v3：新增期次交验表（待交验 / 需补测 / 已交验），老样地 locked=true 视为该期已交验
    this.version(3)
      .stores({
        plots: 'id, plotNo, locality, forestType, surveyRound, locked, createdAt',
        trees: 'id, plotId, treeNo, species, round, status, measuredAt',
        regens: 'id, plotId, layer, species, round, heightCm',
        rechecks: 'id, plotId, baseRound, targetRound, treeNo, generatedAt',
        submissions: 'id, plotId, round, status, updatedAt',
      })
      .upgrade(async (tx) => {
        const plots = await tx.table<Plot, string>('plots').toArray();
        const now = Date.now();
        const rows: RoundSubmission[] = plots
          .filter((p) => p.locked)
          .map((p) => ({
            id: submissionId(p.id, p.surveyRound),
            plotId: p.id,
            round: p.surveyRound,
            status: 'submitted',
            issueResolutions: [],
            events: [
              {
                at: now,
                type: 'pass',
                reason: '由 v2 往期锁定数据迁移，视作已交验',
              },
            ],
            createdAt: now,
            updatedAt: now,
          }));
        if (rows.length > 0) await tx.table('submissions').bulkPut(rows);

        // 复查比对主键规范化为稳定 id（同一样地-上下期-树号唯一），并按该口径去重
        const oldDiffs = await tx.table<RecheckDiff, string>('rechecks').toArray();
        const byKey = new Map<string, RecheckDiff>();
        const staleIds: string[] = [];
        oldDiffs.forEach((d) => {
          const stableId = diffId(d.plotId, d.baseRound, d.targetRound, d.treeNo);
          if (stableId === d.id) return; // 已经是稳定 id
          staleIds.push(d.id);
          const kept = byKey.get(stableId);
          if (!kept || d.generatedAt > kept.generatedAt) byKey.set(stableId, { ...d, id: stableId });
        });
        if (staleIds.length > 0) {
          await tx.table('rechecks').bulkDelete(staleIds);
          await tx.table('rechecks').bulkPut(Array.from(byKey.values()));
        }
      });
  }
}

export const db = new ForestPlotDB();

export function markDbVersion(): void {
  try {
    window.localStorage.setItem(LS_VERSION_KEY, String(DB_VERSION));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

export function readDbVersion(): number {
  try {
    const raw = window.localStorage.getItem(LS_VERSION_KEY);
    return raw ? Number(raw) : DB_VERSION;
  } catch {
    return DB_VERSION;
  }
}

export async function saveRecheckDiffs(diffs: RecheckDiff[]): Promise<void> {
  await db.rechecks.bulkPut(diffs);
}

export async function loadRecheckDiffs(plotId: string): Promise<RecheckDiff[]> {
  const rows = await db.rechecks.where('plotId').equals(plotId).toArray();
  return rows.sort((a, b) => a.treeNo.localeCompare(b.treeNo));
}

/** 首次进入灌入示范样地与两期样木数据 */
export async function ensureSeedData(): Promise<void> {
  const count = await db.plots.count();
  if (count > 0) return;

  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const plotId = newId('plot');
  const plot2Id = newId('plot');

  const plots: Plot[] = [
    {
      id: plotId,
      plotNo: 'FP-4102',
      locality: '黑龙江凉水林场 12 林班',
      lng: 128.8934,
      lat: 47.1832,
      shape: '方形',
      area: 600,
      elevation: 412,
      slope: 8,
      aspect: '东南',
      forestType: '针阔混交林',
      canopyDensity: 0.72,
      dominantSpecies: '红松 + 紫椴',
      surveyRound: 2,
      surveyedAt: now - 6 * day,
      crew: '调查一组（顾青、李慕）',
      locked: true,
      createdAt: now - 400 * day,
    },
    {
      id: plot2Id,
      plotNo: 'FP-4115',
      locality: '黑龙江凉水林场 15 林班',
      lng: 128.9012,
      lat: 47.1901,
      shape: '圆形',
      area: 500,
      elevation: 388,
      slope: 14,
      aspect: '西南',
      forestType: '阔叶林',
      canopyDensity: 0.65,
      dominantSpecies: '蒙古栎',
      surveyRound: 2,
      surveyedAt: now - 3 * day,
      crew: '调查二组（周砚）',
      locked: false,
      createdAt: now - 120 * day,
    },
  ];

  type Seed = [string, string, number, number, number, number, TreeRecord['status']];
  const seeds: Seed[] = [
    ['1', '红松', 34.2, 18.6, 7.4, 5.2, '活立木'],
    ['2', '紫椴', 26.8, 15.2, 5.1, 4.4, '活立木'],
    ['3', '红松', 41.5, 21.3, 9.2, 6.1, '活立木'],
    ['4', '蒙古栎', 18.4, 11.5, 3.6, 3.2, '活立木'],
    ['5', '色木槭', 12.6, 9.4, 2.8, 2.6, '活立木'],
  ];

  const trees: TreeRecord[] = [];
  seeds.forEach(([treeNo, species, dbh, h, ubh, cw, status]) => {
    trees.push({
      id: newId('tree'),
      plotId,
      treeNo,
      species,
      dbhCm: dbh,
      heightM: h,
      underBranchH: ubh,
      crownWidth: cw,
      status,
      origin: '天然',
      healthClass: '健康',
      tiltDeg: 2,
      remark: `样地中部 ${treeNo} 号桩`,
      round: 1,
      measuredAt: now - 370 * day,
    });
  });
  // 第 2 期：树号 1/2/3/5 复测（胸径增大），树号 4 被采伐 → 复查比对可标记缺失
  seeds.forEach(([treeNo, species, dbh, h, ubh, cw], index) => {
    if (treeNo === '4') return;
    const growth = [1.8, 1.4, 2.2, 0.9][index > 3 ? 3 : index];
    trees.push({
      id: newId('tree'),
      plotId,
      treeNo,
      species,
      dbhCm: Math.round((dbh + growth) * 10) / 10,
      heightM: Math.round((h + growth * 0.6) * 10) / 10,
      underBranchH: ubh,
      crownWidth: cw,
      status: '活立木',
      origin: '天然',
      healthClass: '健康',
      tiltDeg: 2,
      remark: `样地中部 ${treeNo} 号桩`,
      round: 2,
      measuredAt: now - 6 * day,
    });
  });
  // 第 2 期新增进界木
  trees.push({
    id: newId('tree'),
    plotId,
    treeNo: '6',
    species: '色木槭',
    dbhCm: 6.2,
    heightM: 6.1,
    underBranchH: 1.8,
    crownWidth: 1.9,
    status: '活立木',
    origin: '天然',
    healthClass: '健康',
    tiltDeg: 1,
    remark: '样地东南 3m 进界木',
    round: 2,
    measuredAt: now - 6 * day,
  });

  // 样地二（FP-4115）：第 1 期 4 株蒙古栎，第 2 期全部复测，其中 2 号树被错记为负增长
  const plot2Seed: [string, number, number][] = [
    ['1', 22.4, 13.2],
    ['2', 20.6, 12.1],
    ['3', 24.1, 14.0],
    ['4', 19.8, 11.8],
  ];
  plot2Seed.forEach(([treeNo, dbh, h]) => {
    trees.push({
      id: newId('tree'),
      plotId: plot2Id,
      treeNo,
      species: '蒙古栎',
      dbhCm: dbh,
      heightM: h,
      underBranchH: 4.2,
      crownWidth: 4.1,
      status: '活立木',
      origin: '天然',
      healthClass: '健康',
      tiltDeg: 4,
      remark: '样地西侧',
      round: 1,
      measuredAt: now - 360 * day,
    });
  });
  const plot2Grow: Record<string, [number, number]> = {
    '1': [1.1, 0.5],
    '2': [-1.4, -0.3], // 本期误录：胸径 19.2 < 上期 20.6，触发负增长，需补测
    '3': [1.3, 0.4],
    '4': [0.9, 0.3],
  };
  plot2Seed.forEach(([treeNo, dbh, h]) => {
    const [g, hg] = plot2Grow[treeNo];
    trees.push({
      id: newId('tree'),
      plotId: plot2Id,
      treeNo,
      species: '蒙古栎',
      dbhCm: Math.round((dbh + g) * 10) / 10,
      heightM: Math.round((h + hg) * 10) / 10,
      underBranchH: 4.2,
      crownWidth: 4.1,
      status: '活立木',
      origin: '天然',
      healthClass: '亚健康',
      tiltDeg: 6,
      remark: '样地西侧',
      round: 2,
      measuredAt: now - 3 * day,
    });
  });

  const regens: RegenShrub[] = [
    {
      id: newId('regen'),
      plotId,
      layer: '更新苗',
      species: '红松',
      heightCm: 32,
      count: 18,
      ageGroup: '3 年生',
      distribution: '团状',
      browseDamage: '轻度',
      round: 2,
    },
    {
      id: newId('regen'),
      plotId,
      layer: '更新苗',
      species: '紫椴',
      heightCm: 55,
      count: 9,
      ageGroup: '多年生',
      distribution: '均匀',
      browseDamage: '无',
      round: 2,
    },
    {
      id: newId('regen'),
      plotId,
      layer: '灌木',
      species: '毛榛子',
      heightCm: 120,
      count: 26,
      ageGroup: '多年生',
      distribution: '团状',
      browseDamage: '中度',
      round: 2,
    },
    {
      id: newId('regen'),
      plotId,
      layer: '草本',
      species: '苔草',
      heightCm: 22,
      count: 140,
      ageGroup: '多年生',
      distribution: '均匀',
      browseDamage: '无',
      round: 2,
    },
    // 样地二：重度啃食样方（交验会列出）
    {
      id: newId('regen'),
      plotId: plot2Id,
      layer: '灌木',
      species: '胡枝子',
      heightCm: 60,
      count: 34,
      ageGroup: '多年生',
      distribution: '团状',
      browseDamage: '重度',
      round: 2,
    },
    {
      id: newId('regen'),
      plotId: plot2Id,
      layer: '更新苗',
      species: '蒙古栎',
      heightCm: 28,
      count: 12,
      ageGroup: '2 年生',
      distribution: '均匀',
      browseDamage: '中度',
      round: 2,
    },
  ];

  // 样地一第 1→2 期复查比对（树 4 已采伐并写明原因，无遗留问题）
  const rechecks: RecheckDiff[] = [];
  const plot1Base: Record<string, [number, number]> = {
    '1': [34.2, 18.6],
    '2': [26.8, 15.2],
    '3': [41.5, 21.3],
    '4': [18.4, 11.5],
    '5': [12.6, 9.4],
  };
  const plot1Target: Record<string, [number, number]> = {
    '1': [36, 19.7],
    '2': [28.2, 16],
    '3': [43.7, 22.6],
    '5': [13.5, 9.9],
    '6': [6.2, 6.1],
  };
  const plot1Species: Record<string, string> = {
    '1': '红松',
    '2': '紫椴',
    '3': '红松',
    '4': '蒙古栎',
    '5': '色木槭',
    '6': '色木槭',
  };
  ['1', '2', '3', '4', '5', '6'].forEach((treeNo) => {
    const b = plot1Base[treeNo];
    const t = plot1Target[treeNo];
    rechecks.push({
      id: diffId(plotId, 1, 2, treeNo),
      plotId,
      baseRound: 1,
      targetRound: 2,
      treeNo,
      species: plot1Species[treeNo],
      baseDbhCm: b?.[0],
      targetDbhCm: t?.[0],
      baseHeightM: b?.[1],
      targetHeightM: t?.[1],
      dbhGrowth: b && t ? Math.round((t[0] - b[0]) * 100) / 100 : 0,
      heightGrowth: b && t ? Math.round((t[1] - b[1]) * 100) / 100 : 0,
      statusChange: '',
      missingReason:
        treeNo === '4'
          ? '已核实：该树于两期之间采伐，留有伐根，位置与原桩一致'
          : treeNo === '6'
            ? '本期新增进界木'
            : '',
      generatedAt: now - 5 * day,
    });
  });
  // 样地二第 1→2 期复查比对：2 号树负增长（交验问题）
  plot2Seed.forEach(([treeNo, dbh, h]) => {
    const [g, hg] = plot2Grow[treeNo];
    rechecks.push({
      id: diffId(plot2Id, 1, 2, treeNo),
      plotId: plot2Id,
      baseRound: 1,
      targetRound: 2,
      treeNo,
      species: '蒙古栎',
      baseDbhCm: dbh,
      targetDbhCm: Math.round((dbh + g) * 10) / 10,
      baseHeightM: h,
      targetHeightM: Math.round((h + hg) * 10) / 10,
      dbhGrowth: g,
      heightGrowth: hg,
      statusChange: '',
      missingReason: '',
      generatedAt: now - 2 * day,
    });
  });

  // 交验状态：样地一第 2 期已交验；样地二第 2 期曾交验后撤销，处于「需补测」
  const submissions: RoundSubmission[] = [
    {
      id: submissionId(plotId, 2),
      plotId,
      round: 2,
      status: 'submitted',
      issueResolutions: [],
      events: [
        { at: now - 5 * day, type: 'pass', reason: '' },
        { at: now - 7 * day, type: 'withdraw', reason: '初次内业复核时需补测更新层株数' },
        { at: now - 8 * day, type: 'pass', reason: '' },
      ],
      createdAt: now - 8 * day,
      updatedAt: now - 5 * day,
    },
    {
      id: submissionId(plot2Id, 2),
      plotId: plot2Id,
      round: 2,
      status: 'resurvey',
      issueResolutions: [],
      events: [
        { at: now - 2 * day, type: 'pass', reason: '' },
        {
          at: now - 1 * day,
          type: 'withdraw',
          reason: '2 号样木胸径疑似检尺位置不一致，且胡枝子重度啃食未写处理说明，需外业补测',
        },
      ],
      createdAt: now - 2 * day,
      updatedAt: now - 1 * day,
    },
  ];

  await db.transaction('rw', db.plots, db.trees, db.regens, db.rechecks, db.submissions, async () => {
    await db.plots.bulkPut(plots);
    await db.trees.bulkPut(trees);
    await db.regens.bulkPut(regens);
    await db.rechecks.bulkPut(rechecks);
    await db.submissions.bulkPut(submissions);
  });
}
