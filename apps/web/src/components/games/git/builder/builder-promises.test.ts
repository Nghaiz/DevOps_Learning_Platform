/**
 * Ô gác cho hai LỜI HỨA VỀ CHỮ của màn Builder, thứ mà plan gọi tên thẳng.
 *
 * ## Vì sao hai thứ này cần ô gác, mà "nút bấm có chạy không" thì không
 *
 * Nút bấm hỏng thì lộ ra ngay lượt thử đầu tiên. Một câu giải thích bị xoá khỏi
 * giao diện thì KHÔNG lộ ra: mọi thứ vẫn chạy, mọi test vẫn xanh, và thứ duy
 * nhất mất đi là người soạn không còn biết phép kiểm họ vừa bấm chứng minh được
 * cái gì. Đó là đúng lớp lỗi mà `rules/green-that-proves-nothing.md` mô tả, và
 * nó chỉ bắt được bằng một ô đọc thẳng file nguồn.
 *
 *  1. **E.7 phải nói đúng phạm vi của nó.** `checkSolvable` chứng minh "lời giải
 *     mẫu có đạt hết mục tiêu không", KHÔNG chứng minh "level này có giải được
 *     không". `phase-18-exec.md` §1.2 dặn câu đó phải ở TRÊN MÀN.
 *  2. **Giới hạn của Builder hiện trên màn, không giấu trong tài liệu**
 *     (`phase-18.md` §18.E, nguyên văn). Và danh sách phải đọc từ
 *     `BUILDER_CANNOT_EXPRESS` chứ không phải một mảng chép tay — một bản sao là
 *     một bản sao sẽ lệch, và lúc lệch thì câu trên màn hứa sai.
 *
 * ## Vì sao ô này TĨNH chứ không render component
 *
 * Cùng lý lẽ với `objective-source.test.ts` ngay cạnh: thứ cần gác là **nguồn
 * chữ** mà component đọc, không phải một hàm thuần. Render rồi tìm chuỗi sẽ xanh
 * cả khi chuỗi tới từ một hằng chép tay, tức xanh ở đúng trường hợp sai.
 *
 * ## Phép đối chứng dương đã chạy
 *
 * 2026-09-15: đổi `t(LIMIT_TEXT[limit])` thành một chuỗi cứng ⇒ ô "đọc danh sách
 * giới hạn từ BUILDER_CANNOT_EXPRESS" ĐỎ. Xoá dòng `check.scope` ⇒ ô "câu phạm vi
 * của E.7" ĐỎ. Khôi phục ⇒ cả hai xanh lại.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { BUILDER_CANNOT_EXPRESS } from '@devops-platform/games';
import { t } from '@devops-platform/copy';

import { ISSUE_TEXT, LIMIT_TEXT } from './builder-copy';

const BUILDER = join(import.meta.dirname, 'git-builder.tsx');

describe('Builder giữ hai lời hứa về chữ', () => {
  const source = readFileSync(BUILDER, 'utf8');

  it('câu phạm vi của E.7 nằm trên màn, không nằm trong tài liệu', () => {
    expect(source).toMatch(/t\('author\.builder\.check\.scope'\)/);
  });

  it('câu phạm vi thật sự nói ra giới hạn, không chỉ có mặt', () => {
    /*
     * Một khoá có mặt mà nội dung rỗng nghĩa thì ô trên là ô gác một cái vỏ.
     * Đòi đúng hai ý mà `phase-18-exec.md` §1.2 bắt phải nói: phép này KHÔNG trả
     * lời câu "có giải được không", và lý do là không gian lệnh vô hạn.
     */
    const scope = t('author.builder.check.scope');
    expect(scope).toMatch(/KHÔNG trả lời/);
    expect(scope).toMatch(/vô hạn/);
  });

  it('đọc danh sách giới hạn từ BUILDER_CANNOT_EXPRESS, không từ mảng chép tay', () => {
    expect(source).toMatch(/BUILDER_CANNOT_EXPRESS\.map\(/);
    expect(source).toMatch(/t\(LIMIT_TEXT\[limit\]\)/);
  });

  it('mọi phần tử của BUILDER_CANNOT_EXPRESS có câu tương ứng', () => {
    // `satisfies Record<BuilderLimit, TextKey>` đã gác ở tầng kiểu; ô này gác vế
    // mà kiểu không thấy được: câu tra ra phải là chữ thật, không phải rỗng.
    for (const limit of BUILDER_CANNOT_EXPRESS) {
      expect(t(LIMIT_TEXT[limit]).length).toBeGreaterThan(40);
    }
  });

  it('mọi mã lỗi bản nháp tra ra một câu khác rỗng', () => {
    for (const key of Object.values(ISSUE_TEXT)) {
      expect(t(key).trim()).not.toBe('');
    }
  });
});
