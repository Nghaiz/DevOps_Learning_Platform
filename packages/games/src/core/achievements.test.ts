import { describe, expect, it } from 'vitest';
import type { RunResult } from './types.ts';
import type { AchievementContext, LevelFacts } from './achievements.ts';
import {
  ALL_ACHIEVEMENT_RULES,
  K8S_ACHIEVEMENTS,
  achievementIds,
  evaluateAchievements,
} from './achievements.ts';

function level(id: string, chapter: number, overrides: Partial<LevelFacts> = {}): LevelFacts {
  return { id, chapter, parMoves: 5, difficulty: 'basic', bonusObjectiveIds: [], ...overrides };
}

function run(levelId: string, overrides: Partial<RunResult> = {}): RunResult {
  return {
    gameId: 'k8s',
    levelId,
    seed: 1,
    startedAt: 0,
    finishedAt: 60_000,
    objectivesMet: ['a'],
    objectivesTotal: 1,
    commandsUsed: 3,
    hintsUsed: 0,
    score: 800,
    ...overrides,
  };
}

function ctx(runs: readonly RunResult[], levels: readonly LevelFacts[]): AchievementContext {
  return { runs, levels };
}

describe('bảng luật', () => {
  it('không có id trùng', () => {
    const ids = achievementIds(ALL_ACHIEVEMENT_RULES);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mọi thành tựu có tiêu đề và mô tả không rỗng', () => {
    for (const rule of ALL_ACHIEVEMENT_RULES) {
      expect(rule.achievement.title.length).toBeGreaterThan(0);
      expect(rule.achievement.description.length).toBeGreaterThan(0);
    }
  });

  /**
   * Hợp đồng `core/types.ts`: `hidden: true` BẮT BUỘC kèm `teaser`, `hidden:
   * false` thì CẤM. Kiểm cả hai chiều — chiều thứ hai bắt được một teaser bị bỏ
   * quên trên một thành tựu đã đổi sang hiện, mà giao diện sẽ hiện thành hai
   * dòng mô tả chồng nhau.
   */
  it('hidden ⇔ teaser, cả hai chiều', () => {
    for (const { achievement } of ALL_ACHIEVEMENT_RULES) {
      if (achievement.hidden) {
        expect(achievement.teaser, achievement.id).toBeTruthy();
      } else {
        expect(achievement.teaser, achievement.id).toBeUndefined();
      }
    }
  });

  /**
   * Teaser nói MIỀN, giấu HÀNH ĐỘNG. Không kiểm được "có nảy ra giả thuyết
   * không" bằng máy, nhưng kiểm được hai dấu hiệu hỏng cụ thể: teaser lặp lại
   * nguyên văn mô tả (tức là không giấu gì), và teaser rỗng nghĩa.
   */
  it('teaser không phải bản sao của mô tả', () => {
    for (const { achievement } of ALL_ACHIEVEMENT_RULES) {
      if (achievement.teaser !== undefined) {
        expect(achievement.teaser).not.toBe(achievement.description);
        expect(achievement.teaser.length).toBeGreaterThan(12);
      }
    }
  });

  it('bối cảnh rỗng không mở khoá gì', () => {
    expect(evaluateAchievements(ALL_ACHIEVEMENT_RULES, ctx([], []))).toEqual([]);
  });
});

describe('luật theo chương', () => {
  const levels = [level('l1', 1), level('l2', 1), level('l3', 2)];

  it('qua hết chương 1 thì mở khoá', () => {
    const got = evaluateAchievements(K8S_ACHIEVEMENTS, ctx([run('l1'), run('l2')], levels));
    expect(got).toContain('k8s-chuong-1');
  });

  it('còn thiếu một level thì chưa mở', () => {
    const got = evaluateAchievements(K8S_ACHIEVEMENTS, ctx([run('l1')], levels));
    expect(got).not.toContain('k8s-chuong-1');
  });

  /**
   * `[].every(...)` trả `true` — nên một chương lane C chưa viết sẽ tự mở khoá
   * "hoàn thành chương N" cho mọi người chơi. Ô này gác đúng cái bẫy đó.
   */
  it('chương RỖNG không tự mở khoá', () => {
    const got = evaluateAchievements(K8S_ACHIEVEMENTS, ctx([run('l1'), run('l2')], levels));
    expect(got).not.toContain('k8s-chuong-3');
  });

  it('trọn bộ chỉ mở khi có level và đã qua hết', () => {
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([], []))).not.toContain('k8s-tron-bo');
    const all = [run('l1'), run('l2'), run('l3')];
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(all, levels))).toContain('k8s-tron-bo');
  });
});

describe('luật theo chỉ số của lượt chơi', () => {
  const levels = [level('l1', 1, { parMoves: 4 }), level('l2', 1, { difficulty: 'advanced' })];

  it('lượt TRƯỢT không tính, dù điểm cao', () => {
    const failed = run('l1', { score: 1000, objectivesMet: [] });
    const got = evaluateAchievements(K8S_ACHIEVEMENTS, ctx([failed], levels));
    expect(got).not.toContain('k8s-diem-tuyet-doi');
    expect(got).not.toContain('k8s-pod-dau-tien');
  });

  it('đúng par thì mở, vượt par thì không', () => {
    expect(
      evaluateAchievements(K8S_ACHIEVEMENTS, ctx([run('l1', { commandsUsed: 4 })], levels)),
    ).toContain('k8s-dung-par');
    expect(
      evaluateAchievements(K8S_ACHIEVEMENTS, ctx([run('l1', { commandsUsed: 5 })], levels)),
    ).not.toContain('k8s-dung-par');
  });

  it('par của level không có trong danh sách thì không mở khoá bừa', () => {
    const got = evaluateAchievements(
      K8S_ACHIEVEMENTS,
      ctx([run('la-mat', { commandsUsed: 0 })], levels),
    );
    expect(got).not.toContain('k8s-dung-par');
  });

  it('chẩn đoán nhanh chỉ tính level advanced và dưới 3 phút', () => {
    const fast = run('l2', { finishedAt: 100_000 });
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([fast], levels))).toContain(
      'k8s-chan-doan-nhanh',
    );
    const slow = run('l2', { finishedAt: 400_000 });
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([slow], levels))).not.toContain(
      'k8s-chan-doan-nhanh',
    );
    const easyFast = run('l1', { finishedAt: 100_000 });
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([easyFast], levels))).not.toContain(
      'k8s-chan-doan-nhanh',
    );
  });

  it('"trở lại" đòi lượt THUA phải xảy ra TRƯỚC lượt qua', () => {
    const failedFirst = [
      run('l1', { startedAt: 1_000, objectivesMet: [] }),
      run('l1', { startedAt: 9_000 }),
    ];
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(failedFirst, levels))).toContain('k8s-tro-lai');
    // Qua trước rồi mới thua: có đủ cả hai loại lượt, nhưng KHÔNG phải "quay lại
    // sau thất bại". So bằng `some(passed) && some(failed)` sẽ mở khoá nhầm ở đây.
    const passedFirst = [
      run('l1', { startedAt: 1_000 }),
      run('l1', { startedAt: 9_000, objectivesMet: [] }),
    ];
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(passedFirst, levels))).not.toContain(
      'k8s-tro-lai',
    );
  });

  it('"tỉ mỉ" đòi đạt HẾT mục tiêu thưởng, và level không có thưởng thì không tính', () => {
    const withBonus = [level('l1', 1, { bonusObjectiveIds: ['b1', 'b2'] })];
    const all = run('l1', { objectivesMet: ['a', 'b1', 'b2'] });
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([all], withBonus))).toContain('k8s-ti-mi');
    const partial = run('l1', { objectivesMet: ['a', 'b1'] });
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([partial], withBonus))).not.toContain('k8s-ti-mi');
    // `[].every(...)` trả `true` — level không có mục tiêu thưởng sẽ tự mở khoá
    // nếu không chặn riêng. Đây là lần thứ hai cái bẫy đó xuất hiện trong file này.
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([run('l1')], levels))).not.toContain('k8s-ti-mi');
  });

  it('"không thừa một nước" đòi ĐỦ CẢ BA điều kiện', () => {
    const perfect = run('l1', { score: 1000, hintsUsed: 0, commandsUsed: 4 });
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([perfect], levels))).toContain(
      'k8s-khong-thua-mot-nuoc',
    );
    for (const broken of [
      { ...perfect, score: 999 },
      { ...perfect, hintsUsed: 1 },
      { ...perfect, commandsUsed: 5 },
    ]) {
      expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx([broken], levels))).not.toContain(
        'k8s-khong-thua-mot-nuoc',
      );
    }
  });

  it('kết quả tất định theo thứ tự khai báo', () => {
    const runs = [run('l1'), run('l2')];
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(runs, levels))).toEqual(
      evaluateAchievements(K8S_ACHIEVEMENTS, ctx(runs, levels)),
    );
  });
});
