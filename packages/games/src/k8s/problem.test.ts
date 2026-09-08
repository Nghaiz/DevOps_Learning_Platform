import { describe, expect, it } from 'vitest';
import {
  PROBLEM_CODE_PATTERN,
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  PROBLEM_STATES,
  PROBLEM_TOPICS,
  PROBLEM_TOPIC_LABELS,
  isProblemCode,
} from './problem.ts';

/**
 * Cổng gác cho hợp đồng bài OJ.
 *
 * Mỗi test ở đây tồn tại vì có một cách hỏng CỤ THỂ mà nó bắt được, không phải
 * để phủ dòng. Trước khi thêm test mới vào file này, trả lời được câu "nếu thứ
 * này hỏng ngay bây giờ thì test có đỏ không" — nếu không, đó là trang trí.
 */

describe('nhãn hiển thị phủ đủ mọi giá trị', () => {
  /**
   * Cách hỏng bị bắt: ai đó thêm một chủ đề vào `PROBLEM_TOPICS` mà quên thêm
   * nhãn. TypeScript CÓ bắt được chuyện này nhờ `Record<ProblemTopic, string>`
   * — nhưng chỉ khi người ta chạy typecheck, và chỉ khi cả hai hằng nằm cùng
   * file. Test này giữ ràng buộc đó lại kể cả khi bảng nhãn bị tách sang chỗ
   * khác sau này, và nó cũng bắt được thứ typecheck không bắt: nhãn là chuỗi
   * RỖNG. Một nhãn rỗng lọt qua kiểu `string` trót lọt rồi hiện ra bộ lọc thành
   * một ô trống không ai bấm được.
   */
  it('mọi chủ đề đều có nhãn không rỗng', () => {
    for (const topic of PROBLEM_TOPICS) {
      expect(PROBLEM_TOPIC_LABELS[topic]?.trim()).toBeTruthy();
    }
  });

  it('bảng nhãn chủ đề không có khoá thừa', () => {
    // Chiều ngược lại: một chủ đề bị xoá khỏi danh sách nhưng nhãn còn ở lại là
    // mã chết, và mã chết trong bảng tra thì không bao giờ đỏ ở đâu cả.
    expect(Object.keys(PROBLEM_TOPIC_LABELS).sort()).toEqual([...PROBLEM_TOPICS].sort());
  });

  it('mọi bậc độ khó đều có nhãn không rỗng', () => {
    for (const level of PROBLEM_DIFFICULTIES) {
      expect(PROBLEM_DIFFICULTY_LABELS[level]?.trim()).toBeTruthy();
    }
  });

  it('bảng nhãn độ khó không có khoá thừa', () => {
    expect(Object.keys(PROBLEM_DIFFICULTY_LABELS).sort()).toEqual([...PROBLEM_DIFFICULTIES].sort());
  });
});

describe('mã bài', () => {
  it('nhận mã đúng dạng', () => {
    expect(isProblemCode('K8S-0001')).toBe(true);
    expect(isProblemCode('K8S-9999')).toBe(true);
  });

  it('từ chối mã sai dạng', () => {
    // Thiếu số 0 đệm — đây là ca quan trọng nhất, vì nó là thứ phá vỡ lời hứa
    // "độ dài cố định nên sắp xếp bằng so sánh chuỗi là đúng". Trộn `K8S-42`
    // vào tập mã sẽ làm `ORDER BY code` xếp nó sau `K8S-0100`.
    expect(isProblemCode('K8S-42')).toBe(false);
    expect(isProblemCode('K8S-00042')).toBe(false);
    expect(isProblemCode('k8s-0042')).toBe(false);
    expect(isProblemCode('LAB-0042')).toBe(false);
    expect(isProblemCode('K8S-0042 ')).toBe(false);
    expect(isProblemCode('')).toBe(false);
  });

  it('không neo lỏng ở hai đầu', () => {
    // Một biểu thức thiếu neo `^` hoặc `$` vẫn cho mọi test trên đi qua, rồi
    // nhận cả chuỗi rác có chứa mã hợp lệ bên trong.
    expect(isProblemCode('xxK8S-0042')).toBe(false);
    expect(isProblemCode('K8S-0042xx')).toBe(false);
  });

  it('không giữ trạng thái giữa các lần gọi', () => {
    // Nếu ai đó thêm cờ `g` vào biểu thức, `test()` sẽ nhớ `lastIndex` và cùng
    // một mã sẽ lúc đúng lúc sai theo thứ tự gọi. Lỗi này im lặng và cực khó
    // lần ra khi nó xảy ra trong một vòng lặp duyệt danh sách bài.
    expect(PROBLEM_CODE_PATTERN.global).toBe(false);
    expect(isProblemCode('K8S-0042')).toBe(true);
    expect(isProblemCode('K8S-0042')).toBe(true);
  });
});

describe('khoá sắp xếp', () => {
  /**
   * Cách hỏng bị bắt: ai đó thêm `'title'` vào `PROBLEM_ORDER_KEYS` vì nó
   * "hiển nhiên phải có".
   *
   * Postgres và JavaScript không cùng thứ tự với tiếng Việt có dấu, nên sắp xếp
   * theo tên cho ra một thứ tự ở tầng cơ sở dữ liệu và một thứ tự khác khi tầng
   * web sắp lại. Với phân trang keyset thì lệch thứ tự nghĩa là MẤT DÒNG, và
   * mất trong im lặng — không có lỗi nào, chỉ là vài bài không bao giờ xuất
   * hiện. `packages/scenario` đã trả giá cho đúng chuyện này và cũng cấm
   * `title` trong khoá sắp xếp của nó.
   *
   * Test này không cấm vĩnh viễn. Nó buộc người muốn thêm phải đọc lý do và
   * xử lý collation trước, thay vì thêm một dòng rồi đi tiếp.
   */
  it('không cho sắp xếp theo tên bài', () => {
    expect(PROBLEM_ORDER_KEYS).not.toContain('title');
  });

  it('có khoá mã bài để làm mốc tie-break', () => {
    // Mọi khoá khác đều không duy nhất theo từng dòng, nên keyset bắt buộc phải
    // tie-break bằng `code`. Nếu `code` biến mất khỏi danh sách thì không còn
    // mốc nào duy nhất, và con trỏ sẽ nhảy cóc qua các bài trùng giá trị khoá.
    expect(PROBLEM_ORDER_KEYS).toContain('code');
  });
});

describe('tập giá trị đóng', () => {
  it('không có giá trị trùng lặp', () => {
    // Một giá trị lặp lại sẽ nhân đôi ô trong bộ lọc và làm mệnh đề IN của truy
    // vấn dài ra vô ích. Rất dễ xảy ra khi thêm mục bằng cách chép dòng.
    for (const list of [PROBLEM_TOPICS, PROBLEM_DIFFICULTIES, PROBLEM_STATES, PROBLEM_ORDER_KEYS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('độ khó xếp từ dễ tới khó', () => {
    // Thứ tự trong mảng KHÔNG chỉ là thứ tự hiển thị: nó là thứ tự dùng khi sắp
    // xếp theo độ khó. Xáo trộn mảng này sẽ làm cột "độ khó" sắp sai mà không
    // có gì báo, vì mọi giá trị vẫn hợp lệ.
    expect(PROBLEM_DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'expert']);
  });
});
