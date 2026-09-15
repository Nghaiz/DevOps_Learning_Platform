/**
 * Ghim những bất biến của hợp đồng mà **kiểu không diễn đạt được**.
 *
 * Ba thứ ở đây không phải trang trí — mỗi cái gác một lỗi đã có tiền lệ trong
 * repo hoặc một lỗi mà kiểu TypeScript nhìn không thấy:
 *
 *   1. Một phần tử trùng trong một mảng `as const` là **vô hình ở tầng kiểu**:
 *      union vẫn đúng, `typeof X[number]` vẫn ra đúng tập, và không có gì đỏ.
 *      Nhưng bảng tra dựng bằng `map` từ mảng đó sẽ có ít mục hơn số phần tử, và
 *      vòng lặp nào đếm số loại sẽ đếm sai.
 *   2. `CD_STAGE_KINDS` và `STAGE_KINDS` là hai danh sách phải khớp nhau.
 *      `satisfies` đã gác chiều "CD ⊆ tất cả" lúc biên dịch; test này gác chiều
 *      còn lại — rằng nó là tập con THỰC SỰ và không rỗng, nên một lần chép
 *      nhầm cả danh sách sẽ đỏ.
 *   3. `DEFAULT_EVALUATION_PASSES` có lý do sư phạm (bài C09 cần đủ lượt để đọc
 *      một phân bố). Hạ nó xuống là một quyết định thiết kế, không phải một lần
 *      chỉnh hiệu năng — cổng này bắt người hạ nó phải sửa cả test và đọc lý do.
 *
 * ⚠ Cổng trung lập của 19.C.6 (grep `cicd/contract.ts` và `cicd/engine.ts` tìm
 * tên riêng của nhà cung cấp) **không đặt được ở đây**: nó phải đọc file từ đĩa,
 * mà package này cố ý không khai types node. Nó thuộc về một script repo-level
 * hoặc một package có quyền đọc đĩa.
 */
import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_OUTCOMES,
  CD_STAGE_KINDS,
  CICD_PREDICATE_NAMES,
  DEFAULT_EVALUATION_PASSES,
  EDITABLE_PARTS,
  FLAKE_NATURES,
  QUEUE_ORDER_KEYS,
  RELEASE_STRATEGIES,
  SECONDS_PER_TICK,
  STAGE_KINDS,
  STAGE_RUN_STATES,
} from './contract.ts';

const ALL_LISTS: readonly (readonly [string, readonly string[]])[] = [
  ['STAGE_KINDS', STAGE_KINDS],
  ['CD_STAGE_KINDS', CD_STAGE_KINDS],
  ['FLAKE_NATURES', FLAKE_NATURES],
  ['ATTEMPT_OUTCOMES', ATTEMPT_OUTCOMES],
  ['STAGE_RUN_STATES', STAGE_RUN_STATES],
  ['RELEASE_STRATEGIES', RELEASE_STRATEGIES],
  ['QUEUE_ORDER_KEYS', QUEUE_ORDER_KEYS],
  ['EDITABLE_PARTS', EDITABLE_PARTS],
  ['CICD_PREDICATE_NAMES', CICD_PREDICATE_NAMES],
];

describe('hợp đồng CI/CD — danh sách runtime', () => {
  it.each(ALL_LISTS)('%s không có phần tử trùng và không rỗng', (_name, list) => {
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
  });

  it('CD_STAGE_KINDS là tập con THỰC SỰ của STAGE_KINDS', () => {
    for (const kind of CD_STAGE_KINDS) {
      expect(STAGE_KINDS).toContain(kind);
    }
    // Thực sự: chương CI phải còn loại riêng của nó. Bằng nhau nghĩa là ai đó
    // vừa chép cả danh sách sang, và khi đó `CD_STAGE_KINDS` không còn lọc được gì.
    expect(CD_STAGE_KINDS.length).toBeLessThan(STAGE_KINDS.length);
  });
});

describe('hợp đồng CI/CD — định danh phải an toàn để sắp thứ tự', () => {
  // Thứ tự hàng đợi (§4 luật 2) sắp bằng so sánh mã đơn vị. Chuỗi ngoài ASCII
  // sắp khác nhau giữa các môi trường, và triệu chứng là "cùng seed, hai kết
  // quả" — không đỏ ở đâu cả, chỉ sai.
  const ASCII_SLUG = /^[a-z0-9-]+$/;

  it.each([
    ['STAGE_KINDS', STAGE_KINDS],
    ['EDITABLE_PARTS', EDITABLE_PARTS],
    ['STAGE_RUN_STATES', STAGE_RUN_STATES],
    ['RELEASE_STRATEGIES', RELEASE_STRATEGIES],
  ] as const)('%s chỉ dùng chữ thường ASCII và gạch nối', (_name, list) => {
    for (const value of list) {
      expect(value).toMatch(ASCII_SLUG);
    }
  });
});

describe('hợp đồng CI/CD — hằng có lý do, không phải số tròn', () => {
  it('chấm trên ít nhất 20 lượt mô phỏng', () => {
    // Một đường ống có flakeRate 0.05 ở ba bước xanh khoảng 86% số lượt. Dưới
    // 20 lượt thì bài C09 ("một lượt xanh không chứng minh gì") không nhìn thấy
    // được, và người chơi học đúng bài học sai: "chạy lại là hết".
    expect(DEFAULT_EVALUATION_PASSES).toBeGreaterThanOrEqual(20);
  });

  it('một tick là một số giây dương và nguyên', () => {
    expect(Number.isInteger(SECONDS_PER_TICK)).toBe(true);
    expect(SECONDS_PER_TICK).toBeGreaterThan(0);
  });

  it('thứ tự hàng đợi đóng được bằng khoá cuối cùng', () => {
    // Bốn khoá đầu KHÔNG phân biệt được hai thực thể của cùng một stage đã quạt
    // ra — chúng có y hệt commit, y hệt stage, y hệt readyTick. Khoá thứ năm
    // mới làm thứ tự thành TOÀN PHẦN. Xoá nó đi là mở lại một chỗ hoà, và chỗ
    // hoà trong một hàng đợi là một nguồn bất tất định.
    expect(QUEUE_ORDER_KEYS.at(-1)).toBe('fanOutIndex');
    expect(QUEUE_ORDER_KEYS).toHaveLength(5);
  });
});
