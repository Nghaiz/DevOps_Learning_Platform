import { describe, expect, it } from 'vitest';
import { GAME_IDS, PROBLEM_TOPICS, type ProblemFilter } from '@devops-platform/games';

import {
  DEFAULT_PROBLEM_GAME,
  PROBLEM_FILTER_GAMES,
  gameName,
  parseGame,
  topicIdsFor,
} from './problem-game';

/*
  ────────────────────────────────────────────────────────────────────────────
  Ô GHIM ĐÃ ĐẢO — 2026-09-15
  ────────────────────────────────────────────────────────────────────────────

  Chỗ này từng là một `@ts-expect-error` ghim KHOẢNG TRỐNG: `ProblemFilter.topics`
  đóng ở chín chủ đề K8s, nên `'branching'` của game Git không gán vào đó được và
  khối lọc phải tự khoá.

  Khoảng trống đã ĐÓNG (`k8s/problem.ts` § ProblemFilter nay dùng `ProblemTopicId`),
  nên ô ghim được ĐẢO chứ không xoá: dòng dưới nay khẳng định trạng thái LÀNH, và
  nó đỏ nếu ai đó thu hẹp hợp đồng lại. `rules/pinned-baseline-test-companion.md`
  cấm đúng nước đi kia — dập một ô ghim cho xanh biến bản vá tạm thành nền vĩnh
  viễn, và một pin xoá đi không để lại gì thì lần thu hẹp sau không ai bắt được.

  ⚠ Đây là nửa KIỂU. Nửa còn lại là `problemFilterSchema` ở
  `apps/web/src/server/problems/list-input.ts` — nới kiểu mà quên nó thì `tsc`
  xanh còn người dùng nhận 400. Ô cho nửa đó ở `list-input.test.ts`.
*/
const _moiGameChoDuocChuDe: ProblemFilter['topics'] = ['branching', 'workload'];
void _moiGameChoDuocChuDe;

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
    expect(topicIdsFor(DEFAULT_PROBLEM_GAME).length).toBeGreaterThan(0);
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

describe('mọi game có từ vựng đều đi qua được hợp đồng lọc', () => {
  /*
    Ô này THAY cho ba ô cũ đo "chủ đề game này hợp đồng chở được không". Ba ô đó
    đo một khoảng trống, và khoảng trống đã đóng — giữ lại là giữ một phép đo về
    thứ không còn tồn tại.

    Vế đáng giữ là vế NGƯỢC: từ nay không game nào bị hợp đồng loại, và nếu một
    ngày ai đó thu hẹp `ProblemFilter.topics` lại thì ô này phải đỏ.
  */
  it('mọi game trong bộ chọn đều có từ vựng chủ đề gán được vào bộ lọc', () => {
    for (const gameId of PROBLEM_FILTER_GAMES) {
      const topics: ProblemFilter['topics'] = topicIdsFor(gameId);
      expect(topics?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('chủ đề của Git gán được — đây là thứ khối 6 bị chặn suốt', () => {
    const chiGit: ProblemFilter['topics'] = topicIdsFor('git');
    expect([...(chiGit ?? [])]).toContain('branching');
  });

  it('chín chủ đề K8s vẫn đi qua nguyên vẹn sau khi nới', () => {
    // Nới một hợp đồng dễ làm hỏng phía đang chạy hơn là phía mới mở.
    const k8s = topicIdsFor('k8s');
    expect([...k8s]).toEqual([...PROBLEM_TOPICS]);
  });
});
