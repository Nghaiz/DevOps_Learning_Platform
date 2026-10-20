import { cache } from 'react';
import { count, eq } from 'drizzle-orm';
import type { ContentSource } from '@devops-platform/scenario';
import { publishedContentSource } from '../../server/content/source';
import { getDb } from '../../server/db/client';
import { quizzes } from '../../server/db/schema';

/**
 * Đếm nội dung ĐÃ XUẤT BẢN cho dải "Trong nền tảng có gì" ở trang chủ.
 *
 * ## Số thật, hoặc không có số
 *
 * Không có hằng số nào ở đây. `lessons`/`labs`/`playgrounds` đọc qua đúng
 * `publishedContentSource()` mà `/lessons`, `/labs`, `/playgrounds` dùng — hợp
 * của nội dung trên đĩa (`content/`) và nội dung DB ở trạng thái `published`.
 * `quizzes` đếm thẳng `quizzes.state = 'published'`, cùng điều kiện
 * `listPublishedQuizzesPage` lọc.
 *
 * ## Vì sao mỗi loại được bắt lỗi RIÊNG
 *
 * Trang chủ là một trong hai màn hình người lạ thấy đầu tiên và nó CÔNG KHAI —
 * một lượt đọc DB hỏng không được phép biến nó thành 500. Nhưng "đừng ném" ≠
 * "nuốt im": mỗi thất bại ghi `console.error` kèm tên loại, rồi trả `null`, và
 * `null` được vẽ ra màn hình thành "chưa đọc được" chứ KHÔNG thành số 0. Số 0
 * là một khẳng định ("nền tảng không có quiz nào"); `null` là sự thật ("lượt
 * đọc này hỏng").
 *
 * Bắt lỗi theo từng loại chứ không một `try` bọc tất cả: nội dung trên đĩa và
 * nội dung DB hỏng độc lập với nhau — cùng kỷ luật `filesystemScenarioSource`
 * đã chọn khi tách ba cache. Postgres chết thì quiz mất số, ba loại kia vẫn
 * còn phần trên đĩa.
 *
 * ## `cache()` — gộp trong MỘT request, không phải bộ đệm giữa các request
 *
 * `cache()` của React chỉ khử trùng lặp trong phạm vi một lượt render. Trang
 * chủ hiện là dynamic (root layout gọi `headers()`), nên mỗi lượt mở trang vẫn
 * là một lượt đọc. Chấp nhận được ở quy mô hiện tại và đúng ý "số phải thật";
 * nếu lượng truy cập vô danh tăng thì chỗ cần vá là thêm một tầng
 * `unstable_cache`/`revalidate` quanh chính hàm này — đã ghi vào report.
 */
export type CatalogKind = 'lessons' | 'labs' | 'playgrounds' | 'quizzes';

/** `null` = lượt đọc hỏng. KHÔNG BAO GIỜ dùng `0` để thay cho "chưa biết". */
export type CatalogCounts = Readonly<Record<CatalogKind, number | null>>;

async function counted(kind: CatalogKind, read: () => Promise<number>): Promise<number | null> {
  try {
    return await read();
  } catch (error: unknown) {
    console.error(`[home] catalog count read failed for ${kind}`, error);
    return null;
  }
}

/**
 * `publishedContentSource()` tự nó ném được — nó gọi `scenariosDir()` (biến môi
 * trường thiếu) và `getDb()` (URL hỏng) ngay lúc dựng, TRƯỚC khi có promise nào
 * để `counted` bắt. Dựng một lần ở đây và trả `null` khi hỏng.
 */
function contentSourceOrNull(): ContentSource | null {
  try {
    return publishedContentSource();
  } catch (error: unknown) {
    console.error('[home] content source unavailable', error);
    return null;
  }
}

async function publishedQuizCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(quizzes)
    .where(eq(quizzes.state, 'published'));
  return row?.n ?? 0;
}

export const readCatalogCounts = cache(async (): Promise<CatalogCounts> => {
  const source = contentSourceOrNull();
  const unavailable = async (): Promise<number> => {
    throw new Error('content source unavailable');
  };

  const [lessons, labs, playgrounds, quizCount] = await Promise.all([
    counted('lessons', source === null ? unavailable : async () => (await source.list()).length),
    counted('labs', source === null ? unavailable : async () => (await source.listLabs()).length),
    counted(
      'playgrounds',
      source === null ? unavailable : async () => (await source.listPlaygrounds()).length,
    ),
    counted('quizzes', publishedQuizCount),
  ]);

  return { lessons, labs, playgrounds, quizzes: quizCount };
});
