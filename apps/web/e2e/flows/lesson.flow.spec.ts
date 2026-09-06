/**
 * Luồng 1 — đăng nhập → chọn bài → học → chấm → kết thúc phiên
 * (`phase-13.md:74`, 13.H mục 27).
 *
 * ── Vì sao luồng này KHÔNG dùng storageState của globalSetup ────────────────
 * Đây là luồng duy nhất có chữ "đăng nhập" trong tên. Nếu nó chạy với cookie
 * mà globalSetup đã nạp sẵn thì bước đăng nhập biến thành một `goto` — trang
 * `/login` không bao giờ được điền, nút Đăng nhập không bao giờ được bấm, và ô
 * AC vẫn xanh kể cả khi form đăng nhập đã hỏng hoàn toàn. Nên nó bắt đầu bằng
 * một jar cookie RỖNG và tự đăng nhập, dù việc đó chậm hơn.
 *
 * ── Bài được chọn là bài THẬT, lấy từ API ───────────────────────────────────
 * Không hardcode `dlp-...` nào. Danh mục nạp từ image nội dung và đổi theo bản
 * deploy; một id cố định sẽ render trang 404 và mọi bước sau đó đo trên trang
 * 404 đó.
 */

import {
  ACCOUNT_PASSWORD,
  ANONYMOUS_STATE,
  SANDBOX_FLOW_TIMEOUT_MS,
  endSandbox,
  expect,
  signInThroughForm,
  startSandbox,
  test,
} from './flow-kit';
import { settle } from '../fixtures/nav';

test.describe('luồng 1 — bài học', { tag: '@flow' }, () => {
  test.use({ storageState: ANONYMOUS_STATE });

  test('đăng nhập → chọn bài → học → chấm → kết thúc phiên', async ({ page, account }) => {
    test.setTimeout(SANDBOX_FLOW_TIMEOUT_MS);

    // ── 1. Đăng nhập qua form ────────────────────────────────────────────────
    await signInThroughForm(page, account.email, ACCOUNT_PASSWORD);

    // ── 2. Chọn bài từ danh mục ─────────────────────────────────────────────
    // Đi bằng thanh điều hướng của vỏ (C6), không `goto('/lessons')`: một link
    // nav hỏng là một lỗi thật mà `goto` đi vòng qua.
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Bài học', exact: true })
      .click();
    await page.waitForURL('**/lessons');
    await expect(page.getByRole('heading', { name: 'Bài học', level: 1 })).toBeVisible();

    // Thẻ danh mục LÀ một link (`CatalogCard`). Danh mục rỗng ⇒ đỏ, không skip:
    // nội dung nạp từ image, nên rỗng là một vấn đề thật của bản deploy.
    const cards = page.locator('a[href^="/lessons/"]');
    await expect(
      cards.first(),
      'Danh mục bài học không có thẻ nào. Nội dung nạp từ image — danh mục rỗng ' +
        'là vấn đề của bản deploy, không phải của harness.',
    ).toBeVisible();

    const href = await cards.first().getAttribute('href');
    await cards.first().click();
    await page.waitForURL(`**${href ?? '/lessons/'}**`);
    await settle(page);

    // ── 3. Học: trang bài phải render nội dung, không phải khung chờ ────────
    // `lesson-client` hiện "Đang tải bài học…" trước khi có dữ liệu và "Không
    // tìm thấy bài học này." khi id sai. Cả hai đều KHÔNG phải trang bài.
    await expect(page.getByText('Không tìm thấy bài học này.')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // ── 4. Bắt đầu phiên ────────────────────────────────────────────────────
    await startSandbox(page);

    // ── 5. Chấm ─────────────────────────────────────────────────────────────
    // Nút "Kiểm tra" chỉ tồn tại ở bước CÓ script chấm (`canCheck(active)`),
    // và bài thường mở ở phần mở đầu. Bấm "Tiếp" cho tới khi gặp bước chấm
    // được — vòng lặp CÓ CHẶN TRÊN để một bài không có bước chấm nào làm test
    // đỏ với lý do đúng, thay vì treo tới hết timeout.
    const check = page.getByRole('button', { name: 'Kiểm tra', exact: true });
    const next = page.getByRole('button', { name: 'Tiếp', exact: true });

    let hops = 0;
    while ((await check.count()) === 0 && hops < 20) {
      if (await next.isDisabled()) break;
      await next.click();
      hops += 1;
    }

    await expect(
      check,
      `Đi hết ${String(hops)} bước mà không gặp nút "Kiểm tra". Bài này không có ` +
        `bước nào chấm được, nên nó không phục vụ được luồng "học → chấm" — ` +
        `hoặc StepNav đã hỏng. Cả hai đều là lỗi thật.`,
    ).toBeVisible();
    await expect(check).toBeEnabled();
    await check.click();

    // `CheckResultPanel` có BA nhánh và cả ba đều là một lượt chấm ĐÃ CHẠY:
    // "Đạt", "Chưa đạt (exit N)", "Không chấm được". Luồng này khẳng định
    // đường chấm đi tới nơi, KHÔNG khẳng định bài làm đúng — người dùng e2e
    // không làm bài, nên "Chưa đạt" là kết quả bình thường và ép nó phải "Đạt"
    // là ép harness gõ lời giải, tức là đo một thứ khác.
    const verdict = page.getByText(/^(Đạt|Chưa đạt \(exit |Không chấm được)/);
    await expect(verdict.first(), 'Bấm Kiểm tra nhưng không có bảng kết quả nào hiện ra.').toBeVisible({
      timeout: 120_000,
    });

    // ⚠ "Không chấm được" là nhánh LỖI HẠ TẦNG (`error`), khác hẳn "Chưa đạt"
    // (`passed: false`). Gộp hai nhánh ở đây sẽ vứt bỏ đúng sự phân biệt mà
    // `check-result-panel.tsx` cố tình giữ, và một lượt chấm không chạy được
    // sẽ đọc ra thành một lượt chấm chạy xong.
    await expect(
      page.getByText('Không chấm được'),
      'Lượt chấm không chạy được (nhánh error của CheckResultPanel). Đây là lỗi ' +
        'hạ tầng chấm bài, không phải "bài làm chưa đạt".',
    ).toBeHidden();

    // ── 6. Kết thúc phiên ───────────────────────────────────────────────────
    await endSandbox(page);
  });
});
