import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ContentSourcesUnavailableError, InvalidCursorError } from '@devops-platform/scenario';
import type * as LabsCatalog from '../../labs/catalog';
import type { Database } from '../../db/client';
import type { TRPCContext } from '../init';
import { appRouter } from './app-router';

/**
 * `labs.list` có ĐI QUA `rethrowContentSourceError` không?
 *
 * ⚠ Bộ `security/content-source-error.test.ts` đã gác kỹ chính cái helper —
 * nhưng nó gọi helper trực tiếp qua một router dựng riêng cho test. Một router
 * THẬT quên gọi helper vẫn để bộ đó xanh nguyên: cùng lớp lỗi với "mã chết làm
 * AC xanh nhờ một caller không tồn tại". Bộ này gác đúng cái mắt xích còn thiếu
 * — call-site — bằng cách bơm lỗi vào `labSource()` rồi hỏi `labs.list`.
 *
 * `ctx.db` là object rỗng có chủ ý: `labs.list` không chạm DB, nên bộ này chạy
 * không cần Postgres và không có I/O nào trong thân `it`.
 */

const holder = vi.hoisted(() => ({ error: null as unknown }));

vi.mock('../../labs/catalog', async (importOriginal) => {
  const real = await importOriginal<typeof LabsCatalog>();
  return {
    ...real,
    labSource: () =>
      ({
        listLabsPage: () => {
          throw holder.error;
        },
      }) as unknown as ReturnType<typeof real.labSource>,
  };
});

const ctx: TRPCContext = {
  db: {} as Database,
  user: { id: 'u-labs-list', role: 'user' },
  reqHeaders: new Headers(),
  resHeaders: new Headers(),
};

async function goiList(bom: unknown): Promise<TRPCError> {
  holder.error = bom;
  try {
    await appRouter.createCaller(ctx).labs.list({});
  } catch (error) {
    return error as TRPCError;
  }
  throw new Error('labs.list KHÔNG ném — bộ test này mất nghĩa');
}

describe('labs.list — lỗi nguồn nội dung đi qua đúng một chỗ dịch', () => {
  it('mọi nguồn hỏng ⇒ SERVICE_UNAVAILABLE kèm câu nói được phải làm gì', async () => {
    const error = await goiList(new ContentSourcesUnavailableError('listPage', 2, 2));

    // 503, không phải 500: "không đọc được" là trạng thái TẠM THỜI của hạ tầng,
    // còn 500 đọc ra như một bug của ứng dụng. Và tuyệt đối không phải 200 +
    // `{items:[]}` — người dùng đọc thành "kho trống", rồi cursor phát từ một
    // trang thiếu dữ liệu làm mất dòng vĩnh viễn.
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.message).toContain('tải lại trang');
    // Câu PHẢI khác `cause.message`: bằng nhau thì `isAuthored()` xếp nó là câu
    // của tầng dưới và bộ lọc S2 thay bằng câu chung — xem `source-errors.ts`.
    expect(error.message).not.toBe(new ContentSourcesUnavailableError('listPage', 2, 2).message);
  });

  it('ĐỐI CHỨNG: cursor hỏng vẫn là BAD_REQUEST, không bị 503 nuốt', async () => {
    const error = await goiList(new InvalidCursorError('lab-da-xoa'));

    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Cursor không còn hợp lệ');
  });

  it('ĐỐI CHỨNG: lỗi lạ KHÔNG bị nuốt vào 503', async () => {
    const error = await goiList(new Error('ổ đĩa bốc khói'));

    // Thiếu vế này thì "dịch đúng hai lớp" không phân biệt được với "mọi lỗi
    // đều thành 503", và một sự cố thật sẽ bị dán nhãn 'thử lại sau ít phút'.
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
