import { describe, expect, it } from 'vitest';
import { appRouter } from '../server/trpc/routers/app-router';

/**
 * Bề mặt input của các procedure danh mục: **nhận đúng những gì đáp ứng được,
 * từ chối phần còn lại.**
 *
 * Luật đứng sau bộ này, viết ra một lần cho cả năm procedure: *một tham số
 * server NHẬN rồi PHỚT LỜ là một lời nói dối trong API.* Nó không sinh lỗi nào
 * — client gửi `difficulty=advanced`, nhận lại 200 kèm nguyên danh sách cũ, và
 * kết luận là bộ lọc hỏng chứ không phải không áp dụng được. `.strict()` biến
 * nó thành `400 unrecognized_keys` ngay ở lần gọi đầu tiên, đúng cách
 * `noCursorListInputSchema` đã chọn cho `cursor`.
 *
 * Bộ này đọc **chính đối tượng Zod đang chạy trong router** (`_def.inputs[0]`),
 * không chép lại hình dạng: một bản chép sẽ xanh mãi mãi kể cả sau khi server
 * đổi schema. Không cần DB — `safeParse` chỉ chạm tầng Zod.
 */

type ZodLike = { safeParse: (value: unknown) => { success: boolean; data?: unknown } };

function inputSchemaOf(path: string): ZodLike {
  const procedures = (
    appRouter as unknown as {
      _def: { procedures: Record<string, { _def: { inputs: unknown[] } }> };
    }
  )._def.procedures;
  const procedure = procedures[path];
  if (procedure === undefined) {
    throw new Error(`Không có procedure ${path} — router đã đổi tên, sửa test theo router.`);
  }
  const [schema] = procedure._def.inputs;
  if (schema === undefined || typeof (schema as ZodLike).safeParse !== 'function') {
    throw new Error(`${path} không khai input schema — client đang gửi mù.`);
  }
  return schema as ZodLike;
}

const accepts = (path: string, input: unknown): boolean =>
  inputSchemaOf(path).safeParse(input).success;

/** Ba trang có độ khó thật (`ScenarioSummary`/`LabSummary` đều khai field đó). */
const WITH_DIFFICULTY = ['lessons.list', 'labs.list'] as const;
/** Mọi trang danh mục đi qua nguồn nội dung — cả ba loại đều có `capabilities`. */
const CONTENT_LISTS = ['lessons.list', 'labs.list', 'playgrounds.list'] as const;

describe('lọc capability — mở ở MỌI loại nội dung, vì cả ba đều có field đó', () => {
  it.each(CONTENT_LISTS)('%s nhận capability hợp lệ', (path) => {
    expect(accepts(path, { capability: 'docker' })).toBe(true);
    expect(accepts(path, { capability: 'kubernetes' })).toBe(true);
  });

  it.each(CONTENT_LISTS)('%s TỪ CHỐI capability lạ (đối chứng: enum thật, không phải string trần)', (path) => {
    expect(accepts(path, { capability: 'docker-compose' })).toBe(false);
    expect(accepts(path, { capability: 'all' })).toBe(false);
  });
});

describe('sắp xếp phía server — chỉ những thứ tự keyset giữ được', () => {
  it.each(WITH_DIFFICULTY)('%s nhận orderBy id | difficulty | duration', (path) => {
    for (const orderBy of ['id', 'difficulty', 'duration']) {
      expect(accepts(path, { orderBy })).toBe(true);
    }
  });

  it.each(WITH_DIFFICULTY)('%s TỪ CHỐI orderBy=title — đây là ô AC, không phải việc chưa làm', (path) => {
    /**
     * Đo 2026-09-06 trên Postgres của repo (`datcollate = en_US.utf8`): PG và
     * `localeCompare('vi')` cho HAI thứ tự khác nhau trên tiêu đề tiếng Việt —
     * PG đẩy mọi tiêu đề có dấu xuống SAU chữ Z. Một keyset theo `title` vì thế
     * không thể vừa đúng bảng chữ vừa không mất dòng ở ranh giới đĩa/DB. Sắp
     * theo tiêu đề ở lại phía client, TRONG TRANG, với nhãn nói đúng phạm vi.
     *
     * Câu này đỏ khi ai đó "thêm cho đủ" — và đó là lúc cần đọc lại chú thích ở
     * `CONTENT_ORDER_KEYS`, không phải lúc sửa test.
     */
    expect(accepts(path, { orderBy: 'title' })).toBe(false);
    expect(accepts(path, { orderBy: 'estimatedMinutes' })).toBe(false);
  });

  it('playgrounds.list KHÔNG nhận orderBy — nó không có độ khó lẫn thời lượng để sắp', () => {
    expect(accepts('playgrounds.list', { orderBy: 'difficulty' })).toBe(false);
    expect(accepts('playgrounds.list', { orderBy: 'duration' })).toBe(false);
    // Kể cả `'id'`: thứ tự đó đã là mặc định, một tham số để nói lại nó chỉ là
    // thêm một hình dạng input phải gác mà không mở thêm khả năng nào.
    expect(accepts('playgrounds.list', { orderBy: 'id' })).toBe(false);
  });
});

describe('playgrounds.list TỪ CHỐI difficulty (gỡ 2026-09-06)', () => {
  it('difficulty hợp lệ với lessons/labs nhưng bị TỪ CHỐI ở playgrounds', () => {
    // Đối chứng dương: cùng một giá trị, hai kết quả khác nhau. Nếu
    // `playgrounds.list` chỉ đơn giản từ chối MỌI thứ thì câu này không chứng
    // minh gì — nên vế `lessons/labs` phải xanh trong cùng một câu.
    for (const path of WITH_DIFFICULTY) {
      expect(accepts(path, { difficulty: 'advanced' })).toBe(true);
    }
    expect(accepts('playgrounds.list', { difficulty: 'advanced' })).toBe(false);
  });

  it('…nhưng vẫn nhận tier + capability + cursor — không phải "khoá cứng cả input"', () => {
    expect(accepts('playgrounds.list', { tier: 'gvisor' })).toBe(true);
    expect(accepts('playgrounds.list', { capability: 'docker', cursor: 'x-playground' })).toBe(true);
    expect(accepts('playgrounds.list', {})).toBe(true);
  });
});

describe('mọi input danh mục vẫn `.strict()` — không nới để nuốt rác client', () => {
  const ALL = [...CONTENT_LISTS, 'paths.list', 'quiz.list'] as const;

  it.each(ALL)('%s từ chối `direction` — bẫy useInfiniteQuery ngày 2026-08-13', (path) => {
    expect(accepts(path, { direction: 'forward' })).toBe(false);
  });

  it.each(ALL)('%s từ chối field bịa hoàn toàn', (path) => {
    expect(accepts(path, { khongTonTai: 1 })).toBe(false);
  });

  it.each(['paths.list', 'quiz.list'] as const)('%s vẫn KHÔNG có bộ lọc nội dung', (path) => {
    // Chúng không đi qua `ContentSource`; mở bộ lọc ở đây sẽ là nhận-rồi-bỏ-qua.
    expect(accepts(path, { capability: 'docker' })).toBe(false);
    expect(accepts(path, { orderBy: 'difficulty' })).toBe(false);
  });
});
