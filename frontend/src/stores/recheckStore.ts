import { create } from 'zustand';
import { db } from '../utils/db';
import type { RecheckDiff } from '../types/recheck';

interface RecheckState {
  items: RecheckDiff[];
  loaded: boolean;
  load: () => Promise<void>;
  /** 批量写入（按稳定主键 upsert），返回该样地最新比对结果 */
  saveMany: (diffs: RecheckDiff[]) => Promise<void>;
  /** 更新单条（如补写缺失原因） */
  update: (id: string, patch: Partial<RecheckDiff>) => Promise<void>;
  byPlot: (plotId: string) => RecheckDiff[];
}

export const useRecheckStore = create<RecheckState>((set, get) => ({
  items: [],
  loaded: false,
  async load() {
    const rows = await db.rechecks.toArray();
    rows.sort((a, b) => a.plotId.localeCompare(b.plotId) || a.targetRound - b.targetRound || a.treeNo.localeCompare(b.treeNo));
    set({ items: rows, loaded: true });
  },
  async saveMany(diffs) {
    await db.rechecks.bulkPut(diffs);
    const byId = new Map(diffs.map((d) => [d.id, d]));
    set({
      items: [...get().items.filter((d) => !byId.has(d.id)), ...diffs],
    });
  },
  async update(id, patch) {
    await db.rechecks.update(id, patch);
    set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  },
  byPlot(plotId) {
    return get().items
      .filter((d) => d.plotId === plotId)
      .sort((a, b) => a.targetRound - b.targetRound || a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }));
  },
}));
