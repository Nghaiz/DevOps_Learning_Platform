/**
 * Đọc/ghi tiến độ ở `localStorage`.
 *
 * Khuôn tiêm phụ thuộc lấy từ `apps/web/src/components/session/workspace-tabs.ts`
 * (`browserStorage()` trả `globalThis.localStorage ?? null`): `storage` được TIÊM
 * VÀO chứ không đọc thẳng, vì (a) package này test ở env `node` nơi không có
 * `localStorage`, và (b) `localStorage` NÉM chứ không trả `null` ở một số chế độ
 * riêng tư — đọc thẳng là một lần sập trang đổi lấy một tiện ích "nhớ tiến độ".
 *
 * Bốn trường hợp `core/types.ts` bắt phải chịu được mà KHÔNG ném:
 *
 * | Trường hợp | `status` | Trả về | Có được GHI ĐÈ không |
 * |---|---|---|---|
 * | khoá vắng | `empty` | bản lưu rỗng | có |
 * | JSON hỏng / hình dạng lạ | `corrupt` | bản lưu rỗng | có |
 * | `version` cũ hơn | `migrated` | bản đã nâng cấp | có |
 * | `version` MỚI hơn | `future` | bản lưu rỗng | ⛔ KHÔNG |
 * | `localStorage` ném | `unavailable` | bản lưu rỗng | không (ghi cũng nuốt lỗi) |
 *
 * ⚠ `future` là trường hợp duy nhất mà ghi đè là hành vi SAI, và nó khác hẳn ba
 * trường hợp kia dù cùng trả về bản rỗng. Người chơi mở game bằng một bản dựng cũ
 * (tab cũ chưa reload, hoặc lùi version) mà ta ghi đè thì tiến độ của bản mới bị
 * xoá sạch — mất dữ liệu thật, không phải bất tiện. `writeSave` vì thế đọc lại
 * đĩa trước khi ghi và từ chối nếu đĩa đang giữ một version cao hơn.
 */

import type { GameId, GameSave, GameSettings, RunResult } from './types.ts';
import { storageKey } from './types.ts';

/** Bề mặt tối thiểu của `localStorage` mà package này dùng. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SaveStatus = 'ok' | 'empty' | 'corrupt' | 'migrated' | 'future' | 'unavailable';

export interface SaveLoad {
  readonly save: GameSave;
  readonly status: SaveStatus;
  /** Tiếng Việt, để giao diện hiện nhãn. `null` khi không có gì bất thường. */
  readonly warning: string | null;
}

export const CURRENT_SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: GameSettings = {
  disable3d: false,
  showHints: true,
};

export function emptySave(): GameSave {
  return { version: CURRENT_SAVE_VERSION, runs: [], achievements: [], settings: DEFAULT_SETTINGS };
}

/** `localStorage` nếu đọc được, `null` nếu không (SSR, chế độ riêng tư). */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// ── Phân tích ───────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function isGameId(value: unknown): value is GameId {
  return value === 'k8s' || value === 'pipeline' || value === 'netpol' || value === 'dockerfile';
}

/**
 * Một `RunResult` hỏng field nào thì BỎ chính bản ghi đó, không vá bằng giá trị
 * mặc định. Vá sẽ đẻ ra một lượt chơi 0 điểm chưa từng xảy ra, và trang stats sẽ
 * đếm nó — sai lặng lẽ, tệ hơn hẳn là thiếu một dòng.
 */
function parseRun(value: unknown): RunResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const gameId = value['gameId'];
  const levelId = value['levelId'];
  if (!isGameId(gameId) || typeof levelId !== 'string') {
    return null;
  }
  const numeric: Record<string, number> = {};
  for (const key of ['seed', 'startedAt', 'finishedAt', 'objectivesTotal', 'commandsUsed', 'hintsUsed', 'score']) {
    const raw = value[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return null;
    }
    numeric[key] = raw;
  }
  return {
    gameId,
    levelId,
    seed: numeric['seed'] ?? 0,
    startedAt: numeric['startedAt'] ?? 0,
    finishedAt: numeric['finishedAt'] ?? 0,
    objectivesMet: readStringArray(value['objectivesMet']),
    objectivesTotal: numeric['objectivesTotal'] ?? 0,
    commandsUsed: numeric['commandsUsed'] ?? 0,
    hintsUsed: numeric['hintsUsed'] ?? 0,
    score: numeric['score'] ?? 0,
  };
}

function parseSettings(value: unknown): GameSettings {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }
  return {
    disable3d: value['disable3d'] === true,
    // Mặc định BẬT: thiếu field thì người chơi vẫn thấy gợi ý. Mặc định tắt sẽ
    // giấu mất một tính năng trợ giúp mà người chơi không biết là có.
    showHints: value['showHints'] !== false,
  };
}

/**
 * Phân tích chuỗi thô. `null` = không dùng được (rỗng/hỏng). `version` trả kèm để
 * `loadSave` quyết định migrate hay từ chối.
 */
export function parseSave(raw: string | null): { save: GameSave; version: number } | null {
  if (raw === null || raw === '') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const rawVersion = parsed['version'];
  const version = typeof rawVersion === 'number' && Number.isFinite(rawVersion) ? rawVersion : 0;
  const rawRuns = Array.isArray(parsed['runs']) ? parsed['runs'] : [];
  const runs = rawRuns.map(parseRun).filter((run): run is RunResult => run !== null);
  return {
    save: {
      version: CURRENT_SAVE_VERSION,
      runs,
      achievements: readStringArray(parsed['achievements']),
      settings: parseSettings(parsed['settings']),
    },
    version,
  };
}

// ── Đọc ─────────────────────────────────────────────────────────────────────

/**
 * Nâng cấp một bản lưu version cũ. Hiện chỉ có version 1 nên chưa có bước nào —
 * nhưng chỗ móc đã sẵn và `status: 'migrated'` đã đi qua giao diện được, để lần
 * đổi schema đầu tiên không phải sửa cả đường ống.
 */
function migrate(save: GameSave, _fromVersion: number): GameSave {
  return save;
}

export function loadSave(gameId: GameId, storage: StorageLike | null): SaveLoad {
  if (storage === null) {
    return {
      save: emptySave(),
      status: 'unavailable',
      warning:
        'Trình duyệt không cho lưu dữ liệu (có thể đang ở chế độ riêng tư). Tiến độ sẽ không được ghi nhớ.',
    };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(gameId));
  } catch {
    return {
      save: emptySave(),
      status: 'unavailable',
      warning: 'Không đọc được dữ liệu đã lưu. Tiến độ sẽ không được ghi nhớ.',
    };
  }
  if (raw === null || raw === '') {
    return { save: emptySave(), status: 'empty', warning: null };
  }
  const parsed = parseSave(raw);
  if (parsed === null) {
    return {
      save: emptySave(),
      status: 'corrupt',
      warning: 'Dữ liệu đã lưu bị hỏng nên không đọc được. Bắt đầu lại từ đầu.',
    };
  }
  if (parsed.version > CURRENT_SAVE_VERSION) {
    return {
      save: emptySave(),
      status: 'future',
      warning:
        'Dữ liệu đã lưu tới từ một phiên bản game mới hơn. Bản này không đọc được, và sẽ KHÔNG ghi đè lên nó.',
    };
  }
  if (parsed.version < CURRENT_SAVE_VERSION) {
    return { save: migrate(parsed.save, parsed.version), status: 'migrated', warning: null };
  }
  return { save: parsed.save, status: 'ok', warning: null };
}

/**
 * Bản tiện dụng cho chỗ chỉ cần dữ liệu. Cảnh báo đi ra `console.warn` — đúng yêu
 * cầu "ghi một cảnh báo, không ném" của `phase-14-exec.md` §3.3.
 *
 * ⚠ KHÔNG cảnh báo ở trường hợp `empty`: đó là lần chơi ĐẦU TIÊN của mọi người
 * chơi, và một cảnh báo ở đó là báo động giả — đúng loại nhiễu làm người ta thôi
 * đọc console. Giao diện muốn phân biệt thì đọc `loadSave().status`, nó mang
 * nhiều thông tin hơn một dòng log.
 */
export function readSave(gameId: GameId, storage: StorageLike | null): GameSave {
  const loaded = loadSave(gameId, storage);
  if (loaded.warning !== null) {
    console.warn(`[games] ${gameId}: ${loaded.warning}`);
  }
  return loaded.save;
}

// ── Ghi ─────────────────────────────────────────────────────────────────────

/**
 * `false` = không ghi được. Bên gọi tự quyết định có báo người dùng không; hàm
 * này không ném, vì mất một lần lưu không được phép làm hỏng ván đang chơi.
 */
export function writeSave(gameId: GameId, save: GameSave, storage: StorageLike | null): boolean {
  if (storage === null) {
    return false;
  }
  // Đọc lại đĩa TRƯỚC khi ghi: đĩa đang giữ version cao hơn thì ghi đè là xoá
  // dữ liệu của một bản dựng mới hơn — xem bảng ở đầu file.
  if (loadSave(gameId, storage).status === 'future') {
    return false;
  }
  try {
    storage.setItem(storageKey(gameId), JSON.stringify(save));
    return true;
  } catch {
    // Quota đầy hoặc storage bị chặn. Ván hiện tại vẫn chơi được.
    return false;
  }
}

// ── Biến đổi thuần ──────────────────────────────────────────────────────────

export function appendRun(save: GameSave, run: RunResult): GameSave {
  return { ...save, runs: [...save.runs, run] };
}

/** Hợp nhất, giữ thứ tự mở khoá và không trùng. */
export function unlockAchievements(save: GameSave, ids: readonly string[]): GameSave {
  const known = new Set(save.achievements);
  const added = ids.filter((id) => !known.has(id));
  if (added.length === 0) {
    return save;
  }
  return { ...save, achievements: [...save.achievements, ...added] };
}

export function updateSettings(save: GameSave, patch: Partial<GameSettings>): GameSave {
  return { ...save, settings: { ...save.settings, ...patch } };
}
