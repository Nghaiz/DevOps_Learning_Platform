import { describe, expect, it } from 'vitest';
import { appRouter } from '../../server/trpc/routers/app-router';
import { NO_FILTER, buildCatalogListInput, hasActiveFilter } from './catalog-input';

/**
 * Bộ test này khẳng định một điều DUY NHẤT nhưng là điều hay hỏng nhất ở lane
 * này: **input client dựng ra có được schema THẬT của server chấp nhận không.**
 *
 * Nó lấy chính đối tượng Zod đang chạy trong router (`_def.inputs[0]`) chứ
 * không chép lại hình dạng — một bản chép sẽ xanh mãi mãi kể cả sau khi server
 * đổi schema, tức đúng loại "green that proves nothing".
 *
 * ⚠ Không cần DB: `safeParse` chỉ chạm tầng Zod, không gọi resolver.
 */

type ZodLike = { safeParse: (value: unknown) => { success: boolean; data?: unknown } };

function inputSchemaOf(path: string): ZodLike {
  const procedures = (appRouter as unknown as { _def: { procedures: Record<string, { _def: { inputs: unknown[] } }> } })
    ._def.procedures;
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

const FILTERABLE = ['lessons.list', 'labs.list', 'playgrounds.list'] as const;
const CURSOR_ONLY = ['paths.list', 'quiz.list'] as const;

describe('buildCatalogListInput — hình dạng gửi lên khớp schema server', () => {
  it.each(FILTERABLE)('%s chấp nhận bộ lọc difficulty + tier do client dựng', (path) => {
    const parsed = inputSchemaOf(path).safeParse(
      buildCatalogListInput({ difficulty: 'intermediate', tier: 'gvisor' }, 'lesson-cuoi-trang'),
    );

    expect(parsed.success).toBe(true);
    // Không chỉ "được nhận" — phải NGUYÊN VẸN sau khi parse. Một `.strip()` vô
    // tình ở server sẽ vẫn cho `success: true` trong khi bộ lọc bốc hơi.
    expect(parsed.data).toMatchObject({
      difficulty: 'intermediate',
      tier: 'gvisor',
      cursor: 'lesson-cuoi-trang',
    });
  });

  it.each(FILTERABLE)('%s: không lọc ⇒ key VẮNG MẶT, không phải chuỗi "all"', (path) => {
    const input = buildCatalogListInput(NO_FILTER, undefined);

    expect(Object.keys(input)).toEqual([]);
    expect(inputSchemaOf(path).safeParse(input).success).toBe(true);
  });

  it.each(FILTERABLE)('%s: đối chứng âm — gửi sentinel "all" nguyên văn thì server TỪ CHỐI', (path) => {
    // Đây là phép đo chứng minh khẳng định trên có thể ĐỎ: nếu `'all'` lọt qua
    // được thì bài kiểm "key vắng mặt" ở trên không chứng minh điều gì cả.
    expect(inputSchemaOf(path).safeParse({ difficulty: 'all' }).success).toBe(false);
  });

  it.each([...FILTERABLE, ...CURSOR_ONLY])('%s: `direction` bị TỪ CHỐI — bẫy useInfiniteQuery', (path) => {
    // Bẫy đo được ngày 2026-08-13: `useInfiniteQuery` nhét `direction` vào input
    // và trang trắng với 400 `unrecognized_keys`, trong khi e2e mức API xanh
    // 14/14. Giữ phép đo này để lần sau ai đó "sửa" bằng cách nới schema thì
    // thấy ngay đây là cổng, không phải tai nạn.
    expect(inputSchemaOf(path).safeParse({ direction: 'forward' }).success).toBe(false);
    // …và input client dựng thì KHÔNG BAO GIỜ mang key đó.
    expect(buildCatalogListInput({ difficulty: 'beginner', tier: 'sysbox' }, 'x')).not.toHaveProperty('direction');
  });

  it.each(CURSOR_ONLY)('%s chỉ nhận cursor — bộ lọc gửi lên bị từ chối, nên UI không được hiện', (path) => {
    // `/paths` và `/quiz` KHÔNG có ô lọc độ khó/tier. Đây là lý do, dưới dạng
    // thi hành được: schema của chúng từ chối field đó.
    expect(inputSchemaOf(path).safeParse({ difficulty: 'beginner' }).success).toBe(false);
    expect(inputSchemaOf(path).safeParse(buildCatalogListInput(NO_FILTER, 'cursor-x')).success).toBe(true);
  });
});

describe('hasActiveFilter', () => {
  it('không lọc ⇒ false', () => {
    expect(hasActiveFilter(NO_FILTER)).toBe(false);
  });

  it('một trong hai điều kiện bật ⇒ true', () => {
    expect(hasActiveFilter({ difficulty: 'beginner', tier: 'all' })).toBe(true);
    expect(hasActiveFilter({ difficulty: 'all', tier: 'kata' })).toBe(true);
  });
});
