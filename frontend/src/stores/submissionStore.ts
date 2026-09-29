import { create } from 'zustand';
import { db } from '../utils/db';
import {
  submissionId,
  type IssueResolution,
  type RoundSubmission,
  type SubmissionEvent,
  type SubmissionStatus,
} from '../types/submission';

interface SubmissionState {
  items: RoundSubmission[];
  loaded: boolean;
  load: () => Promise<void>;
  byRound: (plotId: string, round: number) => RoundSubmission | undefined;
  /** 暂存处理说明（提交交验前的草稿，状态保持待交验/需补测） */
  saveDraft: (
    plotId: string,
    round: number,
    issueResolutions: IssueResolution[],
    status?: SubmissionStatus,
  ) => Promise<RoundSubmission>;
  /** 问题清零，交验通过并锁定本期 */
  pass: (plotId: string, round: number, issueResolutions: IssueResolution[]) => Promise<void>;
  /** 撤销交验，转为需补测，必须填写补测原因 */
  withdraw: (plotId: string, round: number, reason: string) => Promise<void>;
  removeByPlot: (plotId: string) => Promise<void>;
}

function cleanNote(note: string): string {
  return note.trim();
}

export const useSubmissionStore = create<SubmissionState>((set, get) => ({
  items: [],
  loaded: false,
  async load() {
    const rows = await db.submissions.toArray();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ items: rows, loaded: true });
  },
  byRound(plotId, round) {
    return get().items.find((s) => s.plotId === plotId && s.round === round);
  },
  async saveDraft(plotId, round, issueResolutions, status) {
    const id = submissionId(plotId, round);
    const now = Date.now();
    const existing = get().items.find((s) => s.id === id);
    // 调用方始终传入当前检出的全部问题说明（含空串）：
    // 只保留仍存在且已填写的说明，已消失问题的说明自动清除。
    const cleaned = issueResolutions
      .map((r) => ({ key: r.key, handlingNote: cleanNote(r.handlingNote) }))
      .filter((r) => r.handlingNote !== '');
    // 草稿不允许把已交验记录改回未交验状态（撤销须走 withdraw 写原因）
    const safeStatus: SubmissionStatus =
      existing?.status === 'submitted' && !status
        ? 'submitted'
        : status ?? existing?.status ?? 'pending';
    const next: RoundSubmission = {
      id,
      plotId,
      round,
      status: safeStatus,
      issueResolutions: cleaned,
      events: existing?.events ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.submissions.put(next);
    set({
      items: [next, ...get().items.filter((s) => s.id !== id)],
    });
    return next;
  },
  async pass(plotId, round, issueResolutions) {
    const id = submissionId(plotId, round);
    const now = Date.now();
    const existing = get().items.find((s) => s.id === id);
    const event: SubmissionEvent = { at: now, type: 'pass', reason: '' };
    const next: RoundSubmission = {
      id,
      plotId,
      round,
      status: 'submitted',
      issueResolutions: issueResolutions
        .filter((r) => cleanNote(r.handlingNote) !== '')
        .map((r) => ({ key: r.key, handlingNote: cleanNote(r.handlingNote) })),
      events: [...(existing?.events ?? []), event],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.submissions.put(next);
    set({ items: [next, ...get().items.filter((s) => s.id !== id)] });
  },
  async withdraw(plotId, round, reason) {
    const id = submissionId(plotId, round);
    const now = Date.now();
    const existing = get().items.find((s) => s.id === id);
    if (!existing || existing.status !== 'submitted') return;
    const trimmed = cleanNote(reason);
    if (trimmed.length < 5) {
      // 撤销交验必须写明补测原因（至少 5 个字），拒绝留空
      throw new Error('撤销交验必须填写补测原因（至少 5 个字）');
    }
    const event: SubmissionEvent = { at: now, type: 'withdraw', reason: trimmed };
    const next: RoundSubmission = {
      ...existing,
      status: 'resurvey',
      events: [...existing.events, event],
      updatedAt: now,
    };
    await db.submissions.put(next);
    set({ items: [next, ...get().items.filter((s) => s.id !== id)] });
  },
  async removeByPlot(plotId) {
    const rows = get().items.filter((s) => s.plotId === plotId);
    await db.submissions.bulkDelete(rows.map((r) => r.id));
    set({ items: get().items.filter((s) => s.plotId !== plotId) });
  },
}));
