import Dexie, { type Table } from 'dexie';
import type { Plot } from '../types/plot';
import type { TreeRecord } from '../types/tree';
import type { RegenShrub } from '../types/regen';
import type { RecheckDiff } from '../types/recheck';
import type { Inspection } from '../types/inspection';
import { newId } from './id';

export const DB_NAME = 'gbforestplot';
export const DB_VERSION = 3;
export const LS_VERSION_KEY = 'gbforestplot:db-version';

/** 交验记录主键（每期一条） */
export function inspectionId(plotId: string, round: number): string {
  return `insp_${plotId}_r${round}`;
}

class ForestPlotDB extends Dexie {
  plots!: Table<Plot, string>;
  trees!: Table<TreeRecord, string>;
  regens!: Table<RegenShrub, string>;
  rechecks!: Table<RecheckDiff, string>;
  inspections!: Table<Inspection, string>;

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
    this.version(3)
      .stores({
        plots: 'id, plotNo, locality, forestType, surveyRound, locked, createdAt',
        trees: 'id, plotId, treeNo, species, round, status, measuredAt',
        regens: 'id, plotId, layer, species, round, heightCm',
        rechecks: 'id, plotId, baseRound, targetRound, treeNo, generatedAt',
        inspections: 'id, plotId, round, status',
      })
      .upgrade(async (tx) => {
        // 老样地沿用往期锁定：已锁定的样地补一条「已交验」记录，其余默认待交验
        const plots = await tx.table('plots').toCollection().toArray();
        const records: Inspection[] = (plots as Plot[]).map((plot) => ({
          id: inspectionId(plot.id, plot.surveyRound),
          plotId: plot.id,
          round: plot.surveyRound,
          status: plot.locked ? '已交验' : '待交验',
          notes: {},
          revokeReason: '',
          submittedAt: plot.locked ? Date.now() : undefined,
        }));
        await tx.table('inspections').bulkPut(records);
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
  // 示范样地 2 两期样木：第 2 期含负增长、缺测未写原因、进界木胸径异常等交验问题
  const plot2Round1: Array<[string, string, number, number]> = [
    ['1', '蒙古栎', 22.4, 13.2],
    ['2', '蒙古栎', 20.1, 11.8],
    ['3', '黑桦', 16.8, 10.2],
    ['4', '色木槭', 10.5, 8.0],
  ];
  plot2Round1.forEach(([treeNo, species, dbh, h]) => {
    trees.push({
      id: newId('tree'),
      plotId: plot2Id,
      treeNo,
      species,
      dbhCm: dbh,
      heightM: h,
      underBranchH: Math.round(h * 0.32 * 10) / 10,
      crownWidth: Math.round(dbh * 0.18 * 10) / 10,
      status: '活立木',
      origin: '天然',
      healthClass: '健康',
      tiltDeg: 3,
      remark: '样地西侧',
      round: 1,
      measuredAt: now - 110 * day,
    });
  });
  // 第 2 期：树号 1 胸径负增长、树号 2 树高负增长、树号 4 缺测（未写原因）、树号 5 进界但胸径异常
  const plot2Round2: Array<[string, string, number, number]> = [
    ['1', '蒙古栎', 21.6, 13.6],
    ['2', '蒙古栎', 20.9, 11.2],
    ['3', '黑桦', 17.6, 10.8],
    ['5', '蒙古栎', 50.0, 16.5],
  ];
  plot2Round2.forEach(([treeNo, species, dbh, h]) => {
    trees.push({
      id: newId('tree'),
      plotId: plot2Id,
      treeNo,
      species,
      dbhCm: dbh,
      heightM: h,
      underBranchH: Math.round(h * 0.32 * 10) / 10,
      crownWidth: Math.round(dbh * 0.18 * 10) / 10,
      status: '活立木',
      origin: '天然',
      healthClass: '健康',
      tiltDeg: 3,
      remark: treeNo === '5' ? '样地北缘补测进界木' : '样地西侧',
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
    {
      id: newId('regen'),
      plotId: plot2Id,
      layer: '更新苗',
      species: '水曲柳',
      heightCm: 26,
      count: 12,
      ageGroup: '2 年生',
      distribution: '团状',
      browseDamage: '重度',
      round: 2,
    },
    {
      id: newId('regen'),
      plotId: plot2Id,
      layer: '灌木',
      species: '胡枝子',
      heightCm: 80,
      count: 30,
      ageGroup: '多年生',
      distribution: '均匀',
      browseDamage: '轻度',
      round: 2,
    },
  ];

  const inspections: Inspection[] = [
    {
      id: inspectionId(plotId, 2),
      plotId,
      round: 2,
      status: '已交验',
      notes: {},
      revokeReason: '',
      submittedAt: now - 5 * day,
    },
    {
      id: inspectionId(plot2Id, 2),
      plotId: plot2Id,
      round: 2,
      status: '待交验',
      notes: {},
      revokeReason: '',
    },
  ];

  await db.transaction('rw', db.plots, db.trees, db.regens, db.rechecks, db.inspections, async () => {
    await db.plots.bulkPut(plots);
    await db.trees.bulkPut(trees);
    await db.regens.bulkPut(regens);
    await db.inspections.bulkPut(inspections);
  });
}
