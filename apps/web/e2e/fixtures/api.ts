/**
 * Fixture dùng chung cho mọi spec 13.H.
 *
 * Hai thứ ở đây, và cả hai đều là chỗ đã có người ngã:
 *   1. `api` — APIRequestContext LUÔN mang header `Origin`.
 *   2. `account` — tài khoản của lượt chạy, kèm VAI TRÒ ĐỌC TỪ SERVER.
 */

import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ACCOUNT_FILE, E2E_BASE_URL, E2E_ORIGIN, STORAGE_STATE } from '../env';
import type { E2EAccount } from '../global-setup';

/**
 * Tài khoản do `global-setup.ts` ghi ra. Thiếu file = globalSetup chưa chạy
 * (hoặc đã ném). Ném ở đây thay vì trả về một object mặc định: một
 * `{ role: 'user' }` bịa ra sẽ khiến mọi spec vai-trò lặng lẽ skip, và một
 * suite skip sạch trông y hệt một suite xanh.
 */
export function readAccount(): E2EAccount {
  try {
    return JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8')) as E2EAccount;
  } catch (cause) {
    throw new Error(
      `Không đọc được ${ACCOUNT_FILE}. globalSetup chưa chạy hoặc đã thất bại — ` +
        `đừng đọc trạng thái này thành "tài khoản thường".`,
      { cause },
    );
  }
}

export const test = base.extend<{ api: APIRequestContext; account: E2EAccount }>({
  /**
   * ⚠ `extraHTTPHeaders: { origin }` ở ĐÂY, không ở `use` của config.
   *
   * Ở config nó sẽ dính vào cả điều hướng top-level của trình duyệt — thứ mà
   * trình duyệt thật không bao giờ gửi cho một GET gõ tay — nên harness sẽ chạy
   * một hình dạng request không người dùng nào tạo được. Ở đây thì đúng phạm
   * vi: chỉ những lượt gọi API mà CHÍNH harness phát ra ngoài trình duyệt.
   *
   * Không có nó, Better Auth trả 403 MISSING_OR_NULL_ORIGIN và undici của Node
   * không tự đặt — trong khi `curl` cùng request thì đi qua.
   */
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: E2E_BASE_URL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { origin: E2E_ORIGIN },
      storageState: STORAGE_STATE,
    });
    await use(ctx);
    await ctx.dispose();
  },

  // eslint-disable-next-line no-empty-pattern -- chữ ký fixture của Playwright
  account: async ({}, use) => {
    await use(readAccount());
  },
});

export { expect };

/**
 * tRPC KHÔNG dùng transformer (`apps/web/src/lib/trpc.ts`) ⇒ input/output là
 * JSON trần. Giữ nguyên quy ước của khuôn 2.D.
 */
export async function trpcQuery<T>(
  api: APIRequestContext,
  proc: string,
  input: unknown = {},
): Promise<T> {
  const url = `/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await api.get(url);
  const body = (await res.json()) as {
    error?: { message?: string };
    result?: { data: T };
  };
  if (body.error !== undefined) {
    throw new Error(`${proc}: ${body.error.message ?? JSON.stringify(body.error)}`);
  }
  if (body.result === undefined) {
    throw new Error(`${proc}: HTTP ${res.status()} nhưng không có result`);
  }
  return body.result.data;
}

/**
 * Id thật đầu tiên của một danh mục — để spec mở được route `[id]`.
 *
 * Trả `null` khi danh mục RỖNG, và người gọi phải xử lý `null` tường minh.
 * Một id bịa ra ('demo', 'test-1') sẽ render trang 404 của app, axe quét trang
 * 404 đó, và ô AC xanh — trong khi trang thật chưa từng được mở.
 */
export async function firstItemId(api: APIRequestContext, proc: string): Promise<string | null> {
  const data = await trpcQuery<unknown>(api, proc, { limit: 1 });

  // ⚠ HAI HÌNH DẠNG, không phải một. Đo trên cụm 2026-09-06 bằng curl:
  //
  //     lessons.list     → {"items":[…]}
  //     labs.list        → {"items":[…]}
  //     playgrounds.list → {"items":[…]}
  //     paths.list       → {"items":[],"limit":1,"nextCursor":null}
  //     quiz.list        → {"items":[],"limit":1,"nextCursor":null}
  //     authoring.list   → []                      ← MẢNG TRẦN
  //
  // Bản trước ép kiểu `{items:[…]}` cho cả sáu, nên `firstItemId(api,
  // 'authoring.list')` ném `TypeError: Cannot read properties of undefined
  // (reading '0')` — LUÔN LUÔN, kể cả khi danh mục đầy. Cái giá không phải là
  // một ô đỏ: nó là một ô đỏ MANG THÔNG BÁO SAI, che mất câu đúng
  // ("authoring.list trả 0 mục") bằng một TypeError không ai lần ra được.
  //
  // Nhận dạng theo HÌNH DẠNG THẬT thay vì theo tên procedure: một bảng
  // tên→hình-dạng sẽ lệch ngay lần kế tiếp ai đó chuyển `authoring.list` sang
  // phân trang (`paths.list` đã đi đúng đường đó rồi, xem §1 D9).
  const items = Array.isArray(data)
    ? (data as { id?: string }[])
    : isItemsEnvelope(data)
      ? data.items
      : null;

  if (items === null) {
    throw new Error(
      `${proc}: không nhận ra hình dạng phản hồi — không phải mảng trần, cũng ` +
        `không phải {items:[…]}. Nhận được: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  const first = items[0];
  return first === undefined ? null : identityOf(first);
}

function isItemsEnvelope(v: unknown): v is { items: { id?: string }[] } {
  return typeof v === 'object' && v !== null && Array.isArray((v as { items?: unknown }).items);
}

/**
 * Khoá định danh của một mục danh mục — BA chỗ, không phải một.
 *
 * Đo trên schema 2026-09-11: `lessons/labs/playgrounds/paths/quiz/authoring` khoá
 * theo `id`, còn `problems.list` / `problems.mine` trả
 * `{items:[{problem:{code}, …}]}` — mục ngoài KHÔNG có `id`, mã nằm lồng một
 * tầng dưới `problem.code`.
 *
 * Vì sao điều này đáng một hàm riêng thay vì `?? item.code`: bản chỉ đọc `.id`
 * trả `undefined` cho problems, và `firstItemId` khi đó trả `null` — thứ
 * `resolvePath` dịch thành **"danh mục rỗng"**. Đó là một ô đỏ MANG THÔNG BÁO
 * SAI, đúng lớp lỗi mà khối chú thích trên vừa mô tả cho `authoring.list`: nó
 * đẩy người đọc đi kiểm nội dung trong image, trong khi bảng `problems` đầy
 * và cái sai nằm ở một dòng harness. Ném có tên còn hơn trả `null` mơ hồ.
 */
function identityOf(item: unknown): string {
  const row = item as { id?: unknown; code?: unknown; problem?: { id?: unknown; code?: unknown } };
  for (const candidate of [row.id, row.code, row.problem?.id, row.problem?.code]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate;
  }
  throw new Error(
    `Mục đầu của danh mục không mang khoá định danh nào trong {id, code, ` +
      `problem.id, problem.code}. Nhận được: ${JSON.stringify(item).slice(0, 200)}. ` +
      `Đây KHÔNG phải "danh mục rỗng" — danh mục có mục, chỉ là harness không ` +
      `biết đọc khoá của nó.`,
  );
}
