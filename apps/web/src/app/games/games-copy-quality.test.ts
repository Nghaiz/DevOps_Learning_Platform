import { describe, expect, it } from 'vitest';
import { scanDashes, scanStripped } from '@devops-platform/copy/scan';
import { GAMES, GAME_TOPIC_LABEL, GAME_META } from './games-catalog';

/**
 * ⛔ Cổng CHẤT LƯỢNG CHỮ cho `app/games` — bộ quét mang tới chỗ chữ đang ở.
 *
 * ## Vì sao `app/games` cần một cổng riêng, và vì sao nó vắng mặt lâu đến thế
 *
 * `GAMES[].title` và `GAMES[].description` là chuỗi VIẾT THẲNG, cố ý nằm ngoài
 * `packages/copy` (xem chú thích đầu `games-catalog.ts`). Quyết định đó hợp lệ,
 * nhưng nó đặt chúng ra ngoài tầm với của MỌI cổng chữ đang có:
 *
 * - `scanDashes`/`scanStripped` chạy trong `packages/copy/src/copy.contract.test.ts`,
 *   và chúng chỉ quét `MESSAGES` — tức đúng những chuỗi đã ở trong bản đồ.
 * - `packages/copy/src/ui-source-coverage.test.ts` liệt kê `components/author`,
 *   `app/author`, `components/catalog`, `app/quiz`, `app/(session)/problems`.
 *   **Không có `app/games`.**
 * - Sáu `copy-gate.test.ts` gác theo glob của từng lane; `app/metadata-copy-gate.test.ts`
 *   chỉ cắt thân `metadata`/`generateMetadata`. Không cái nào chạm `games-catalog.ts`.
 *
 * Hệ quả đo được, 2026-09-13: dòng mô tả của game `pipeline` mang một dấu gạch
 * ngang dài — **chữ hiển thị trên thẻ ở `/games`** — và không cổng nào thấy nó,
 * cũng sẽ không bao giờ thấy. Nó chỉ lộ ra khi rà lại một commit (`e7a19eb`,
 * `lane/p16d-copy-quiz`) chưa từng tới nhánh chính; commit đó có một cổng cùng
 * mục đích và đã sửa đúng dòng ấy. File này dựng lại cổng đó.
 *
 * ## Quét GIÁ TRỊ, không phân tích mã nguồn
 *
 * Cổng này `import` chính các hằng rồi quét giá trị thật, thay vì đọc file
 * `.ts` bằng regex. Một bộ đọc mã nguồn phải đoán đâu là chuỗi người dùng đọc
 * và đâu là chú thích — và nó sai im lặng theo cả hai chiều. Giá trị chạy thật
 * thì không có chỗ để đoán.
 *
 * Hệ quả: nhãn đi qua `t()` (`GAME_TOPIC_LABEL`, `GAME_META[].label`) cũng được
 * quét ở đây, dù `copy.contract.test.ts` đã quét chúng ở dạng khoá. Trùng lặp
 * đó là CỐ Ý và rẻ: nếu mai sau một nhãn rời khỏi bản đồ để thành chuỗi viết
 * thẳng, nó vẫn nằm trong tầm cổng này.
 */

/**
 * Những trường của `GameEntry` KHÔNG phải chữ người dùng đọc.
 *
 * ⚠ Danh sách này là vế NGƯỢC, và nó tồn tại vì vế xuôi không gác được gì.
 *
 * Bản đầu của bộ thu liệt kê tay các trường chữ (`title`, `description`). Thêm
 * một trường chữ mới vào `GameEntry` thì không ô nào đỏ — trường mới chỉ đơn
 * giản không được quét, im lặng. Một review độc lập bắt được (N10, 2026-09-13).
 *
 * Nay bộ thu quét MỌI giá trị chuỗi của mỗi mục và chỉ bỏ những khoá được khai
 * ở đây. Thêm một trường chữ mới ⇒ nó tự vào phạm vi quét. Thêm một trường
 * KHÔNG phải chữ (id, href, enum) mà quên khai ở đây ⇒ ô dưới đỏ và bắt người
 * thêm phải quyết định, thay vì để phép quét tự đoán.
 */
const NON_PROSE_FIELDS: ReadonlySet<string> = new Set(['id', 'href', 'difficulty', 'topics']);

/** Mọi chuỗi người dùng ĐỌC ĐƯỢC trên `/games`, kèm chỗ nó đến từ đâu. */
function userFacingStrings(): ReadonlyArray<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  for (const game of GAMES) {
    for (const [key, value] of Object.entries(game)) {
      if (NON_PROSE_FIELDS.has(key) || typeof value !== 'string') {
        continue;
      }
      out.push([`GAMES[${game.id}].${key}`, value]);
    }
  }
  for (const [topic, label] of Object.entries(GAME_TOPIC_LABEL)) {
    out.push([`GAME_TOPIC_LABEL.${topic}`, label]);
  }
  GAME_META.forEach((item, i) => {
    out.push([`GAME_META[${String(i)}].label`, item.label]);
  });
  return out;
}

describe('app/games — chất lượng chữ hiển thị', () => {
  const strings = userFacingStrings();

  /**
   * ⚠ Phép kiểm ĐẦU VÀO, không phải một mốc phải giữ.
   *
   * Nếu `GAMES` rỗng hoặc một trường đổi tên, hai ô dưới quét một tập rỗng và
   * XANH vĩnh viễn. Con số chỉ cần lớn hơn 0; nó không khoá số lượng game.
   */
  it('thu được chuỗi thật để quét (chống cổng chạy trên tập rỗng)', () => {
    expect(strings.length).toBeGreaterThan(0);
    expect(strings.every(([, value]) => value.length > 0)).toBe(true);
    expect(strings.filter(([where]) => where.startsWith('GAMES['))).not.toHaveLength(0);
  });

  /**
   * ⛔ Nửa chống-ôi của `NON_PROSE_FIELDS`.
   *
   * Một danh sách miễn trừ chỉ lớn dần thì thành nghĩa địa. Ô này đỏ khi một
   * khoá trong đó không còn tồn tại trên `GameEntry` — lúc ấy việc phải làm là
   * XOÁ dòng đó, không phải thêm một trường cho khớp sổ.
   */
  it('mỗi khoá trong NON_PROSE_FIELDS còn tồn tại thật trên GameEntry', () => {
    const first = GAMES[0];
    expect(first, 'GAMES rỗng — không có gì để đối chiếu').toBeDefined();
    const actual = new Set(Object.keys(first ?? {}));
    const stale = [...NON_PROSE_FIELDS].filter((k) => !actual.has(k));
    expect(stale, 'xoá các khoá này khỏi NON_PROSE_FIELDS, chúng không còn trên GameEntry').toEqual(
      [],
    );
  });

  it('không chuỗi nào mang gạch ngang dài hay dấu chấm giữa sai nhịp', () => {
    const offenders: string[] = [];
    for (const [where, value] of strings) {
      for (const v of scanDashes(value)) {
        offenders.push(`${where}: ${v.kind} tại vị trí ${String(v.index)} trong ${JSON.stringify(value)}`);
      }
    }
    expect(
      offenders,
      'Chữ trên thẻ game phải theo cùng luật với `packages/copy`. Gạch ngang dài ' +
        'là dấu hiệu văn máy sinh; dùng dấu hai chấm, dấu phẩy hoặc tách câu.',
    ).toEqual([]);
  });

  it('không chuỗi tiếng Việt nào bị lột dấu', () => {
    const offenders: string[] = [];
    for (const [where, value] of strings) {
      const result = scanStripped(value);
      if (result.flagged) {
        offenders.push(`${where}: token [${result.matched.join(', ')}] trong ${JSON.stringify(value)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ⛔ ĐỐI CHỨNG DƯƠNG cho cả hai bộ quét.
   *
   * Không có ô này thì một `scanDashes` gõ sai tên, hoặc một bộ thu trả về
   * chuỗi đã bị làm sạch, cũng làm hai ô trên xanh trên mọi đầu vào. Đây đúng
   * là hình dạng lỗi mà chính file này ra đời để chặn, nên nó không được phép
   * tự mắc phải.
   */
  it('đối chứng dương — hai bộ quét BẮT được chuỗi cố ý sai', () => {
    expect(scanDashes('Dựng pipeline — rồi sửa nó')).not.toHaveLength(0);
    expect(scanStripped('Dung pipeline roi sua no cho dung').flagged).toBe(true);

    // Và chúng KHÔNG báo động giả trên một chuỗi hợp lệ của chính trang này.
    const clean = GAMES[0]?.description ?? '';
    expect(scanDashes(clean)).toHaveLength(0);
    expect(scanStripped(clean).flagged).toBe(false);
  });
});
