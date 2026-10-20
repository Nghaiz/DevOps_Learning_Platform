import { describe, expect, it } from 'vitest';
import {
  EMBEDDED_TOP_LEVEL,
  embeddedHeadingLevel,
  smallestHeadingLevel,
  type HeadingLevel,
} from './heading-level.ts';

/**
 * ⛔ Bộ này gác CHÍNH phép dời cấp, tách khỏi `content-view.test.tsx`.
 *
 * `content-view.test.tsx` render thật và khẳng định `role=heading level=N`, nên
 * nó chứng minh hành vi người dùng nhận được. Nhưng nó chỉ chạm vài hình dạng
 * tài liệu, và các ca biên của phép đọc markdown (rào mã, thụt đầu dòng, tài
 * liệu không có heading, `#` không kèm khoảng trắng) thì rẻ hơn nhiều khi kiểm
 * ở đây — và mỗi ca biên đọc sai đều làm CẢ tài liệu dời lệch một bậc, im lặng.
 */

describe('smallestHeadingLevel', () => {
  it('đọc cấp nhỏ nhất, không phải cấp của dòng đầu', () => {
    expect(smallestHeadingLevel('### Sâu\n\nvăn\n\n## Nông hơn')).toBe(2);
  });

  it('tài liệu không có heading nào ⇒ null', () => {
    expect(smallestHeadingLevel('Chỉ có văn xuôi.\n\nVà một đoạn nữa.')).toBeNull();
  });

  /**
   * ⚠ Ca này là ca đắt nhất nếu sai: bài học DevOps gần như bài nào cũng có khối
   * mã shell, và khối mã shell gần như luôn có dòng `# chú thích`.
   */
  it('bỏ qua `#` bên trong rào ``` và rào ~~~', () => {
    expect(smallestHeadingLevel('## Tiêu đề\n\n```sh\n# không phải heading\n```')).toBe(2);
    expect(smallestHeadingLevel('## Tiêu đề\n\n~~~sh\n# không phải heading\n~~~')).toBe(2);
  });

  it('rào ``` KHÔNG đóng bằng rào ~~~ (và ngược lại)', () => {
    // Rào ``` còn mở, nên `# vẫn trong mã` không được đếm.
    expect(smallestHeadingLevel('## A\n\n```\n~~~\n# vẫn trong mã\n```')).toBe(2);
  });

  it('`#` không kèm khoảng trắng KHÔNG phải heading (CommonMark)', () => {
    expect(smallestHeadingLevel('#hashtag chứ không phải tiêu đề\n\n## Thật')).toBe(2);
  });

  it('thụt tối đa 3 dấu cách vẫn là heading; 4 dấu cách là khối mã thụt lề', () => {
    expect(smallestHeadingLevel('   # Vẫn là heading')).toBe(1);
    expect(smallestHeadingLevel('    # Khối mã thụt lề\n\n## Thật')).toBe(2);
  });

  it('`#######` (7 dấu) không phải heading', () => {
    expect(smallestHeadingLevel('####### bảy dấu\n\n## Thật')).toBe(2);
  });
});

describe('embeddedHeadingLevel', () => {
  /** Bảng này là hợp đồng, đối chiếu thẳng với bảng trong chú thích của module. */
  const CASES: ReadonlyArray<readonly [string, string, HeadingLevel, HeadingLevel]> = [
    ['mở bằng #', '# A\n\n## B\n\n### C', 1, 2],
    ['mở bằng #', '# A\n\n## B\n\n### C', 2, 3],
    ['mở bằng #', '# A\n\n## B\n\n### C', 3, 4],
    ['mở bằng ##', '## A\n\n### B', 2, 2],
    ['mở bằng ##', '## A\n\n### B', 3, 3],
    ['mở bằng ###', '### A\n\n#### B', 3, 2],
    ['mở bằng ###', '### A\n\n#### B', 4, 3],
  ];

  for (const [shape, markdown, source, expected] of CASES) {
    it(`${shape}: h${String(source)} nguồn ⇒ h${String(expected)}`, () => {
      expect(embeddedHeadingLevel(markdown, source)).toBe(expected);
    });
  }

  it('không bao giờ ra cấp thấp hơn h2 — trang giữ h1', () => {
    for (let level = 1; level <= 6; level += 1) {
      expect(embeddedHeadingLevel('# A', level as HeadingLevel)).toBeGreaterThanOrEqual(
        EMBEDDED_TOP_LEVEL,
      );
    }
  });

  it('kẹp ở h6 — HTML không có h7', () => {
    // Mở bằng `#` ⇒ dời +1 ⇒ `######` lẽ ra thành 7.
    expect(embeddedHeadingLevel('# A\n\n###### F', 6)).toBe(6);
  });

  it('tài liệu không có heading ⇒ vẫn dời như thể mở bằng `#`', () => {
    expect(embeddedHeadingLevel('chỉ có văn xuôi', 1)).toBe(2);
  });
});
