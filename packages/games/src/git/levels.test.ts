/**
 * Ô nghiệm thu **AC-8** và **AC-9** của P17, cộng các bất biến cấu trúc của
 * 32 level.
 *
 * AC-8: chạy `solutionCommands` của CẢ 32 level rồi khẳng định AC.
 * AC-9: chạy `altSolutionCommands` và khẳng định nó CŨNG AC.
 *
 * ⛔ AC-9 không phải một ô cho đẹp. Nó là bằng chứng duy nhất rằng bộ chấm đọc
 * **trạng thái** chứ không đọc **lệnh đã gõ**. gitmastery.me chấm bằng khớp mẫu
 * lệnh và hệ quả đo được là: gõ đúng lệnh mà repo sai bét vẫn qua bài, và không
 * thể có nhiều lời giải. Nếu ai đó lén thêm một vị từ "người chơi đã gõ X" thì
 * ô này đỏ, và đó là cách duy nhất phát hiện ra.
 */

import { describe, expect, it } from 'vitest';

import { GIT_LEVELS, findGitLevel, gitLevelsOfChapter } from './levels/index.ts';
import { GIT_LEVEL_IDS, theoryIdForLevel } from './level-ids.ts';
import { GIT_PREDICATE_NAMES, evaluateObjectives, verdictOf } from './predicates.ts';
import { buildWorld } from './world-spec.ts';
import { GIT_VERBS } from './command-table.ts';
import { checkSolvable } from './solvability.ts';

/*
 * Hàm `judge()` từng nằm ở đây đã chuyển thành `checkSolvable` (§18.E.7,
 * `git/solvability.ts`) — CÙNG một cỗ máy, không phải một bản sao.
 *
 * Level Builder cần đúng phép đo này cho level người dùng vừa dựng. Giữ hai bản
 * là tạo ra hai định nghĩa của "level này qua được", và chúng sẽ trôi khỏi nhau.
 * Hệ quả có lợi và là lý do chính: phép kiểm mà Builder chạy cho level của bạn
 * LÀ đúng phép kiểm mà 32 level dưới đây đi qua.
 */

describe('cấu trúc 32 level', () => {
  it('đúng 32 level, khớp level-ids.ts cả số lượng lẫn thứ tự', () => {
    expect(GIT_LEVELS).toHaveLength(32);
    expect(GIT_LEVELS.map((l) => l.id)).toEqual([...GIT_LEVEL_IDS]);
  });

  it('id không trùng nhau', () => {
    expect(new Set(GIT_LEVELS.map((l) => l.id)).size).toBe(32);
  });

  it('mỗi chương đủ số level theo bản đồ chủ đề', () => {
    expect(gitLevelsOfChapter(1)).toHaveLength(12);
    expect(gitLevelsOfChapter(2)).toHaveLength(12);
    expect(gitLevelsOfChapter(3)).toHaveLength(8);
  });

  it('mỗi level có ít nhất MỘT mục tiêu bắt buộc', () => {
    for (const level of GIT_LEVELS) {
      const required = level.objectives.filter((o) => o.required);
      expect(required.length, `${level.id} không có mục tiêu bắt buộc nào`).toBeGreaterThan(0);
    }
  });

  it('mọi vị từ level dùng đều có trong danh sách đã hiện thực', () => {
    for (const level of GIT_LEVELS) {
      for (const o of level.objectives) {
        expect(GIT_PREDICATE_NAMES, `${level.id}/${o.id} dùng vị từ lạ`).toContain(o.check);
      }
    }
  });

  it('id mục tiêu không trùng trong cùng một level', () => {
    for (const level of GIT_LEVELS) {
      const ids = level.objectives.map((o) => o.id);
      expect(new Set(ids).size, `${level.id} có id mục tiêu trùng`).toBe(ids.length);
    }
  });

  it('theoryId khớp quy ước một-một với level id', () => {
    for (const level of GIT_LEVELS) {
      expect(level.theoryId, `${level.id} thiếu theoryId`).toBe(theoryIdForLevel(level.id));
    }
  });

  it('mọi động từ trong allowedCommands đều là lệnh có thật trong bảng lệnh', () => {
    for (const level of GIT_LEVELS) {
      if (level.allowedCommands === null) continue;
      for (const verb of level.allowedCommands) {
        expect(GIT_VERBS as readonly string[], `${level.id} cho phép lệnh lạ '${verb}'`).toContain(
          verb,
        );
      }
    }
  });

  it('allowedCommands rỗng là BẪY — không level nào được dùng []', () => {
    // `null` = mọi lệnh; `[]` mang nghĩa NGƯỢC LẠI là cấm mọi lệnh. Cái bẫy này
    // đã cắn một lần ở `k8s/problem.ts` (`allowedResources`), nên nó có ô gác.
    for (const level of GIT_LEVELS) {
      expect(level.allowedCommands, `${level.id} cấm mọi lệnh`).not.toEqual([]);
    }
  });

  it('mỗi level có đủ hai lời giải, và chúng KHÁC nhau', () => {
    for (const level of GIT_LEVELS) {
      expect(level.solutionCommands.length, `${level.id} không có lời giải`).toBeGreaterThan(0);
      expect(level.altSolutionCommands.length, `${level.id} không có lời giải thứ hai`).toBeGreaterThan(0);
      expect(
        level.altSolutionCommands.join('\n'),
        `${level.id}: hai lời giải giống hệt nhau, AC-9 không chứng minh được gì`,
      ).not.toBe(level.solutionCommands.join('\n'));
    }
  });

  it('findGitLevel trả null cho id lạ thay vì ném', () => {
    expect(findGitLevel('git-99-khong-co')).toBeNull();
    expect(findGitLevel('git-01-commit-la-object')).not.toBeNull();
  });

  it('trạng thái đầu của mọi level dựng được, không ném', () => {
    for (const level of GIT_LEVELS) {
      expect(() => buildWorld(level.setup, 1), `${level.id} có setup hỏng`).not.toThrow();
      if (level.target !== undefined) {
        expect(() => buildWorld(level.target!, 1), `${level.id} có target hỏng`).not.toThrow();
      }
    }
  });

  it('mục tiêu của level CHƯA đạt ở trạng thái đầu', () => {
    // Một level đã thắng sẵn lúc mở ra là một level không dạy gì. Ô này bắt
    // đúng loại lỗi mà AC-8 KHÔNG bắt được: AC-8 chỉ nói "lời giải đạt", và một
    // level đạt-sẵn cũng thoả điều đó.
    const alreadyWon: string[] = [];
    for (const level of GIT_LEVELS) {
      const world = buildWorld(level.setup, 1);
      const target = level.target === undefined ? null : buildWorld(level.target, 1);
      if (verdictOf(evaluateObjectives(world, target, level.objectives)).accepted) {
        alreadyWon.push(level.id);
      }
    }
    expect(alreadyWon, 'level đã thắng sẵn lúc mở ra').toEqual([]);
  });
});

describe('AC-8 — solutionCommands của cả 32 level đều AC', () => {
  for (const level of GIT_LEVELS) {
    it(`${level.id}`, () => {
      const r = checkSolvable(level, level.solutionCommands);
      expect(r.accepted, r.diagnosis).toBe(true);
    });
  }
});

describe('AC-9 — altSolutionCommands cũng AC, chứng minh chấm theo TRẠNG THÁI', () => {
  for (const level of GIT_LEVELS) {
    it(`${level.id}`, () => {
      const r = checkSolvable(level, level.altSolutionCommands);
      expect(r.accepted, r.diagnosis).toBe(true);
    });
  }
});
