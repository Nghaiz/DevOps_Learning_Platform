/**
 * P17 — **làn ĐO** của game Git. Ba ô nghiệm thu chỉ bằng chứng mới đóng được.
 *
 * | Ô | Đo gì | Đo bằng |
 * |---|---|---|
 * | **AC-2** | 0 lời gọi backend trong lúc chơi | Thu TẤT CẢ request rồi lọc, không rình vài URL đã đoán |
 * | **AC-5** | Đường 2D dùng được khi KHÔNG có WebGL | Chromium chạy với `--disable-3d-apis`, có đối chứng dương |
 * | **AC-6** | axe 0 vi phạm trên màn chơi | `scanAxe`, vốn tự khẳng định nó có luật PASS |
 *
 * ══ Vì sao AC-5 cần một cờ ĐẶC BIỆT ═══════════════════════════════════════
 *
 * **Tắt hardware acceleration KHÔNG xoá WebGL2** — Chromium rơi về SwiftShader
 * (rasterize bằng CPU) và vẫn cấp context. Một ô nghiệm thu "đã kiểm đường 2D"
 * chạy dưới `--disable-gpu` sẽ XANH mà chưa bao giờ chạy cảnh không-WebGL.
 * `--disable-3d-apis` mới thật sự gỡ WebGL khỏi trang.
 *
 * Và ô đó vẫn cần **đối chứng dương**: một `page.evaluate` khẳng định
 * `getContext('webgl2')` thật sự trả `null` trong project đó, VÀ trả non-null ở
 * project thường. Thiếu nửa thứ hai thì một cờ gõ sai vẫn cho "đã kiểm".
 *
 * ══ Chạy ══════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3000 \
 *   E2E_ORIGIN=http://127.0.0.1:3000 \
 *   pnpm --filter web e2e --grep @games-git
 *
 * ⚠ Thiếu `E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary
 * khác binary vừa sửa. Đây là bẫy đã cắn repo này trước đó.
 */

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { attachJson, scanAxe, traceRequests } from './games-harness';

const GIT_PATH = '/games/git';

test.describe('Game Git — ô nghiệm thu P17', { tag: '@games-git' }, () => {
  test('AC-2 — 0 lời gọi backend trong SUỐT một lượt chơi', async ({ page }, testInfo) => {
    const trace = traceRequests(page);

    await openScreen(page, GIT_PATH, 'user');
    await settle(page);

    // ── Giai đoạn CHƠI bắt đầu từ đây ────────────────────────────────────
    //
    // Mọi thứ trước dòng này là "tải trang", và tải trang ĐƯỢC PHÉP gọi
    // backend: đó là lúc server render và gửi 32 bài lý thuyết xuống. Ô AC-2
    // cấm lời gọi TRONG LÚC CHƠI, không cấm lúc mở trang.
    trace.phase('chơi');

    await page.getByRole('button', { name: /Commit là một object bất biến/ }).click();
    await settle(page);

    const command = page.getByLabel('$');
    await command.fill('git status');
    await command.press('Enter');
    await command.fill('git add ghi-chu.md');
    await command.press('Enter');
    await command.fill('git commit -m "Ghi chú đầu tiên"');
    await command.press('Enter');
    await page.waitForTimeout(500);

    const duringPlay = trace.all().filter((r) => r.phase === 'chơi');
    const apiDuringPlay = duringPlay.filter((r) => r.sameOrigin && r.pathname.startsWith('/api/'));
    trace.stop();

    await attachJson(testInfo, 'git-ac2-requests.json', {
      total: trace.all().length,
      duringPlay: duringPlay.length,
      apiDuringPlay,
      duringPlayUrls: duringPlay.map((r) => `${r.method} ${r.pathname}`),
    });

    expect(
      apiDuringPlay.map((r) => `${r.method} ${r.pathname}`),
      'AC-2: game phải chạy 100% trong trình duyệt. Mỗi URL dưới đây là một lời gọi ' +
        'backend xảy ra SAU khi người chơi bắt đầu gõ lệnh.',
    ).toEqual([]);

    // ── Nửa DƯƠNG của phép kiểm vắng mặt ─────────────────────────────────
    //
    // "0 lời gọi trong lúc chơi" chỉ đáng tin khi máy thu CHỨNG MINH ĐƯỢC là nó
    // thu được cái gì đó. Một `page.on('request')` gắn nhầm chỗ sẽ báo 0 trên
    // mọi trang, mãi mãi.
    expect(
      trace.all().length,
      'máy thu request không ghi được gì cả — "0 lời gọi" khi đó không chứng minh gì',
    ).toBeGreaterThan(0);

    // Và trạng thái game phải thật sự đã tiến: nếu ba lệnh trên không chạy thì
    // "không có lời gọi nào" cũng đúng một cách vô nghĩa.
    await expect(page.getByTestId('git-verdict')).toContainText(/AC|testcase/);
  });

  test('AC-6 — axe 0 vi phạm trên màn chơi', async ({ page }, testInfo) => {
    await openScreen(page, GIT_PATH, 'user');
    await settle(page);
    await scanAxe(page, testInfo, 'games-git-danh-sach-level');

    await page.getByRole('button', { name: /Commit là một object bất biến/ }).click();
    await settle(page);
    await scanAxe(page, testInfo, 'games-git-man-choi');
  });

  test('AC-L — điều hướng bàn phím đủ cho thao tác chính', async ({ page }) => {
    await openScreen(page, GIT_PATH, 'user');
    await settle(page);

    // Chọn level bằng BÀN PHÍM, không bằng chuột.
    const first = page.getByRole('button', { name: /Commit là một object bất biến/ });
    await first.focus();
    await page.keyboard.press('Enter');
    await settle(page);

    const command = page.getByLabel('$');
    await command.focus();
    await page.keyboard.type('git status');
    await page.keyboard.press('Enter');

    // ↑ lấy lại lệnh vừa gõ từ lịch sử (17.I.3).
    await page.keyboard.press('ArrowUp');
    await expect(command).toHaveValue('git status');
  });
});

/**
 * AC-5 — cảnh KHÔNG-WebGL.
 *
 * Project riêng vì cờ `--disable-3d-apis` phải đặt lúc khởi động trình duyệt,
 * không đặt được ở giữa một test.
 */
test.describe('Game Git — AC-5 đường 2D khi không có WebGL', { tag: '@games-git-no3d' }, () => {
  test('đối chứng dương: project này THẬT SỰ không có WebGL2', async ({ page }) => {
    await openScreen(page, GIT_PATH, 'user');
    const support = await page.evaluate(() => {
      try {
        return document.createElement('canvas').getContext('webgl2') === null
          ? 'unavailable'
          : 'available';
      } catch {
        return 'unavailable';
      }
    });
    expect(
      support,
      'Cờ `--disable-3d-apis` không có tác dụng — mọi ô AC-5 dưới đây sẽ xanh mà ' +
        'chưa bao giờ chạy cảnh không-WebGL. ⚠ Tắt hardware acceleration KHÔNG đủ: ' +
        'Chromium rơi về SwiftShader và vẫn cấp context.',
    ).toBe('unavailable');
  });

  test('chơi hết một level bằng đường 2D', async ({ page }) => {
    await openScreen(page, GIT_PATH, 'user');
    await settle(page);

    await page.getByRole('button', { name: /Commit là một object bất biến/ }).click();
    await settle(page);

    // Cảnh SVG phải có mặt và có node thật.
    const svg = page.locator('svg[role="group"]').first();
    await expect(svg).toBeVisible();

    const command = page.getByLabel('$');
    await command.fill('git add ghi-chu.md');
    await command.press('Enter');
    await command.fill('git commit -m "Ghi chú đầu tiên"');
    await command.press('Enter');
    await page.waitForTimeout(400);

    await expect(page.getByTestId('git-verdict')).toContainText('AC');
  });
});
