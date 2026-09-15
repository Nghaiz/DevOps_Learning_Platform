import { describe, expect, it } from 'vitest';

import { GAME_IDS } from './core/types.ts';
import { problemTopicLabels } from './problem-topic-labels.ts';

/**
 * Hành vi của bảng nhãn. KHÔNG có phép dò đồ thị nhập ở đây.
 *
 * ⛔ Ô gác chống-rò-engine SỐNG Ở `apps/web`, không ở file này, và lý do là một
 * ràng buộc của chính package này: `packages/games` CỐ Ý không khai
 * `@types/node`, vì nó chạy trong trình duyệt. Một ô test đọc đĩa (`node:fs`)
 * làm `pnpm --filter @devops-platform/games typecheck` ĐỎ với `TS2591`, và cách
 * duy nhất làm nó xanh lại là thêm `@types/node` , tức mở đường cho mã engine
 * `import` `node:fs` mà không cổng nào kêu. Đổi một ô gác lấy một lỗ hổng lớn
 * hơn thứ nó gác.
 *
 * Ô đó nay ở `apps/web/src/app/(session)/problems/engine-leak.test.ts`, đúng
 * chỗ hậu quả rơi xuống: cái bị đội lên là BUNDLE của ứng dụng web.
 *
 * ⚠ Bài học của lượt này: `npx vitest run` XANH trên file cũ, vì vitest không
 * kiểm kiểu. Chỉ `tsc` thấy. Plan §3 đã dặn đúng điều đó ("chạy CẢ HAI lệnh"),
 * và lượt này vi phạm nó.
 */
describe('problemTopicLabels', () => {
  it('mọi GameId tra được một bảng, không cái nào undefined', () => {
    for (const gameId of GAME_IDS) {
      expect(problemTopicLabels(gameId)).toBeTypeOf('object');
    }
  });

  it('K8s và Git cho nhãn tiếng Việt thật, không phải chính id', () => {
    expect(problemTopicLabels('k8s').workload).toBeTypeOf('string');
    expect(problemTopicLabels('k8s').workload).not.toBe('workload');
    expect(problemTopicLabels('git').branching).toBeTypeOf('string');
    expect(problemTopicLabels('git').branching).not.toBe('branching');
  });

  /*
   * Bài Git mang chủ đề Git phải tra ra nhãn , chính là món nợ §18.A đóng ở
   * đây. Trước lượt này `PROBLEM_TOPIC_LABELS` (chỉ K8s) trả `undefined` và màn
   * hình hiện một Badge RỖNG.
   */
  it('chủ đề của game này KHÔNG tra nhầm sang bảng của game kia', () => {
    expect(problemTopicLabels('k8s').branching).toBeUndefined();
    expect(problemTopicLabels('git').workload).toBeUndefined();
  });

  it('game chưa có plugin bài trả bảng RỖNG, không ném', () => {
    expect(problemTopicLabels('pipeline')).toEqual({});
  });
});
