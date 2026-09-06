import type { APIRequestContext, Page, Response } from '@playwright/test';
import { firstItemId } from './api';
import type { Screen } from '../routes';

/**
 * Thay `:id` bằng một id THẬT lấy từ API.
 *
 * Ném khi danh mục rỗng, KHÔNG skip và KHÔNG bịa id. Một id bịa ('demo',
 * 'test-1') render ra trang 404 của app; axe quét trang 404 đó và ô AC xanh
 * trong khi trang thật chưa từng mở. Một danh mục rỗng trên cụm cũng là một
 * vấn đề thật (nội dung nạp từ image), nên nó xứng đáng đỏ.
 */
export async function resolvePath(api: APIRequestContext, screen: Screen): Promise<string> {
  if (!screen.path.includes(':id')) return screen.path;
  if (screen.idFrom === undefined) {
    throw new Error(`${screen.path} có :id nhưng thiếu idFrom trong routes.ts`);
  }
  const id = await firstItemId(api, screen.idFrom);
  if (id === null) {
    throw new Error(
      `${screen.idFrom} trả 0 mục nên không mở được ${screen.path}. Danh mục rỗng ` +
        `là một vấn đề thật (nội dung nạp từ image) — không thay bằng id giả.`,
    );
  }
  return screen.path.replace(':id', encodeURIComponent(id));
}

/**
 * Mở một màn hình và KHẲNG ĐỊNH các tiền đề trước khi ai đó đo gì trên nó.
 *
 * Ba tiền đề, mỗi cái đóng một đường "xanh mà chẳng chứng minh gì":
 *   1. HTTP < 400 — 404 nghĩa là route chưa dựng; quét a11y một trang 404 vẫn
 *      cho 0 lỗi.
 *   2. không bị đá về `/login` — phiên chết giữa chừng thì MỌI màn hình được
 *      gác biến thành cùng một trang đăng nhập, và cả suite xanh trên nó.
 *   3. có nội dung — một `<body>` rỗng cũng có 0 lỗi a11y.
 */
export async function openScreen(page: Page, path: string, auth: string): Promise<Response> {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (res === null) {
    throw new Error(`goto(${path}) không trả response (điều hướng bị huỷ?)`);
  }

  if (res.status() === 404) {
    throw new Error(
      `${path} → HTTP 404. Route nằm trong danh sách màn hình chốt D12 nhưng ` +
        `chưa được dựng (hoặc bản đang chạy cũ hơn nhánh). Đây là 13.H báo cáo ` +
        `hiện trạng, không phải harness hỏng.`,
    );
  }
  if (res.status() >= 400) {
    throw new Error(`${path} → HTTP ${res.status()}`);
  }

  const landed = new URL(page.url()).pathname;
  if (auth !== 'anon' && landed === '/login') {
    throw new Error(
      `${path} đá về /login. Phiên không còn dùng được giữa lượt chạy — dừng ở ` +
        `đây, vì nếu đi tiếp thì mọi màn hình còn lại đều được đo trên trang ` +
        `đăng nhập và tất cả sẽ xanh.`,
    );
  }

  await settle(page);

  const textLength = await page.evaluate(() => document.body?.innerText.trim().length ?? 0);
  if (textLength < 20) {
    throw new Error(
      `${path} render ra ${textLength} ký tự text. Gần như chắc chắn là trang ` +
        `trắng (bẫy \`useInfiniteQuery\` 2026-08-13: suite API 14/14 xanh trong ` +
        `khi /lessons trắng). Một trang trắng cũng có 0 lỗi a11y.`,
    );
  }

  return res;
}

/**
 * Chờ trang lặng. `networkidle` có timeout riêng và LỖI ĐƯỢC PHÉP NUỐT — đó là
 * một fallback CÓ CHỦ Ý, không phải cẩu thả: trang `/lessons/:id` và
 * `/playgrounds/:id` giữ một WebSocket terminal mở, nên chúng KHÔNG BAO GIỜ đạt
 * networkidle và chờ tới cùng là timeout ở mọi lượt. Tiền đề "trang có nội
 * dung" được khẳng định riêng ở `openScreen`, nên việc lặng hay không không
 * quyết định tính đúng đắn của phép đo.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {
    // WS đang mở — xem khối chú thích trên.
  });
  await page.waitForTimeout(300);
}
