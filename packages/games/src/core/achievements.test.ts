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
  return { id, chapter, parMoves: 5, difficulty: 'basic', ...overrides };
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

  it('kiên trì đếm CẢ lượt trượt nhưng đòi cuối cùng phải qua', () => {
    const attempts = [
      run('l1', { objectivesMet: [] }),
      run('l1', { objectivesMet: [] }),
      run('l1', { objectivesMet: [] }),
      run('l1', { objectivesMet: [] }),
      run('l1'),
    ];
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(attempts, levels))).toContain('k8s-kien-tri');
    const neverCleared = attempts.map((r) => ({ ...r, objectivesMet: [] }));
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(neverCleared, levels))).not.toContain(
      'k8s-kien-tri',
    );
  });

  it('kết quả tất định theo thứ tự khai báo', () => {
    const runs = [run('l1'), run('l2')];
    expect(evaluateAchievements(K8S_ACHIEVEMENTS, ctx(runs, levels))).toEqual(
      evaluateAchievements(K8S_ACHIEVEMENTS, ctx(runs, levels)),
    );
  });
});
