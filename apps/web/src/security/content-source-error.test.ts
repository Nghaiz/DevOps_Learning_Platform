import { describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { TRPCError } from '@trpc/server';
import { ContentSourcesUnavailableError, InvalidCursorError } from '@devops-platform/scenario';
import { DrizzleQueryError } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, type TRPCContext } from '../server/trpc/init';
import { rethrowContentSourceError } from '../server/content/source-errors';
import type { Database } from '../server/db/client';

/**
 * Lỗi nguồn nội dung — đo qua CẢ HAI biên cùng lúc: router dịch mã, rồi
 * `errorFormatter` quyết định câu nào ra tới client. Đi qua
 * `fetchRequestHandler` vì `errorFormatter` KHÔNG chạy dưới `createCaller`
 * (xem `trpc-error-leak.test.ts` để biết vì sao).
 *
 * ⚠ MỘT Ô KHÔNG ĐƯỢC VIẾT Ở ĐÂY. Yêu cầu ban đầu là "khẳng định thông điệp
 * không chứa `select` / `ECONNREFUSED` / `5432`" khi
 * `ContentSourcesUnavailableError` xảy ra. Nhưng câu của lớp ấy
 * (`packages/scenario/src/errors.ts`) CỐ Ý đã sạch từ đầu — không SQL, không
 * đường dẫn, không `cause`. Một ô như vậy xanh cả TRƯỚC lẫn SAU bản vá, tức nó
 * không thể đỏ và không chứng minh gì (`green-that-proves-nothing`). Ô tương
 * đương có ý nghĩa là ca DƯỚI CÙNG: một lỗi hạ tầng THẬT (pg) đi qua đúng
 * đường đó — chuỗi bẩn có tồn tại, nên phép khẳng định "không chứa" mới đo
 * được một cái gì.
 */

const ctx: TRPCContext = {
  db: {} as Database,
  user: null,
  reqHeaders: new Headers(),
  resHeaders: new Headers(),
};

function throwing(cause: unknown) {
  return publicProcedure.query(() => {
    try {
      throw cause;
    } catch (e) {
      rethrowContentSourceError(e);
    }
  });
}

const router = createTRPCRouter({
  moiNguonHong: throwing(new ContentSourcesUnavailableError('listPage', 2, 2)),
  cursorHong: throwing(new InvalidCursorError('lesson-da-xoa')),
  hatangHong: throwing(
    new DrizzleQueryError(
      'select "id", "title" from "content_items" where "id" > $1 order by "id" limit $2',
      ['lesson-042', 20],
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.9:5432'), { code: 'ECONNREFUSED' }),
    ),
  ),
});

async function call(procedure: string): Promise<{ message: string; code: string; httpStatus: number }> {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(`http://localhost/api/trpc/${procedure}`),
    router,
    createContext: () => ctx,
  });
  const body = (await response.json()) as {
    error: { message: string; data: { code: string; httpStatus: number } };
  };
  return { message: body.error.message, code: body.error.data.code, httpStatus: body.error.data.httpStatus };
}

describe('lỗi nguồn nội dung → mã + câu tới client', () => {
  it('mọi nguồn hỏng ⇒ 503 SERVICE_UNAVAILABLE, KHÔNG phải 500', async () => {
    const { code, httpStatus } = await call('moiNguonHong');

    // 500 đọc ra như "ứng dụng có bug"; 503 nói đúng bản chất: hạ tầng, tạm thời.
    expect(code).toBe('SERVICE_UNAVAILABLE');
    expect(httpStatus).toBe(503);
  });

  it('câu 503 SỐNG SÓT qua errorFormatter — không bị thay bằng câu chung', async () => {
    const { message } = await call('moiNguonHong');

    // Ô này gác đúng cái bẫy đã ghi trong `source-errors.ts`: nếu ai đó "tiện
    // tay" chuyển tiếp `cause.message`, `isAuthored()` thấy hai chuỗi bằng nhau,
    // xếp nó là câu tầng dưới và THAY — câu hành-động-tiếp biến mất trong im
    // lặng, không test nào khác nhận ra.
    expect(message).toContain('tải lại trang');
    expect(message).not.toContain('Hệ thống gặp sự cố khi xử lý yêu cầu');
  });

  it('cursor hỏng vẫn là 400, không bị 503 nuốt mất', async () => {
    const { code, message } = await call('cursorHong');

    expect(code).toBe('BAD_REQUEST');
    expect(message).toBe('Cursor không còn hợp lệ');
  });

  it('lỗi hạ tầng THẬT đi cùng đường KHÔNG rò SQL/host/cổng ra client', async () => {
    const { message, code } = await call('hatangHong');

    // Ca này chuỗi bẩn CÓ THẬT (khác `ContentSourcesUnavailableError`), nên phép
    // khẳng định dưới đây đo được một cái gì — nó đỏ nếu chốt chặn S2 hỏng.
    expect(message).not.toContain('select');
    expect(message).not.toContain('content_items');
    expect(message).not.toContain('ECONNREFUSED');
    expect(message).not.toContain('5432');
    expect(message).not.toContain('10.0.0.9');
    expect(code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('lỗi lạ KHÔNG bị nuốt — vẫn ném tiếp để errorFormatter xử lý', () => {
    const boom = new TRPCError({ code: 'FORBIDDEN', message: 'Không có quyền' });
    // `rethrowContentSourceError` chỉ dịch hai lớp nó biết; mọi thứ khác đi tiếp
    // nguyên trạng. Thiếu vế này thì "dịch đúng hai lớp" không phân biệt được
    // với "nuốt mọi thứ vào 503".
    expect(() => rethrowContentSourceError(boom)).toThrow(boom);
  });
});
