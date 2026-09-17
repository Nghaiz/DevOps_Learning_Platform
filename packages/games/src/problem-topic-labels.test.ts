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

  it('K8s, Git và CI/CD cho nhãn tiếng Việt thật, không phải chính id', () => {
    expect(problemTopicLabels('k8s').workload).toBeTypeOf('string');
    expect(problemTopicLabels('k8s').workload).not.toBe('workload');
    expect(problemTopicLabels('git').branching).toBeTypeOf('string');
    expect(problemTopicLabels('git').branching).not.toBe('branching');
    /*
     * ⚠ Vế `not.toBe(id)` mới là vế gác được thứ gì ở đây. `CICD_PROBLEM_TOPICS`
     * dùng chuỗi tiếng Việt thẳng chứ không qua `t()`, và `t()` trả CHUỖI RỖNG
     * cho khoá chưa có — nên một lượt "dọn dẹp" chuyển sang `t()` sẽ cho tám
     * nhãn rỗng, `toBeTypeOf('string')` vẫn xanh, và chỉ dòng dưới đỏ.
     */
    expect(problemTopicLabels('cicd')['critical-path']).toBeTypeOf('string');
    expect(problemTopicLabels('cicd')['critical-path']).not.toBe('critical-path');
  });

  /*
   * Tám chủ đề, đúng bằng tập plugin khai. Bắt được: ai đó thêm một chủ đề vào
   * `CICD_PROBLEM_TOPICS` mà bảng nhãn không nhận (hoặc ngược lại) — bảng này
   * suy từ chính mảng đó, nên chỗ hỏng duy nhất còn lại là một nhãn RỖNG, và
   * một `Badge` rỗng là đúng hình dạng hỏng-im-lặng mà file này sinh ra để đóng.
   */
  it('CI/CD: mọi chủ đề đều có nhãn không rỗng', () => {
    const labels = problemTopicLabels('cicd');
    expect(Object.keys(labels)).toHaveLength(8);
    for (const [id, label] of Object.entries(labels)) {
      expect(label.length, id).toBeGreaterThan(0);
    }
  });

  /*
   * Bài Git mang chủ đề Git phải tra ra nhãn , chính là món nợ §18.A đóng ở
   * đây. Trước lượt này `PROBLEM_TOPIC_LABELS` (chỉ K8s) trả `undefined` và màn
   * hình hiện một Badge RỖNG.
   */
  it('chủ đề của game này KHÔNG tra nhầm sang bảng của game kia', () => {
    expect(problemTopicLabels('k8s').branching).toBeUndefined();
    expect(problemTopicLabels('git').workload).toBeUndefined();
    expect(problemTopicLabels('k8s')['critical-path']).toBeUndefined();
    expect(problemTopicLabels('git')['critical-path']).toBeUndefined();
    expect(problemTopicLabels('cicd').workload).toBeUndefined();
    expect(problemTopicLabels('cicd').branching).toBeUndefined();
  });

  it('game chưa có plugin bài trả bảng RỖNG, không ném', () => {
    expect(problemTopicLabels('pipeline')).toEqual({});
  });
});
