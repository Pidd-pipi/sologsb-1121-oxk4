import { create } from 'zustand';
import { db, inspectionId } from '../utils/db';
import type { Inspection, InspectionStatus } from '../types/inspection';

interface InspectionState {
  items: Inspection[];
  loaded: boolean;
  load: () => Promise<void>;
  byPlotRound: (plotId: string, round: number) => Inspection | undefined;
  /** 取该期交验记录，没有则返回一条内存中的默认「待交验」记录（不落库） */
  ensure: (plotId: string, round: number) => Inspection;
  save: (record: Inspection) => Promise<void>;
  /** 通过交验：保存处理说明并锁定本期（仅保留本次交验单中的问题说明） */
  submit: (plotId: string, round: number, notes: Record<string, string>) => Promise<void>;
  /** 撤销交验转补测：必须填写原因，本期解锁 */
  revoke: (plotId: string, round: number, reason: string) => Promise<void>;
}

function emptyRecord(plotId: string, round: number, status: InspectionStatus = '待交验'): Inspection {
  return { id: inspectionId(plotId, round), plotId, round, status, notes: {}, revokeReason: '' };
}

export const useInspectionStore = create<InspectionState>((set, get) => ({
  items: [],
  loaded: false,
  async load() {
    const rows = await db.inspections.toArray();
    set({ items: rows, loaded: true });
  },
  byPlotRound(plotId, round) {
    return get().items.find((it) => it.plotId === plotId && it.round === round);
  },
  ensure(plotId, round) {
    return get().byPlotRound(plotId, round) ?? emptyRecord(plotId, round);
  },
  async save(record) {
    await db.inspections.put(record);
    set({
      items: [...get().items.filter((it) => it.id !== record.id), record],
    });
  },
  async submit(plotId, round, notes) {
    const prev = get().ensure(plotId, round);
    const cleanNotes: Record<string, string> = {};
    Object.entries(notes).forEach(([key, value]) => {
      if (value.trim()) cleanNotes[key] = value;
    });
    const record: Inspection = {
      ...prev,
      notes: cleanNotes,
      status: '已交验',
      submittedAt: Date.now(),
      revokedAt: undefined,
    };
    await get().save(record);
  },
  async revoke(plotId, round, reason) {
    const prev = get().ensure(plotId, round);
    const record: Inspection = {
      ...prev,
      status: '需补测',
      revokeReason: reason,
      revokedAt: Date.now(),
    };
    await get().save(record);
  },
}));
