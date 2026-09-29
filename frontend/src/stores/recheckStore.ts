import { create } from 'zustand';
import { db } from '../utils/db';
import type { RecheckDiff } from '../types/recheck';

interface RecheckState {
  items: RecheckDiff[];
  loaded: boolean;
  load: () => Promise<void>;
  byPlot: (plotId: string) => RecheckDiff[];
  /** 保存某次比对结果：替换该样地同一上下期组合的旧行 */
  saveRound: (plotId: string, baseRound: number, targetRound: number, diffs: RecheckDiff[]) => Promise<void>;
  /** 更新单行（如补写缺测原因） */
  updateOne: (id: string, patch: Partial<RecheckDiff>) => Promise<void>;
}

export const useRecheckStore = create<RecheckState>((set, get) => ({
  items: [],
  loaded: false,
  async load() {
    const rows = await db.rechecks.toArray();
    rows.sort(
      (a, b) =>
        a.targetRound - b.targetRound ||
        a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }),
    );
    set({ items: rows, loaded: true });
  },
  byPlot(plotId) {
    return get()
      .items.filter((it) => it.plotId === plotId)
      .sort((a, b) => a.treeNo.localeCompare(b.treeNo, 'zh-Hans-CN', { numeric: true }));
  },
  async saveRound(plotId, baseRound, targetRound, diffs) {
    const stale = get()
      .items.filter((d) => d.plotId === plotId && d.baseRound === baseRound && d.targetRound === targetRound)
      .map((d) => d.id);
    await db.transaction('rw', db.rechecks, async () => {
      if (stale.length > 0) await db.rechecks.bulkDelete(stale);
      await db.rechecks.bulkPut(diffs);
    });
    set({ items: [...get().items.filter((d) => !stale.includes(d.id)), ...diffs] });
  },
  async updateOne(id, patch) {
    await db.rechecks.update(id, patch);
    set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  },
}));
