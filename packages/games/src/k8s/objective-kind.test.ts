import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels/index.ts';
import { classifyObjectives } from './objective-kind.ts';
import { initialState } from './reducer.ts';
import { evaluateObjectives, sessionPhase } from './session.ts';

const SEED = 1;

function level(id: string) {
  const found = LEVELS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`Không có level ${id} — test này đang gác một level đã bị đổi tên.`);
  }
  return found;
}

describe('classifyObjectives', () => {
  it('mọi mục tiêu rơi vào đúng một trong hai nhóm, không sót không trùng', () => {
    for (const entry of LEVELS) {
      const { goals, guards } = classifyObjectives(entry, SEED);
      const all = [...goals, ...guards].sort();
      expect(new Set(all).size, entry.id).toBe(all.length);
      expect(all, entry.id).toEqual(entry.objectives.map((objective) => objective.id).sort());
    }
  });

  /*
   * ĐỐI CHỨNG DƯƠNG. Không có ô này thì `guards` rỗng ở mọi level cũng làm ô
   * trên xanh — phép phân loại sẽ "đúng" bằng cách không bao giờ phân loại gì.
   */
  it('level 10 xếp `toan-bo-image-moi` vào nhóm PHẢI GIỮ', () => {
    const { guards, goals } = classifyObjectives(level('k8s-10-replicaset-mo-coi'), SEED);
    expect(guards).toContain('toan-bo-image-moi');
    expect(goals).toContain('xoa-replicaset-mo-coi');
  });

  /*
   * ĐỐI CHỨNG ÂM, và đây là ô duy nhất chứng minh vì sao phải đo ở HAI thời
   * điểm. `khong-con-ly-do-loi` ĐẠT ở tick 0 (container chưa kịp sập) nên một
   * phép phân loại chỉ đọc trạng thái đầu sẽ gọi nó là guard — sai, nó chính là
   * việc người chơi phải làm ở level này.
   */
  it('level 3 xếp `khong-con-ly-do-loi` vào nhóm PHẢI LÀM, dù nó đạt ở tick 0', () => {
    const l03 = level('k8s-03-doc-log-truoc-khi-doan');
    const metAtStart = evaluateObjectives(initialState(l03, SEED), l03.objectives);
    expect(metAtStart, 'tiền đề: mục tiêu này ĐẠT ở tick 0').toContain('khong-con-ly-do-loi');

    expect(classifyObjectives(l03, SEED).goals).toContain('khong-con-ly-do-loi');
  });

  it('không level nào đã THẮNG sẵn lúc vừa vào', () => {
    for (const entry of LEVELS) {
      const met = evaluateObjectives(initialState(entry, SEED), entry.objectives);
      expect(sessionPhase(entry.objectives, met), entry.id).toBe('playing');
    }
  });

  it('mọi level còn ít nhất một việc PHẢI LÀM', () => {
    for (const entry of LEVELS) {
      expect(classifyObjectives(entry, SEED).goals.length, entry.id).toBeGreaterThan(0);
    }
  });
});
