import { describe, expect, it } from 'vitest';
import { summarizePathProgress } from './path-progress';

/**
 * Bẫy P2 §2 ở dạng của 13.E: một nhãn tiến độ khẳng định nhiều hơn dữ liệu.
 * Mỗi ca dưới đây gác một câu chữ CỤ THỂ, không gác "hàm chạy được".
 */
describe('summarizePathProgress', () => {
  it('đang dở: nói đúng số phần đã đạt, KHÔNG làm tròn lên thành xong', () => {
    const summary = summarizePathProgress({ passedCount: 2, itemCount: 5, nextItemId: 'k8s-pod' });

    expect(summary.label).toBe('Đã đạt 2/5 phần');
    expect(summary.value).toBe(2);
    expect(summary.max).toBe(5);
    // Ca đã đẻ ra nợ P2: nhãn nói "xong" cho một lộ trình mới đạt 2/5.
    expect(summary.label).not.toContain('5/5');
    expect(summary.nextLabel).not.toContain('tất cả');
  });

  it('đang dở: trỏ tới phần tiếp theo bằng MÃ phần, đánh dấu để UI hiện dạng mã', () => {
    const summary = summarizePathProgress({ passedCount: 1, itemCount: 4, nextItemId: 'ci-cd-01' });

    expect(summary.nextLabel).toBe('Phần tiếp theo: ci-cd-01');
    expect(summary.nextIsItemId).toBe(true);
  });

  it('đạt hết: nói "đã đạt tất cả các phần", KHÔNG nói "hoàn thành lộ trình"', () => {
    const summary = summarizePathProgress({ passedCount: 4, itemCount: 4, nextItemId: null });

    expect(summary.label).toBe('Đã đạt 4/4 phần');
    expect(summary.nextLabel).toBe('Đã đạt tất cả các phần');
    expect(summary.nextIsItemId).toBe(false);
    // "hoàn thành lộ trình" là một trạng thái KHÔNG cột nào lưu — đạt hết phần
    // là thứ ta đếm được, hoàn thành là thứ ta không biết.
    expect(summary.nextLabel).not.toContain('hoàn thành');
  });

  it('còn phần chưa đạt nhưng không phần nào đang mở: KHÔNG đọc thành đã xong', () => {
    // `nextItemIdOf` trả null ở HAI ca. Ca này là ca thứ hai — mọi phần còn lại
    // đều `locked`. Nhầm nó với "đạt hết" là nói dối đúng với người đang bị chặn.
    const summary = summarizePathProgress({ passedCount: 1, itemCount: 3, nextItemId: null });

    expect(summary.label).toBe('Đã đạt 1/3 phần');
    expect(summary.nextLabel).toBe('Không còn phần nào đang mở — mở khoá bằng cách đạt phần trước đó');
    expect(summary.nextLabel).not.toContain('tất cả');
  });

  it('lộ trình rỗng: không hiện phân số 0/0', () => {
    const summary = summarizePathProgress({ passedCount: 0, itemCount: 0, nextItemId: null });

    expect(summary.label).toBe('Lộ trình chưa có phần nào');
    expect(summary.label).not.toContain('0/0');
    expect(summary.max).toBe(0);
    expect(summary.nextLabel).toBeNull();
  });
});
