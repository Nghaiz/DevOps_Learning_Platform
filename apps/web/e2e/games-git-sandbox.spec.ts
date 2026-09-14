/**
 * P17 §17.Q — **màn sandbox**, đo bằng trình duyệt thật.
 *
 * | Ô | Đo gì |
 * |---|---|
 * | **AC-Q** | Xuất rồi nhập lại **qua chính giao diện** ⇒ bản xuất không đổi từng byte |
 * | **AC-2** | 0 lời gọi backend trong lúc dùng sandbox |
 * | **AC-6** | axe 0 vi phạm trên màn sandbox |
 *
 * ⚠ AC-Q đã có ô đơn vị ở `packages/games/src/git/sandbox.test.ts`. Ô ở đây KHÔNG
 * thừa: ô đơn vị gọi thẳng `exportSandboxJson`/`importSandboxJson`, nên nó xanh kể
 * cả khi giao diện nối nhầm hai nút đó — ví dụ nhập xong quên dựng lại phiên, hay
 * dựng lại phiên từ spec CŨ. Đường đi từ ô textarea tới engine là thứ chỉ trình
 * duyệt đo được.
 *
 * ══ Chạy ══════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3000 \
 *   E2E_ORIGIN=http://127.0.0.1:3000 \
 *   pnpm --filter web e2e --grep @games-git-sandbox
 *
 * ⚠ Thiếu `E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary
 * khác binary vừa sửa.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { attachJson, scanAxe, traceRequests } from './games-harness';

const GIT_PATH = '/games/git';

/** Mở `/games/git` rồi bấm vào sandbox. Mọi ô dưới đây bắt đầu từ đây. */
async function openSandbox(page: Page): Promise<void> {
  await openScreen(page, GIT_PATH, 'user');
  await settle(page);
  await page.getByRole('button', { name: 'Mở sandbox' }).click();
  await expect(page.getByTestId('git-sandbox-panel')).toBeVisible();
}

test.describe('Sandbox Git — §17.Q', { tag: '@games-git-sandbox' }, () => {
  test('AC-Q — xuất, nhập lại, bản xuất KHÔNG đổi', async ({ page }, testInfo) => {
    await openSandbox(page);

    // Gõ vài lệnh để cây KHÁC trạng thái khởi tạo. Một vòng xuất-nhập trên đúng
    // cây dựng sẵn là phép thử dễ nhất có thể; cây do lệnh người chơi tạo ra mới
    // là thứ sandbox thật sự phải chia sẻ được.
    const command = page.getByLabel('$');
    await command.fill('git checkout -b thu-nghiem');
    await command.press('Enter');
    await command.fill('git write ghi-chu.md -c "xin chao"');
    await command.press('Enter');
    await command.fill('git add ghi-chu.md');
    await command.press('Enter');
    await command.fill('git commit -m "Ghi chu tu sandbox"');
    await command.press('Enter');
    await page.waitForTimeout(300);

    const exportBox = page.getByTestId('git-sandbox-export');
    const before = await exportBox.inputValue();

    // ── Đối chứng dương ────────────────────────────────────────────────────
    //
    // "hai bản xuất bằng nhau" xanh một cách vô nghĩa nếu cả hai đều rỗng, hoặc
    // nếu ô textarea chưa bao giờ được nối vào engine. Bản xuất phải chở đúng
    // những gì vừa gõ.
    expect(before.length, 'ô xuất rỗng — mọi so sánh dưới đây vô nghĩa').toBeGreaterThan(200);
    expect(before, 'nhánh vừa tạo không có trong bản xuất').toContain('thu-nghiem');
    expect(before, 'commit vừa tạo không có trong bản xuất').toContain('Ghi chu tu sandbox');

    // ── Vòng tròn ──────────────────────────────────────────────────────────
    await page.getByTestId('git-sandbox-import').fill(before);
    await page.getByRole('button', { name: 'Nhập' }).click();
    await page.waitForTimeout(300);

    const after = await exportBox.inputValue();
    await attachJson(testInfo, 'git-acq-roundtrip.json', {
      beforeLength: before.length,
      afterLength: after.length,
      equal: before === after,
    });

    expect(
      after,
      'AC-Q: xuất → nhập → xuất phải ra đúng một chuỗi. Lệch nghĩa là giao diện ' +
        'dựng lại phiên từ spec CŨ, hoặc phép chiếu ngược `worldToSpec` không ổn định.',
    ).toBe(before);

    // Và phiên phải THẬT SỰ được dựng lại, không phải "không làm gì" — ô nhập
    // được xoá sau một lần nhập thành công.
    await expect(page.getByTestId('git-sandbox-import')).toHaveValue('');
  });

  test('chuỗi rác báo lỗi tử tế, KHÔNG làm sập trang', async ({ page }) => {
    await openSandbox(page);

    const exportBox = page.getByTestId('git-sandbox-export');
    const before = await exportBox.inputValue();

    await page.getByTestId('git-sandbox-import').fill('{{{ khong phai json');
    await page.getByRole('button', { name: 'Nhập' }).click();

    await expect(page.getByTestId('git-sandbox-problem')).toBeVisible();
    // Cây cũ còn nguyên — một lần dán nhầm không được xoá việc của người dùng.
    await expect(exportBox).toHaveValue(before);
  });

  test('bật/tắt origin, và nút TẮT HẲN khi kho chưa có commit', async ({ page }) => {
    await openSandbox(page);

    const state = page.getByTestId('git-sandbox-origin-state');
    await expect(state).toContainText('đang tắt');

    await page.getByRole('button', { name: 'Bật origin' }).click();
    await expect(state).toContainText('đang bật');

    await page.getByRole('button', { name: 'Tắt origin' }).click();
    await expect(state).toContainText('đang tắt');

    // ── Đối chứng của nhánh `withOrigin` trả null ──────────────────────────
    //
    // `kho-trong` không có commit nào, nên origin không có gì để trỏ vào. Nếu
    // nút vẫn bấm được thì `buildWorld` sẽ NÉM và trang sập — ô này chốt rằng ta
    // chặn ở tầng spec chứ không để nó chạy tới đó.
    await page.getByLabel('Chọn kịch bản khởi tạo').selectOption('kho-trong');
    await expect(page.getByRole('button', { name: 'Bật origin' })).toBeDisabled();
  });

  test('AC-2 — 0 lời gọi backend trong lúc dùng sandbox', async ({ page }, testInfo) => {
    const trace = traceRequests(page);
    await openSandbox(page);

    // Mọi thứ trước dòng này là tải trang, và tải trang ĐƯỢC PHÉP gọi backend.
    trace.phase('sandbox');

    const command = page.getByLabel('$');
    await command.fill('git checkout -b nhanh-moi');
    await command.press('Enter');
    await page.getByRole('button', { name: 'Bật origin' }).click();
    await page.getByLabel('Chọn kịch bản khởi tạo').selectOption('kho-vua-hong');
    await page.getByRole('button', { name: 'Đặt lại' }).click();
    await page.waitForTimeout(300);

    const during = trace.all().filter((r) => r.phase === 'sandbox');
    const api = during.filter((r) => r.sameOrigin && r.pathname.startsWith('/api/'));
    trace.stop();

    await attachJson(testInfo, 'git-sandbox-ac2.json', {
      total: trace.all().length,
      during: during.length,
      api,
    });

    expect(
      api.map((r) => `${r.method} ${r.pathname}`),
      'AC-2: sandbox phải chạy 100% trong trình duyệt.',
    ).toEqual([]);

    // Nửa DƯƠNG: máy thu phải chứng minh được nó thu được cái gì đó.
    expect(
      trace.all().length,
      'máy thu request không ghi được gì cả — "0 lời gọi" khi đó không chứng minh gì',
    ).toBeGreaterThan(0);
  });

  test('AC-6 — axe 0 vi phạm trên màn sandbox', async ({ page }, testInfo) => {
    await openSandbox(page);
    await scanAxe(page, testInfo, 'games-git-sandbox');
  });
});
