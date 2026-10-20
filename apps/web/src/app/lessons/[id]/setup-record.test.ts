import { describe, expect, it } from 'vitest';
import { assumedSetupPhases, forgetSetupRecord, readSetupRecord, recordSetupRan } from './setup-record';

function memoryStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe('setup-record: nhận lại máy không được chạy lại setup đã chạy', () => {
  it('chưa ghi gì cho máy ⇒ null, để người gọi biết phải đoán', () => {
    expect(readSetupRecord('s1', memoryStorage())).toBeNull();
  });

  it('ghi theo từng máy: máy mới không thừa hưởng phase của máy cũ', () => {
    const storage = memoryStorage();
    recordSetupRan('s1', 'intro', storage, 1_000);
    recordSetupRan('s1', 'step-0', storage, 1_000);
    recordSetupRan('s2', 'intro', storage, 1_000);
    expect([...(readSetupRecord('s1', storage) ?? [])].sort()).toEqual(['intro', 'step-0']);
    expect([...(readSetupRecord('s2', storage) ?? [])]).toEqual(['intro']);
  });

  it('bản ghi quá một ngày bị dọn ở lượt ghi kế tiếp', () => {
    const storage = memoryStorage();
    recordSetupRan('old', 'intro', storage, 0);
    recordSetupRan('new', 'intro', storage, 25 * 60 * 60 * 1000);
    expect(readSetupRecord('old', storage)).toBeNull();
    expect(readSetupRecord('new', storage)).not.toBeNull();
  });

  it('máy tắt thì quên bản ghi của nó, giữ của máy khác', () => {
    const storage = memoryStorage();
    recordSetupRan('s1', 'intro', storage, 1_000);
    recordSetupRan('s2', 'intro', storage, 1_000);
    forgetSetupRecord('s1', storage);
    expect(readSetupRecord('s1', storage)).toBeNull();
    expect(readSetupRecord('s2', storage)).not.toBeNull();
  });

  it('storage hỏng hoặc bị chặn không ném', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    expect(readSetupRecord('s1', broken)).toBeNull();
    expect(() => recordSetupRan('s1', 'intro', broken)).not.toThrow();
    expect(readSetupRecord('s1', null)).toBeNull();
  });

  it('không có bản ghi: coi phase đầu và mọi bước tới chỗ đang dở là đã setup', () => {
    const phases = [
      { key: 'intro', stepIndex: null },
      { key: 'step-0', stepIndex: 0 },
      { key: 'step-1', stepIndex: 1 },
      { key: 'step-2', stepIndex: 2 },
      { key: 'finish', stepIndex: null },
    ];
    expect([...assumedSetupPhases(phases, 1)].sort()).toEqual(['intro', 'step-0', 'step-1']);
  });
});
