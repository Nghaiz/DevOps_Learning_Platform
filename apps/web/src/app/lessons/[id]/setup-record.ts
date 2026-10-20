import type { StorageLike } from '../../../components/session/workspace-tabs';

/**
 * Phase nào ĐÃ chạy setup trên máy nào, nhớ qua `localStorage`.
 *
 * ## Vì sao cần
 *
 * `lessons.runSetup` không tự chống chạy lại: script `background` của nội dung ghi đè file
 * (`dlp-ide-config-edit` ghi lại `port=0`), và máy chủ chỉ hứa "FE gọi một lần cho mỗi phase".
 * Từ khi trang nhận lại máy đang chạy sau khi tải lại (`use-resume-machine.ts`), cờ "đã chạy"
 * giữ trong một `useRef` mất theo lần mount cũ, nên tải lại giữa chừng là chạy lại setup và xoá
 * mất phần người học vừa sửa (review PR #183).
 *
 * Nhớ theo `sessionId` chứ không theo bài: máy mới là đĩa mới, phải setup lại từ đầu.
 */

const STORAGE_KEY = 'dlp-lesson-setup';
/** Máy sống tối đa vài giờ; bản ghi cũ hơn một ngày chắc chắn thuộc máy đã mất. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SetupEntry {
  readonly phases: readonly string[];
  readonly at: number;
}

type SetupRecords = Readonly<Record<string, SetupEntry>>;

function readAll(storage: StorageLike | null): SetupRecords {
  if (storage === null) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, SetupEntry> = {};
    for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue;
      const { phases, at } = value as { phases?: unknown; at?: unknown };
      if (!Array.isArray(phases) || typeof at !== 'number') continue;
      out[sessionId] = { phases: phases.filter((p): p is string => typeof p === 'string'), at };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(records: SetupRecords, storage: StorageLike | null): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage bị chặn/đầy: lượt này vẫn đúng nhờ cờ trong bộ nhớ, chỉ là tải lại sẽ không nhớ.
  }
}

/** Phase đã chạy setup trên máy này, hoặc `null` khi trình duyệt này chưa từng ghi gì cho nó. */
export function readSetupRecord(sessionId: string, storage: StorageLike | null): ReadonlySet<string> | null {
  const entry = readAll(storage)[sessionId];
  return entry === undefined ? null : new Set(entry.phases);
}

export function recordSetupRan(sessionId: string, phaseKey: string, storage: StorageLike | null, now: number = Date.now()): void {
  const records = readAll(storage);
  const kept: Record<string, SetupEntry> = {};
  for (const [id, entry] of Object.entries(records)) {
    if (now - entry.at <= MAX_AGE_MS) kept[id] = entry;
  }
  const phases = new Set(kept[sessionId]?.phases ?? []);
  phases.add(phaseKey);
  kept[sessionId] = { phases: [...phases], at: now };
  writeAll(kept, storage);
}

export function forgetSetupRecord(sessionId: string, storage: StorageLike | null): void {
  const records = readAll(storage);
  if (records[sessionId] === undefined) return;
  writeAll(Object.fromEntries(Object.entries(records).filter(([id]) => id !== sessionId)), storage);
}

/**
 * Phase coi như ĐÃ setup khi nhận lại một máy mà trình duyệt này không có bản ghi (máy mở ở
 * máy tính khác, hoặc storage đã bị xoá): phase đầu và mọi bước tới chỗ đang dở. Chạy lại setup
 * có thể xoá bài làm, còn bỏ sót chỉ xảy ra khi máy được mở thẳng ở một bước sau rồi người học
 * quay lại bước trước; cái giá thứ hai nhỏ hơn.
 */
export function assumedSetupPhases(
  phases: readonly { readonly key: string; readonly stepIndex: number | null }[],
  progressStepIndex: number,
): ReadonlySet<string> {
  const keys = new Set<string>();
  const first = phases[0];
  if (first !== undefined) keys.add(first.key);
  for (const phase of phases) {
    if (phase.stepIndex !== null && phase.stepIndex <= progressStepIndex) keys.add(phase.key);
  }
  return keys;
}
