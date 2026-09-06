import { describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { DrizzleQueryError } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { readFileSync } from 'node:fs';
import { createTRPCRouter, publicProcedure, type TRPCContext } from '../server/trpc/init';
import { GENERIC_ERROR_MESSAGE, toClientSafeMessage } from '../server/trpc/error-message';
import type { Database } from '../server/db/client';

/**
 * S2 — biên `errorFormatter` KHÔNG được để thông điệp của tầng dưới đi ra client.
 *
 * ## Vì sao test này đi qua `fetchRequestHandler` chứ không qua `createCaller`
 *
 * `errorFormatter` chỉ chạy bên trong `getErrorShape`, và `getErrorShape` chỉ
 * được gọi từ adapter HTTP (`resolveResponse-*.mjs`, `node-http-*.mjs` của
 * `@trpc/server@11.18.0`). `appRouter.createCaller` — thứ MỌI test trong
 * `src/security/` khác đang dùng — KHÔNG đi qua đường đó, nên nó ném thẳng
 * `TRPCError` gốc ra và **không bao giờ quan sát được** thứ trình duyệt thật
 * nhận. Một test viết bằng `createCaller` ở đây sẽ xanh cả trước lẫn sau bản
 * vá: nó không thể đỏ, nên nó không chứng minh gì (luật
 * `green-that-proves-nothing`).
 *
 * Router tí hon dưới đây dựng từ CHÍNH `createTRPCRouter`/`publicProcedure` mà
 * `init.ts` xuất ra, tức cùng một instance `t` mang đúng `errorFormatter` đang
 * chạy production. Nó không đụng DB, nên test này chạy được cả khi không có
 * Postgres.
 */

/** `db` không bao giờ bị chạm tới: procedure ném trước khi dùng ctx. */
const ctx: TRPCContext = {
  db: {} as Database,
  user: null,
  reqHeaders: new Headers(),
  resHeaders: new Headers(),
};

const VICTIM_USER_ID = '0f8e7d6c-5b4a-4938-a271-6c5d4e3f2a1b';

/**
 * Bản sao TRUNG THỰC của lỗi Drizzle ném ra khi `weight` tràn `integer` 32-bit
 * (Postgres `22003`). Dùng CHÍNH lớp `DrizzleQueryError` của drizzle-orm 0.45.2
 * chứ không phải một `Error` bịa: thông điệp `Failed query: …\nparams: …` được
 * dựng trong constructor của nó (`drizzle-orm/errors.js`), nên chép tay sẽ trôi
 * khỏi thật khi drizzle đổi định dạng.
 */
function overflowError(): DrizzleQueryError {
  return new DrizzleQueryError(
    'insert into "content_items" ("id", "author_id", "weight") values ($1, $2, $3)',
    ['lab-tran-so', VICTIM_USER_ID, 3_000_000_000],
    new Error('value out of range for type integer'),
  );
}

const router = createTRPCRouter({
  /** Mô phỏng `authoring.create` với `weight` tràn: tầng DB ném, router KHÔNG bắt. */
  duoiNem: publicProcedure.query(() => {
    throw overflowError();
  }),
  /** Đối chứng dương: lỗi do CHÍNH ta soạn phải tới được người dùng nguyên vẹn. */
  loiCoChuY: publicProcedure.query(() => {
    throw new TRPCError({ code: 'CONFLICT', message: 'Id "lab-abc" đã có' });
  }),
});

async function callAndReadError(procedure: string): Promise<{ message: string; code: string }> {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(`http://localhost/api/trpc/${procedure}`),
    router,
    createContext: () => ctx,
  });
  const body = (await response.json()) as { error: { message: string; data: { code: string } } };
  return { message: body.error.message, code: body.error.data.code };
}

describe('errorFormatter không rò tầng dưới ra client', () => {
  it('lỗi Drizzle (weight tràn 32-bit) KHÔNG mang SQL, params hay tên bảng ra client', async () => {
    const { message } = await callAndReadError('duoiNem');

    expect(message).not.toContain('Failed query');
    expect(message).not.toContain('params:');
    expect(message).not.toContain('content_items');
    expect(message).not.toContain('insert into');
    // Vế NGUY HIỂM NHẤT: `params` mang `user_id` của người gọi.
    expect(message).not.toContain(VICTIM_USER_ID);
  });

  it('thông điệp thay thế là một câu tiếng Việt dùng được, không phải chuỗi rỗng hay mã lỗi trần', async () => {
    const { message } = await callAndReadError('duoiNem');

    // Chặn "bản vá" kiểu xoá trắng message: người dùng sẽ thấy `[object Object]`
    // hoặc chuỗi rỗng qua `describeTrpcError` (`lib/trpc.ts`).
    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toBe('INTERNAL_SERVER_ERROR');
    expect(message).toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩậắằẵặẹẻếềểệỉịọỏốồổộớờởợụủứừửữựỳỵỷỹ]/i);
  });

  it('ĐỐI CHỨNG DƯƠNG — lỗi ta tự soạn vẫn tới được người dùng nguyên văn', async () => {
    const { message, code } = await callAndReadError('loiCoChuY');

    // Nếu ô này đỏ, bản vá đã quét sạch cả thông điệp có chủ ý — hỏng UX chứ
    // không phải bịt rò. Đừng nới ô này; sửa bộ lọc.
    expect(message).toBe('Id "lab-abc" đã có');
    expect(code).toBe('CONFLICT');
  });
});

// ═══════════════════════════════════ bộ lọc thuần — từng nhánh, không qua HTTP
describe('toClientSafeMessage — phân biệt câu ta soạn với câu tầng dưới', () => {
  it('lỗi tRPC bọc từ throw lạ (message rơi về cause.message) bị THAY', () => {
    const wrapped = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: overflowError() });
    const safe = toClientSafeMessage(wrapped);

    expect(safe.redacted).toBe(true);
    expect(safe.message).not.toContain('Failed query');
  });

  it('lỗi thiếu hẳn `message` (rơi về `code`) bị THAY — không để lộ chuỗi tiếng Anh trần', () => {
    const bare = new TRPCError({ code: 'UNAUTHORIZED' });
    expect(bare.message).toBe('UNAUTHORIZED'); // đối chứng: đây LÀ hành vi của tRPC v11

    const safe = toClientSafeMessage(bare);
    expect(safe.redacted).toBe(true);
    expect(safe.message).not.toBe('UNAUTHORIZED');
    expect(safe.message).toContain('đăng nhập');
  });

  it('câu ta soạn kèm cause vẫn GIỮ — cause không làm nó bị coi là của tầng dưới', () => {
    const authored = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Đẩy file kèm bài học thất bại (exit 1). Hãy khởi động lại phiên.',
      cause: new Error('exec: signal killed'),
    });
    const safe = toClientSafeMessage(authored);

    expect(safe.redacted).toBe(false);
    expect(safe.message).toContain('khởi động lại phiên');
  });

  it('LỚP CHẶN THỨ HAI — câu "tự soạn" nhưng nhúng SQL vẫn bị thay', () => {
    // Ca này mô phỏng đúng hình dạng cũ của `callOrchestrator`: chuỗi ghép tay
    // ôm nguyên văn lỗi tầng dưới. Phép kiểm cấu trúc coi nó là "do ta soạn",
    // nên nếu lớp thứ hai biến mất, ô này đỏ.
    const handBuilt = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'orchestrator gRPC: Failed query: select * from sessions where user_id = $1',
    });
    const safe = toClientSafeMessage(handBuilt);

    expect(safe.redacted).toBe(true);
    expect(safe.message).toBe(GENERIC_ERROR_MESSAGE);
  });
});

// ══════════════════════════════════════════════════════════ S3 — nonce ra DOM
describe('S3 — nonce KHÔNG được publish vào DOM', () => {
  /**
   * ⚠ PHẠM VI CỦA Ô NÀY: nó đọc MÃ NGUỒN `layout.tsx`, không đọc HTML đã render.
   * Nó đỏ khi ai đó gắn lại `data-nonce` vào chính file ấy — đó là đường đã xảy
   * ra thật. Nó KHÔNG phủ được một component khác in nonce ra DOM; phép đo đó
   * phải chạy trên HTML thật và thuộc `e2e/csp.spec.ts` (lane khác sở hữu).
   * Nói rõ ở đây để không ai đọc ô xanh này thành "đã chứng minh nonce không ra DOM".
   */
  it('layout.tsx không gắn nonce vào bất kỳ thuộc tính `data-*` nào', () => {
    const source = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    const jsx = source.replace(/\/\*[\s\S]*?\*\//g, ''); // bỏ comment: bản vá có mô tả tấn công

    expect(jsx).not.toMatch(/data-nonce/);
    expect(jsx).not.toMatch(/data-[\w-]+=\{nonce\}/);
    // Đối chứng dương: thuộc tính `nonce` THẬT trên <script> vẫn phải còn, nếu
    // không thì script khởi tạo theme bị CSP chặn và trang nháy màu.
    expect(jsx).toMatch(/<script\s+nonce=\{nonce\}/);
  });
});
