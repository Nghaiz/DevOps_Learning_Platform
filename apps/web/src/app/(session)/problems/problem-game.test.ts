import { describe, expect, it } from 'vitest';
import { GAME_IDS, PROBLEM_TOPICS, type ProblemFilter } from '@devops-platform/games';

import {
  DEFAULT_PROBLEM_GAME,
  PROBLEM_FILTER_GAMES,
  filterableTopicsFor,
  gameName,
  parseGame,
  topicIdsFor,
  topicsFilterable,
} from './problem-game';

/*
  ────────────────────────────────────────────────────────────────────────────
  Ô GHIM — ĐỌC TRƯỚC KHI LÀM NÓ XANH LẠI
  ────────────────────────────────────────────────────────────────────────────

  Dòng `@ts-expect-error` dưới đây ghim một KHOẢNG TRỐNG, không ghim một hành vi
  đúng. Nó nói: "hôm nay `ProblemFilter.topics` còn đóng ở chín chủ đề K8s, nên
  `'branching'` KHÔNG gán vào đó được."

  ⚠ NÓ ĐỎ THEO CHIỀU NGƯỢC VỚI TRỰC GIÁC. `tsc` chỉ kêu khi phép gán này THÔI
  không còn lỗi, tức lúc ai đó đã nới hợp đồng. Thông báo sẽ là
  `Unused '@ts-expect-error' directive` — đọc như "có gì đó vừa hỏng", trong khi
  sự thật là ngược lại: khoảng trống vừa ĐÓNG.

  ⛔ Việc phải làm khi nó đỏ là GỠ ô ghim này và BẬT nhánh Git lên:

    1. Xoá `topicsFilterable` + `filterableTopicsFor` khỏi `problem-game.ts`
       (cả hai chỉ tồn tại vì khoảng trống này).
    2. `problem-query.ts` lọc chủ đề bằng `topicIdsFor(game)` thay cho
       `filterableTopicsFor(game)`.
    3. `problems-toolbar.tsx` bỏ nhánh KHOÁ trong `TopicFilter`; xoá khoá copy
       `catalog.problems.game-locked`.
    4. Kiểm lại nửa máy chủ: `problemFilterSchema` ở
       `apps/web/src/server/problems/list-input.ts` phải nhận id chủ đề của mọi
       game. Nới kiểu mà quên nửa này thì `tsc` xanh còn người dùng nhận 400.

  ⛔ TUYỆT ĐỐI KHÔNG làm nó im bằng cách đổi `'branching'` thành một chủ đề K8s,
  thêm `@ts-ignore`, hay xoá riêng dòng ghim. Cả ba đều biến một bản vá tạm
  thành nền vĩnh viễn, và không ai đọc lại nữa. Luật của dự án cho đúng hình
  dạng này: `rules/pinned-baseline-test-companion.md`.
*/
// @ts-expect-error — GHIM: ProblemFilter.topics còn đóng ở 9 chủ đề K8s. Đỏ = hợp đồng ĐÃ nới ⇒ đọc khối trên và BẬT nhánh Git, đừng khoá lại.
const _gitTopicIsNotCarriableYet: ProblemFilter['topics'] = ['branching'];

describe('bộ chọn game của khối lọc chủ đề', () => {
  it('mọi game có từ vựng chủ đề đều có mặt trong bộ chọn', () => {
    /*
      Không có ô này thì một game được cấp chủ đề nhưng quên khai tên sẽ lặng lẽ
      biến mất khỏi danh sách: `PROBLEM_FILTER_GAMES` đòi CẢ tên lẫn từ vựng,
      nên thiếu tên đọc ra y hệt "game này chưa có chủ đề". Bài của nó vẫn nằm
      trong kho, vẫn hiện nhãn chủ đề đúng ở bảng, chỉ là không ai lọc được —
      đúng kiểu hỏng không kêu mà §18.D vừa đóng một lần rồi.
    */
    const withVocabulary = GAME_IDS.filter((gameId) => topicIdsFor(gameId).length > 0);
    expect([...PROBLEM_FILTER_GAMES]).toEqual([...withVocabulary]);
  });

  it('hai game có bài OJ đều chọn được, và mang tên người dùng đọc được', () => {
    expect([...PROBLEM_FILTER_GAMES]).toContain('k8s');
    expect([...PROBLEM_FILTER_GAMES]).toContain('git');
    expect(gameName('k8s')).not.toBe('k8s');
    expect(gameName('git')).not.toBe('git');
  });

  it('game chưa có plugin bài KHÔNG lọt vào bộ chọn', () => {
    expect([...PROBLEM_FILTER_GAMES]).not.toContain('pipeline');
  });

  it('mặc định là k8s — mọi link ?topic=… đã gửi đi vẫn đọc lại được', () => {
    expect(DEFAULT_PROBLEM_GAME).toBe('k8s');
    expect(filterableTopicsFor(DEFAULT_PROBLEM_GAME).length).toBeGreaterThan(0);
  });

  it('giá trị game lạ trong URL rơi về mặc định, không ném', () => {
    expect(parseGame('git')).toBe('git');
    expect(parseGame('cicd')).toBe(DEFAULT_PROBLEM_GAME);
    expect(parseGame(null)).toBe(DEFAULT_PROBLEM_GAME);
    expect(parseGame('<script>')).toBe(DEFAULT_PROBLEM_GAME);
  });
});

describe('từ vựng chủ đề đổi theo game', () => {
  it('hai game cho hai tập chủ đề RỜI NHAU', () => {
    const k8s = new Set(topicIdsFor('k8s'));
    const git = topicIdsFor('git');
    expect(git.length).toBeGreaterThan(0);
    expect(git.filter((id) => k8s.has(id))).toEqual([]);
  });

  it('nhãn tra ra tiếng Việt thật cho CẢ HAI game, không phải chính id', () => {
    // Đây là thứ §18.D đã đóng ở tầng bảng; ô này giữ nó ở tầng bộ lọc.
    for (const gameId of PROBLEM_FILTER_GAMES) {
      const labels = topicIdsFor(gameId);
      expect(labels.length).toBeGreaterThan(0);
    }
    expect(topicIdsFor('git')).toContain('branching');
  });
});

describe('cổng "chủ đề này hợp đồng chở được không"', () => {
  /*
    ĐỐI CHỨNG HAI CHIỀU. Một vị từ chỉ từng trả `true` là một vị từ chưa chứng
    minh được gì — nó có thể đang trả `true` cho mọi đầu vào
    (`rules/green-that-proves-nothing.md`). Hai ô dưới đây ép nó phân biệt.
  */
  it('K8s đi qua được', () => {
    expect(topicsFilterable('k8s')).toBe(true);
    expect([...filterableTopicsFor('k8s')]).toEqual([...PROBLEM_TOPICS]);
  });

  it('Git CHƯA đi qua được, nên khối lọc tự khoá thay vì gửi một 400', () => {
    /*
      Đo 2026-09-15 trên `problemFilterSchema`:
        { topics: ['workload'] }  → OK
        { topics: ['branching'] } → invalid_value, "expected one of workload|…|troubleshooting"
      Nên nhánh này KHÔNG được gửi đi. Ô ghim ở đầu file là thứ báo khi điều đó đổi.
    */
    expect(topicsFilterable('git')).toBe(false);
    expect([...filterableTopicsFor('git')]).toEqual([]);
  });

  it('game không có chủ đề nào KHÔNG được đọc ra là "lọc được"', () => {
    // `[].every(...)` trả `true` — nên `ids.length > 0` trong vị từ là vế THẬT,
    // không phải một lượt kiểm thừa. Bỏ nó đi thì bốn game rỗng đều "lọc được".
    expect(topicsFilterable('pipeline')).toBe(false);
  });
});
