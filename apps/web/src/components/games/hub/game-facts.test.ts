import { describe, expect, it } from 'vitest';
import { CICD_LEVELS, GIT_LEVELS, LEVELS } from '@devops-platform/games';
import { countCompleted, factsOf, levelHref, nextLevelId } from './game-facts';

describe('factsOf: số màn, số chương, dải độ khó suy ra từ dữ liệu màn', () => {
  /*
   * Ba con số này là thứ trang /games IN RA. Ghim theo dữ liệu thật để một màn
   * bị xoá nhầm khỏi barrel làm ô đỏ, thay vì làm trang lặng lẽ in số nhỏ hơn.
   */
  it('ba game có đúng số màn và số chương của dữ liệu hiện tại', () => {
    const k8s = factsOf('k8s', LEVELS);
    const git = factsOf('git', GIT_LEVELS);
    const cicd = factsOf('cicd', CICD_LEVELS);
    expect([k8s.levelIds.length, git.levelIds.length, cicd.levelIds.length]).toEqual([36, 32, 28]);
    expect([k8s.chapters, git.chapters, cicd.chapters]).toEqual([6, 3, 2]);
  });

  it('id giữ đúng thứ tự chơi của mảng nguồn', () => {
    expect(factsOf('git', GIT_LEVELS).levelIds).toEqual(GIT_LEVELS.map((level) => level.id));
  });

  it('dải độ khó là mức dễ nhất và khó nhất có thật, không phải một nhãn chung', () => {
    const facts = factsOf('k8s', [
      { id: 'a', chapter: 1, difficulty: 'intermediate' },
      { id: 'b', chapter: 1, difficulty: 'advanced' },
      { id: 'c', chapter: 2, difficulty: 'intermediate' },
    ]);
    expect([facts.easiest, facts.hardest, facts.chapters]).toEqual(['intermediate', 'advanced', 2]);
  });

  it('game không có màn nào là lỗi, không phải một dải rỗng', () => {
    expect(() => factsOf('cicd', [])).toThrow(/không có màn nào/);
  });
});

describe('tiến độ', () => {
  const ids = ['m1', 'm2', 'm3'];

  it('màn tiếp là màn đầu tiên chưa qua theo thứ tự chơi', () => {
    expect(nextLevelId(ids, new Set(['m1', 'm3']))).toBe('m2');
    expect(nextLevelId(ids, new Set(ids))).toBeNull();
  });

  it('chỉ đếm id còn tồn tại: bản lưu cũ giữ id đã bỏ không làm số vượt tổng', () => {
    expect(countCompleted(ids, new Set(['m1', 'da-bo', 'm2']))).toBe(2);
  });

  it('đường vào thẳng một màn khác nhau theo game', () => {
    expect(levelHref('cicd', 'cicd-c01')).toBe('/games/cicd/cicd-c01');
    expect(levelHref('git', 'g-01')).toBe('/games/git?level=g-01');
    expect(levelHref('k8s', 'k8s-01')).toBe('/games/k8s?level=k8s-01');
  });
});
