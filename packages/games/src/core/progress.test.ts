import { describe, expect, it, vi } from 'vitest';
import type { GameSave, RunResult } from './types.ts';
import { storageKey } from './types.ts';
import {
  CURRENT_SAVE_VERSION,
  appendRun,
  emptySave,
  loadSave,
  readSave,
  unlockAchievements,
  updateSettings,
  writeSave,
} from './progress.ts';
import type { StorageLike } from './progress.ts';

const KEY = storageKey('k8s');

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** Storage NÉM ở cả hai chiều — đúng hành vi Safari chế độ riêng tư. */
function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
}

function makeRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    gameId: 'k8s',
    levelId: 'k8s-01-pod-dau-tien',
    seed: 1,
    startedAt: 1_000,
    finishedAt: 61_000,
    objectivesMet: ['o1'],
    objectivesTotal: 1,
    commandsUsed: 3,
    hintsUsed: 0,
    score: 900,
    ...overrides,
  };
}

describe('progress — bốn kiểu hỏng, không kiểu nào được ném', () => {
  it('khoá vắng ⇒ bản rỗng, status empty, KHÔNG cảnh báo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loaded = loadSave('k8s', memoryStorage());
    expect(loaded.status).toBe('empty');
    expect(loaded.save).toEqual(emptySave());
    readSave('k8s', memoryStorage());
    // Lần chơi đầu tiên của MỌI người chơi rơi vào nhánh này — cảnh báo ở đây là
    // báo động giả, và báo động giả là cách console mất tác dụng.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('JSON hỏng ⇒ bản rỗng + cảnh báo, không ném', () => {
    const storage = memoryStorage({ [KEY]: '{ khong phai json' });
    expect(() => loadSave('k8s', storage)).not.toThrow();
    const loaded = loadSave('k8s', storage);
    expect(loaded.status).toBe('corrupt');
    expect(loaded.warning).not.toBeNull();
    expect(loaded.save.runs).toEqual([]);
  });

  it('JSON hợp lệ nhưng không phải object ⇒ corrupt', () => {
    expect(loadSave('k8s', memoryStorage({ [KEY]: '[1,2,3]' })).status).toBe('corrupt');
    expect(loadSave('k8s', memoryStorage({ [KEY]: '"chuoi"' })).status).toBe('corrupt');
  });

  it('localStorage ném ⇒ status unavailable, không ném ra ngoài', () => {
    expect(() => loadSave('k8s', throwingStorage())).not.toThrow();
    expect(loadSave('k8s', throwingStorage()).status).toBe('unavailable');
    expect(writeSave('k8s', emptySave(), throwingStorage())).toBe(false);
  });

  it('storage null (SSR) ⇒ unavailable, ghi trả false', () => {
    expect(loadSave('k8s', null).status).toBe('unavailable');
    expect(writeSave('k8s', emptySave(), null)).toBe(false);
  });

  it('version MỚI hơn ⇒ bản rỗng và KHÔNG ghi đè lên đĩa', () => {
    const future = JSON.stringify({ version: 99, runs: [makeRun()], achievements: ['x'], settings: {} });
    const storage = memoryStorage({ [KEY]: future });
    const loaded = loadSave('k8s', storage);
    expect(loaded.status).toBe('future');
    expect(loaded.save.runs).toEqual([]);
    // Đây là ô quan trọng nhất của cả file: ghi đè ở đây là XOÁ dữ liệu thật của
    // một bản dựng mới hơn, không phải một bất tiện.
    expect(writeSave('k8s', emptySave(), storage)).toBe(false);
    expect(storage.data[KEY]).toBe(future);
  });

  it('version cũ hơn ⇒ migrate chứ không vứt', () => {
    const old = JSON.stringify({ version: 0, runs: [makeRun()], achievements: ['a'], settings: {} });
    const loaded = loadSave('k8s', memoryStorage({ [KEY]: old }));
    expect(loaded.status).toBe('migrated');
    expect(loaded.save.runs).toHaveLength(1);
    expect(loaded.save.version).toBe(CURRENT_SAVE_VERSION);
  });
});

describe('progress — phân tích từng bản ghi', () => {
  it('bản ghi lượt chơi hỏng field thì BỎ chính nó, giữ các bản còn lại', () => {
    const raw = JSON.stringify({
      version: 1,
      runs: [makeRun(), { gameId: 'k8s', levelId: 'x' }, makeRun({ levelId: 'l2' })],
      achievements: ['a', 5, 'b'],
      settings: { disable3d: true },
    });
    const loaded = loadSave('k8s', memoryStorage({ [KEY]: raw }));
    expect(loaded.status).toBe('ok');
    expect(loaded.save.runs.map((r) => r.levelId)).toEqual(['k8s-01-pod-dau-tien', 'l2']);
    // Phần tử không phải chuỗi bị loại, không bị ép kiểu.
    expect(loaded.save.achievements).toEqual(['a', 'b']);
    expect(loaded.save.settings.disable3d).toBe(true);
    // Thiếu field ⇒ mặc định BẬT, không phải tắt im lặng.
    expect(loaded.save.settings.showHints).toBe(true);
  });

  it('gameId lạ bị loại', () => {
    const raw = JSON.stringify({ version: 1, runs: [{ ...makeRun(), gameId: 'minecraft' }] });
    expect(loadSave('k8s', memoryStorage({ [KEY]: raw })).save.runs).toEqual([]);
  });

  it('score là chuỗi bị loại chứ không ép về số', () => {
    const raw = JSON.stringify({ version: 1, runs: [{ ...makeRun(), score: '1000' }] });
    expect(loadSave('k8s', memoryStorage({ [KEY]: raw })).save.runs).toEqual([]);
  });
});

describe('progress — ghi và biến đổi', () => {
  it('ghi rồi đọc lại ra đúng thứ đã ghi', () => {
    const storage = memoryStorage();
    const save: GameSave = appendRun(emptySave(), makeRun());
    expect(writeSave('k8s', save, storage)).toBe(true);
    expect(loadSave('k8s', storage).save).toEqual(save);
  });

  it('unlockAchievements không trùng và giữ thứ tự', () => {
    const one = unlockAchievements(emptySave(), ['a', 'b']);
    const two = unlockAchievements(one, ['b', 'c']);
    expect(two.achievements).toEqual(['a', 'b', 'c']);
  });

  it('unlockAchievements trả CHÍNH object cũ khi không có gì mới', () => {
    const one = unlockAchievements(emptySave(), ['a']);
    expect(unlockAchievements(one, ['a'])).toBe(one);
  });

  it('updateSettings vá từng phần, không xoá field khác', () => {
    const updated = updateSettings(emptySave(), { disable3d: true });
    expect(updated.settings).toEqual({ disable3d: true, showHints: true });
  });
});
