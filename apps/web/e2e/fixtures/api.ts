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
  const data = await trpcQuery<{ items: { id: string }[] }>(api, proc, { limit: 1 });
  return data.items[0]?.id ?? null;
}
