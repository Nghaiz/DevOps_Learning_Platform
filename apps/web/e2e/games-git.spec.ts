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
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ORIGIN=http://localhost:3000 \
 *   pnpm --filter web e2e --grep @games-git
 *
 * ⚠ Thiếu `E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary
 * khác binary vừa sửa. Đây là bẫy đã cắn repo này trước đó.
 *
 * ⚠ **`localhost`, KHÔNG phải `127.0.0.1`** — dù hai cái trỏ cùng một máy.
 * `next start` phát ở `http://localhost:3000`, và Better Auth so `E2E_ORIGIN`
 * với `betterAuthUrl` **theo chuỗi**, không theo địa chỉ đã phân giải. Sai chỗ
 * này thì `global-setup` chết ở 403 `INVALID_ORIGIN` và **không một ô nào
 * chạy** — bản hướng dẫn trước của chính file này ghi `127.0.0.1` và đã làm
 * đúng chuyện đó (2026-09-14).
 *
 * Và mã thoát KHÔNG cứu được: lớp bọc `pnpm` in `[exited with code 0]` ở cuối
 * trong khi dòng thật là `Exit status 1`. Đọc số ô đã chạy, đừng đọc mã thoát.
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
  /**
   * **AC-7 — draw call < 100 ở level đông nhất.**
   *
   * ═════════════════════════════════════════════════════════════════════════
   * VÌ SAO Ô NÀY DÀI HƠN MỘT DÒNG `expect(calls).toBeLessThan(100)`
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Vì một dòng như thế **xanh mãi mãi và chứng minh đúng zero điều gì.**
   *
   * `EffectComposer` reset `renderer.info.render` ở MỖI lần `render()`, và pass
   * cuối của nó là một tam giác phủ toàn màn hình — nên với bloom bật, `calls`
   * đọc ra là **1** bất kể cảnh có 2 hay 2000 object. Arena đã phải ghim bậc
   * chất lượng cộng ba tiền đề mới khoá được cái bẫy này
   * (`games.spec.ts` §15.3/15.4); game Git tắt hậu kỳ bằng `?fx=off`.
   *
   * Bốn tiền đề dưới đây là thứ phân biệt ô này với một ô trang trí. Chúng gác
   * **chiều ngược lại** — tức là chúng đỏ khi phép đo KHÔNG chạy:
   *
   *  1. `calls > 1` — hậu kỳ thật sự đã tắt. Nếu composer còn sống thì con số
   *     là 1, và một ngưỡng `< 100` sẽ vẫn xanh.
   *  2. `triangles > objects` — cảnh có hình thật, không phải một canvas rỗng
   *     vừa mount xong.
   *  3. `objects` TĂNG giữa hai mốc — engine đang chạy và cảnh đang lớn lên.
   *     Một cảnh đứng yên làm bất biến "draw call không tăng theo object" thành
   *     một câu nói về hai lần đo cùng một thứ.
   *  4. `colorsDegraded === null` — bảng màu đọc được thật. Cả cảnh xám ngoét
   *     là một lỗi KHÔNG ném, không đỏ, và ô này là chỗ rẻ nhất bắt được.
   *
   * Và khẳng định chính **mạnh hơn** ngưỡng của plan: draw call phải **KHÔNG
   * ĐỔI** khi số object tăng. `< 100` chỉ nói cảnh hiện tại đủ nhỏ; `toBe` nói
   * kiến trúc instancing thật sự gộp lô, và đó mới là thứ K.4 phải bảo đảm cho
   * mọi level sau này.
   */
  test('AC-7 — draw call không tăng theo số commit, và < 100', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    await openScreen(page, `${GIT_PATH}?fx=off`, 'user');
    await settle(page);

    await page.getByRole('button', { name: /Commit là một object bất biến/ }).click();
    await settle(page);

    await page.getByRole('button', { name: 'Cảnh 3D' }).click();

    // Cảnh 3D nạp động — đợi kênh đo xuất hiện, đừng đợi một khoảng thời gian.
    /*
     * Ép kiểu tại chỗ thay vì `declare global`: tsconfig của `e2e/` không đọc
     * `src/`, và một bản khai thứ hai ở đây sẽ lệch khỏi `GitSceneStats` mà
     * không cổng nào bắt — đúng lý do `games-harness.ts:227` nêu cho arena. Bù
     * lại bằng phép kiểm hình dạng lúc chạy ở `measure()`.
     */
    await page.waitForFunction(
      () => typeof (globalThis as { __dlpGitScene?: unknown }).__dlpGitScene === 'function',
      null,
      { timeout: 60_000 },
    );

    const command = page.getByLabel('$');
    const runCommands = async (lines: readonly string[]): Promise<void> => {
      for (const line of lines) {
        await command.fill(line);
        await command.press('Enter');
      }
      await page.waitForTimeout(400);
    };

    const measure = async (): Promise<{
      calls: number;
      triangles: number;
      objects: number;
      colorsDegraded: string | null;
    }> => {
      // Ép một khung mới rồi đọc — `frameloop="demand"` nên con số của khung
      // trước có thể là con số của một cảnh khác.
      await page.mouse.move(200, 200);
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const read = (
          globalThis as {
            __dlpGitScene?: () => {
              calls: number;
              triangles: number;
              objects: number;
              colorsDegraded: string | null;
            };
          }
        ).__dlpGitScene;
        if (read === undefined) throw new Error('kênh đo `__dlpGitScene` biến mất');
        const s = read();
        for (const key of ['calls', 'triangles', 'objects'] as const) {
          if (!Number.isFinite(s[key])) {
            throw new Error(`\`__dlpGitScene().${key}\` không phải số hữu hạn: ${String(s[key])}`);
          }
        }
        return {
          calls: s.calls,
          triangles: s.triangles,
          objects: s.objects,
          colorsDegraded: s.colorsDegraded,
        };
      });
    };

    await runCommands(['git add ghi-chu.md', 'git commit -m "một"']);
    const small = await measure();

    // Nhiều nhánh + nhiều commit: đây là hình dạng làm số LÔ tăng nếu kiến trúc
    // instancing sai, vì mỗi accent một khối và nhánh phụ đẩy node ra khỏi làn 0.
    await runCommands([
      'git branch nhanh-a',
      'git switch nhanh-a',
      'git commit --allow-empty -m "a1"',
      'git commit --allow-empty -m "a2"',
      'git commit --allow-empty -m "a3"',
      'git switch main',
      'git branch nhanh-b',
      'git switch nhanh-b',
      'git commit --allow-empty -m "b1"',
      'git commit --allow-empty -m "b2"',
      'git commit --allow-empty -m "b3"',
      'git switch main',
      'git commit --allow-empty -m "m1"',
      'git commit --allow-empty -m "m2"',
    ]);
    const large = await measure();

    await attachJson(testInfo, 'git-ac7-drawcalls.json', { small, large });

    // ── Tiền đề: phép đo này thật sự đã chạy ─────────────────────────────
    expect(
      small.calls,
      'draw call = 1 nghĩa là EffectComposer vẫn sống và đang gộp mọi thứ vào một ' +
        'tam giác phủ màn hình. `?fx=off` không có tác dụng, và mọi khẳng định dưới ' +
        'đây sẽ xanh mà chưa bao giờ đo cảnh.',
    ).toBeGreaterThan(1);
    expect(small.triangles, 'cảnh rỗng — không có hình nào để đếm').toBeGreaterThan(small.objects);
    expect(
      large.objects,
      'số object không tăng sau 14 lệnh — engine chưa nối, nên hai lần đo là cùng một cảnh',
    ).toBeGreaterThan(small.objects);
    expect(
      small.colorsDegraded,
      'bảng màu rơi về màu xám dự phòng — cảnh đang vẽ nhưng không vẽ đúng màu nào',
    ).toBeNull();

    // ── Khẳng định chính ─────────────────────────────────────────────────
    expect(
      large.calls,
      'draw call tăng theo số commit — kiến trúc instancing không gộp lô. Đây là ' +
        'thứ K.4 phải bảo đảm cho MỌI level sau này, không chỉ level đang đo.',
    ).toBe(small.calls);
    expect(large.calls, 'AC-7: draw call phải < 100 ở level đông nhất').toBeLessThan(100);
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
