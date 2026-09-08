/**
 * Gác hình dạng của 10 bài seed.
 *
 * ⛔ Nó KHÔNG lặp lại `problem.test.ts` (của lead, kiểm hợp đồng và hàm thuần).
 * Chỗ này kiểm DỮ LIỆU: mười bài cụ thể có tuân đúng những trần mà hợp đồng đặt
 * ra hay không. Hai thứ hỏng theo hai cách khác nhau — một cái hỏng khi ai đó
 * sửa kiểu, cái kia hỏng khi ai đó sửa nội dung.
 *
 * Đặc biệt: trần 150 từ của `statement` là phản ứng trực tiếp với lời chê rằng
 * level quá dài dòng. Một trần chỉ nằm trong bình luận thì lần thêm bài thứ 11
 * sẽ không ai nhớ, nên nó phải là một phép kiểm.
 */

import { describe, expect, it } from 'vitest';
import { PREDICATE_NAMES } from '../predicate-names.ts';
import {
  PROBLEM_CODE_PATTERN,
  PROBLEM_DIFFICULTIES,
  PROBLEM_STATES,
  PROBLEM_TOPICS,
} from '../problem.ts';
import { PROBLEMS_SEED } from './index.ts';

const TEN_VI_TU = new Set<string>(PREDICATE_NAMES);
const TAP_CHU_DE = new Set<string>(PROBLEM_TOPICS);
const TAP_BAC = new Set<string>(PROBLEM_DIFFICULTIES);
const TAP_TRANG_THAI = new Set<string>(PROBLEM_STATES);

/** Đếm từ theo khoảng trắng — cùng cách một người soạn nội dung tự đếm. */
function demTu(s: string): number {
  return s.trim().split(/\s+/u).filter(Boolean).length;
}

describe('PROBLEMS_SEED — định danh', () => {
  it('có đúng 10 bài, chuyển hết từ 10 challenge cũ', () => {
    expect(PROBLEMS_SEED.length).toBe(10);
  });

  it('mã theo khuôn K8S-NNNN và duy nhất', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(PROBLEM_CODE_PATTERN.test(bai.code), bai.code).toBe(true);
    }
    const ma = PROBLEMS_SEED.map((b) => b.code);
    expect(new Set(ma).size).toBe(ma.length);
  });

  it('mã chạy liên tục K8S-0001..K8S-0010, không nhảy cóc', () => {
    const so = PROBLEMS_SEED.map((b) => Number(b.code.slice(4))).sort((a, b) => a - b);
    expect(so).toEqual(PROBLEMS_SEED.map((_, i) => i + 1));
  });

  it('slug không dấu, không rỗng, và duy nhất', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(bai.slug, bai.code).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
    const slug = PROBLEMS_SEED.map((b) => b.slug);
    expect(new Set(slug).size).toBe(slug.length);
  });
});

describe('PROBLEMS_SEED — đề bài', () => {
  it('đề không rỗng và không quá 150 từ', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(bai.statement.trim().length, bai.code).toBeGreaterThan(0);
      expect(demTu(bai.statement), bai.code).toBeLessThanOrEqual(150);
    }
  });

  it('tiêu đề không rỗng', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(bai.title.trim().length, bai.code).toBeGreaterThan(0);
    }
  });
});

describe('PROBLEMS_SEED — phân loại', () => {
  it('bậc khó nằm trong bốn bậc của hệ OJ', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(TAP_BAC.has(bai.difficulty), bai.code).toBe(true);
    }
  });

  /**
   * Bạn đồng hành của việc đổi thang: nếu ai đó ánh xạ máy móc ba bậc cũ sang
   * bốn bậc mới thì cả mười bài sẽ dồn vào đúng hai giá trị. Ba giá trị trở lên
   * là bằng chứng rằng có người đã ĐỌC từng bài rồi mới quyết.
   */
  it('không phải một phép ánh xạ máy móc: dùng ít nhất ba bậc khác nhau', () => {
    expect(new Set(PROBLEMS_SEED.map((b) => b.difficulty)).size).toBeGreaterThanOrEqual(3);
  });

  it('mỗi bài có 1 tới 3 chủ đề, đều nằm trong tập đóng', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(bai.topics.length, bai.code).toBeGreaterThanOrEqual(1);
      expect(bai.topics.length, bai.code).toBeLessThanOrEqual(3);
      expect(new Set(bai.topics).size, bai.code).toBe(bai.topics.length);
      for (const cd of bai.topics) expect(TAP_CHU_DE.has(cd), `${bai.code} › ${cd}`).toBe(true);
    }
  });

  it('tag đã chuẩn hoá thường + gạch nối', () => {
    for (const bai of PROBLEMS_SEED) {
      for (const tag of bai.tags) {
        expect(tag, `${bai.code} › ${tag}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      }
      expect(new Set(bai.tags).size, bai.code).toBe(bai.tags.length);
    }
  });

  it('trạng thái hợp lệ và bài seed không có tác giả là tài khoản', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(TAP_TRANG_THAI.has(bai.state), bai.code).toBe(true);
      expect(bai.authorId, bai.code).toBeNull();
    }
  });
});

describe('PROBLEMS_SEED — mục tiêu và gợi ý', () => {
  it('mọi check đều nằm trong PREDICATE_NAMES', () => {
    for (const bai of PROBLEMS_SEED) {
      for (const muc of bai.objectives) {
        expect(TEN_VI_TU.has(muc.check), `${bai.code} › ${muc.id} › ${muc.check}`).toBe(true);
      }
    }
  });

  it('mỗi bài có ít nhất một mục tiêu bắt buộc, id mục tiêu duy nhất', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(bai.objectives.filter((m) => m.required).length, bai.code).toBeGreaterThanOrEqual(1);
      const ids = bai.objectives.map((m) => m.id);
      expect(new Set(ids).size, bai.code).toBe(ids.length);
    }
  });

  /**
   * Challenge cũ KHÔNG có gợi ý — đó là nửa "thử" của cặp dạy/thử. Hệ OJ thì
   * khác: gợi ý tồn tại nhưng CÓ GIÁ. Nên phép kiểm ở đây không chỉ đòi có gợi
   * ý, nó đòi giá tăng dần: một gợi ý càng gần lời giải thì càng phải đắt, và
   * ba gợi ý cùng giá nghĩa là chưa ai nghĩ về phần đánh đổi.
   */
  it('gợi ý có id duy nhất, nội dung không rỗng, và giá tăng dần', () => {
    for (const bai of PROBLEMS_SEED) {
      expect(bai.hints.length, bai.code).toBeGreaterThanOrEqual(2);
      const ids = bai.hints.map((g) => g.id);
      expect(new Set(ids).size, bai.code).toBe(ids.length);
      let truoc = -1;
      for (const goi of bai.hints) {
        expect(goi.text.trim().length, `${bai.code} › ${goi.id}`).toBeGreaterThan(0);
        expect(goi.penaltyPoints, `${bai.code} › ${goi.id}`).toBeGreaterThan(truoc);
        truoc = goi.penaltyPoints;
      }
    }
  });
});

describe('PROBLEMS_SEED — trạng thái ban đầu chép từ challenge', () => {
  it('sự cố chỉ gieo lên tài nguyên nằm trong namespace đã khai', () => {
    for (const bai of PROBLEMS_SEED) {
      const ns = new Set(bai.initialState.namespaces);
      for (const tai of bai.initialState.resources) {
        if (tai.namespace === '') continue;
        expect(ns.has(tai.namespace), `${bai.code} › ${tai.kind}/${tai.name}`).toBe(true);
      }
    }
  });

  it('giới hạn thời gian giữ nguyên từ challenge: khác nhau, không phải hằng số chung', () => {
    const rieng = new Set(PROBLEMS_SEED.map((b) => b.timeLimitSec));
    expect(rieng.size).toBeGreaterThanOrEqual(3);
    for (const bai of PROBLEMS_SEED) {
      expect(bai.timeLimitSec, bai.code).not.toBeNull();
    }
  });
});
