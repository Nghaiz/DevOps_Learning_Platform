/**
 * Level Builder — §18.E: phép đo LÚC CHẠY rằng mở và dùng Builder không gọi backend.
 *
 * ## Vì sao file này tồn tại, khi đã có hai ô "0 lời gọi backend" khác
 *
 * `phase-18-exec.md` §4.2 ghi món nợ *"Chưa ô nào đo rằng mở Level Builder không
 * gọi mạng — lời hứa 0 lời gọi backend hiện được giữ bằng một ô gác TĨNH đọc
 * nguồn, không bằng một phép đo lúc chạy."* Đo lại 2026-09-15 thì câu đó sai
 * theo HAI chiều cùng lúc, và cả hai chiều đều dẫn tới đây:
 *
 * 1. **Phép đo runtime CÓ tồn tại** — `games.spec.ts` §1 (k8s, lúc chơi) và
 *    `games-git-sandbox.spec.ts` AC-2 (sandbox). Nợ nói "chưa ô nào" là quá mạnh.
 * 2. **Nhưng không ô nào chạm Builder.** Builder là một panel MỞ RA TỪ sandbox,
 *    và nó là chỗ duy nhất trong cả trụ cột game có một đường gọi mạng thật
 *    (`save-problem-panel.tsx` § "lời gọi mạng DUY NHẤT"). Tức nó vừa là chỗ
 *    RỦI RO NHẤT vừa là chỗ chưa ai đo — ô AC-2 của sandbox dừng lại ngay trước
 *    cửa nó.
 *
 * ## Và lý do file này là một file RIÊNG, không phải một `it` thêm vào AC-2
 *
 * `e2e:ci` chạy đúng ba spec: `a11y csp games-level-mode`. Mười một spec còn
 * lại — `games.spec.ts` và `games-git-sandbox.spec.ts` trong số đó — **không
 * nằm trong lệnh nào CI gọi**. Theo đúng luật `phase-18-exec.md` §6.2, *"một
 * spec không nằm trong lệnh nào CI chạy thì không phải cổng, nó là tài liệu"*:
 * thêm một ô vào AC-2 sẽ sinh ra một ô gác thứ ba không bao giờ chạy, tức đóng
 * món nợ bằng một thứ trông giống cổng.
 *
 * File này được thêm vào `e2e:ci` trong CÙNG commit. Đó là nửa quan trọng hơn
 * của bản vá — C1 sống sót trọn một đợt chính vì `games.spec.ts` đã có ô đúng
 * mà không lệnh nào gọi nó.
 *
 * ## Ranh giới của phép đo: mọi thứ TRỪ nút Lưu
 *
 * Nút "Lưu thành bài tập" gọi `problems.create` và điều đó là ĐÚNG — nó không
 * phải vi phạm cần bắt. Ô dưới đây soi pha `builder`, tức từ lúc panel hiện tới
 * trước cú bấm đó, nên nó đo đúng thứ lời hứa nói: *soạn* level là việc 100%
 * trong trình duyệt.
 *
 * ⚠ Thiếu `E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary
 * khác binary vừa sửa.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { attachJson, traceRequests } from './games-harness';

const GIT_PATH = '/games/git';

/** `/games/git` → sandbox → Builder. Mọi ô dưới đây bắt đầu từ đây. */
async function openBuilder(page: Page): Promise<void> {
  await openScreen(page, GIT_PATH, 'user');
  await settle(page);
  await page.getByRole('button', { name: 'Mở sandbox' }).click();
  await expect(page.getByTestId('git-sandbox-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Mở Level Builder' }).click();
  await expect(page.getByTestId('git-builder')).toBeVisible();
}

test.describe('Level Builder — §18.E không gọi backend', { tag: '@games-builder' }, () => {
  /*
   * ⛔ ĐỐI CHỨNG DƯƠNG, và nó không thừa.
   *
   * Không có ô này thì "0 lời gọi /api" ở ô kế tiếp có thể đơn giản là máy thu
   * chưa từng gắn, hay phép lọc `pathname.startsWith('/api/')` gõ sai — và cả
   * hai chế độ hỏng đó cho ra một ô XANH VĨNH VIỄN, thứ không bao giờ đỏ được
   * dù Builder có gọi bao nhiêu lần đi nữa. Đúng hình dạng
   * `rules/green-that-proves-nothing.md`.
   */
  test('đối chứng dương — máy thu PHẢI bắt được một lời gọi /api có thật', async ({
    page,
  }, testInfo) => {
    const trace = traceRequests(page);
    await openBuilder(page);
    trace.phase('đối chứng');

    await page.evaluate(() =>
      fetch('/api/__dlp-builder-probe').then(
        () => undefined,
        () => undefined,
      ),
    );
    await expect
      .poll(() => trace.all().filter((r) => r.pathname.startsWith('/api/')).length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    const probes = trace.all().filter((r) => r.pathname.startsWith('/api/'));
    trace.stop();
    await attachJson(testInfo, 'builder-network-positive-control.json', probes);

    expect(
      probes.some((r) => r.pathname === '/api/__dlp-builder-probe'),
      'Máy thu bắt được lời gọi /api nào đó nhưng không phải lời gọi vừa phát ra. ' +
        'Phép lọc đang nhìn nhầm thứ.',
    ).toBe(true);
  });

  test('0 lời gọi backend trong lúc SOẠN level', async ({ page }, testInfo) => {
    const trace = traceRequests(page);
    await openBuilder(page);

    // Mọi thứ trước dòng này là tải trang, và tải trang ĐƯỢC PHÉP gọi backend.
    trace.phase('builder');

    // Soạn: mỗi thao tác dưới đây là một nhánh khác nhau của Builder, chọn để
    // chạm nhiều mã nhất có thể mà không bấm Lưu.
    await page.getByLabel('Tiêu đề').fill('Level tu dung tu phep do');
    await page.getByLabel('Tập lệnh cho phép').fill('status\nlog');
    await page.getByLabel('Đề bài đầy đủ').fill('De bai cho phep do mang.');

    // E.7 — chạy lời giải mẫu. Đây là thao tác NẶNG NHẤT của Builder: nó dựng
    // một phiên git và phát lại toàn bộ lời giải. Nếu có chỗ nào lén gọi máy
    // chủ để chấm thay vì chấm tại chỗ, nó lộ ra ở đây chứ không ở đâu khác.
    const check = page.getByTestId('git-builder-run-check');
    if (await check.isEnabled()) {
      await check.click();
      await expect(page.getByTestId('git-builder-check-report')).toBeVisible();
    }

    /*
     * Bằng chứng Builder ĐANG SỐNG, không phải một panel chết.
     *
     * ⚠ Bản đầu khẳng định `git-builder-export` khác rỗng và ô ĐỎ — ô xuất mang
     * placeholder *"Bản nháp còn lỗi nên chưa xuất được"*, vì một bản nháp bắt
     * từ sandbox chưa có mã level, mục tiêu hay lời giải. Ô đỏ ĐÚNG, nhưng vì
     * tính hợp lệ của bản nháp, thứ phép đo này không gác. Buộc một ô mạng vào
     * điều kiện đó là tự nhận một nguồn đỏ giả cho mọi lần Builder đổi form.
     *
     * `git-builder-issues` thì hiện ở CẢ HAI trạng thái (danh sách lỗi, hoặc
     * dòng "đã xong"), nên nó chứng minh Builder có tính lại sau mỗi phím gõ mà
     * không khẳng định gì về nội dung bản nháp.
     */
    await expect(page.getByTestId('git-builder-issues')).toBeVisible();

    await page.waitForTimeout(500);

    const during = trace.all().filter((r) => r.phase === 'builder');
    const api = during.filter((r) => r.sameOrigin && r.pathname.startsWith('/api/'));
    trace.stop();

    await attachJson(testInfo, 'builder-network.json', {
      total: trace.all().length,
      during: during.length,
      api,
    });

    expect(
      api.map((r) => `${r.method} ${r.pathname}`),
      'Soạn level phải chạy 100% trong trình duyệt. Lời gọi mạng DUY NHẤT được ' +
        'phép của Builder là nút "Lưu thành bài tập", mà ô này không bấm.',
    ).toEqual([]);

    // Nửa DƯƠNG, trong chính ô này: máy thu phải chứng minh nó thu được gì đó.
    // Một `trace` chết cho ra `[]` giống hệt một Builder sạch.
    expect(
      trace.all().length,
      'máy thu request không ghi được gì cả — "0 lời gọi" khi đó không chứng minh gì',
    ).toBeGreaterThan(0);
  });
});
