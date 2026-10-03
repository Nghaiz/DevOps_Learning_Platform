/**
 * Luồng 7 — sân chơi: TTL hiện TRƯỚC khi bắt đầu → mở sandbox THẬT → terminal
 * có byte về và shell CHẠY được → kết thúc, UI nói LÝ DO.
 *
 * Đóng nửa còn thiếu của ô AC `phase-13.md:93` ("3/4 trình học end-to-end"):
 * lesson · lab · quiz đã có luồng riêng, playground thì tới hôm nay mới chỉ
 * được a11y + CSP quét — tức trang được KIỂM là mở ra được, chưa bao giờ được
 * kiểm là DÙNG được.
 *
 * ── Vì sao playground cần một luồng RIÊNG, không gộp vào luồng lab ──────────
 * Ba trình kia dùng terminal như một khoang phụ bên cạnh nội dung/task/câu hỏi.
 * Playground thì terminal LÀ toàn bộ sản phẩm, và nó là trình học DUY NHẤT mà
 * AC 13.D mục 15 đòi **TTL phải hiện trước khi bấm "Bắt đầu"** — người học bỏ
 * ~30–50 giây dựng một sandbox trống thì phải biết trước nó sống bao lâu.
 * Sân chơi không có phép chấm và không có khoang IDE (`playground-client.tsx`
 * không truyền `editor` cho `WorkspacePanel`), nên "chấm đạt" và "IDE tải" của
 * hai luồng kia không có tương ứng ở đây.
 *
 * ── Bốn khẳng định, mỗi cái kèm ĐỐI CHỨNG ở CÙNG một lượt ───────────────────
 * Một khẳng định-dương đứng một mình không phân biệt được "điều kiện đúng" với
 * "phép kiểm luôn xanh". Nên mỗi mốc dưới đây có cặp của nó:
 *
 *   | mốc          | dương                                   | đối chứng cùng lượt              |
 *   |--------------|-----------------------------------------|----------------------------------|
 *   | trước Bắt đầu| badge "Phiên kéo dài N phút" CÓ         | KHÔNG có khoang terminal         |
 *   | sau Bắt đầu  | terminal có, byte binary về             | badge TTL nội dung BIẾN MẤT      |
 *   | shell sống   | `DLPE2E-OK` (kết quả) về qua dây        | chuỗi gõ vào có dấu nháy, khác   |
 *   | sau Kết thúc | câu "Bạn đã kết thúc phiên…" hiện       | KHÔNG phải "Mất kết nối…"        |
 *
 * Cặp thứ hai đáng nói riêng: `SessionControls` chỉ vẽ badge TTL của NỘI DUNG
 * khi `!hasSession` (sau đó đồng hồ thật thay chỗ, vì "Thêm giờ" đã có thể đẩy
 * hạn đi). Nên "badge biến mất sau khi mở phiên" biến phép kiểm TTL thành cổng
 * HAI CHIỀU: một badge vẽ vô điều kiện sẽ làm ô này đỏ, thay vì lặng lẽ làm ô
 * kia xanh mãi mãi.
 *
 * Cặp thứ ba: harness gõ `echo DLP''E2E-OK` (`session-kit.ts`). PTY echo lại đúng
 * chuỗi ĐÃ GÕ (có hai dấu nháy), còn shell chỉ in ra `DLPE2E-OK` khi nó THỰC SỰ
 * chạy lệnh — thứ một phép đếm byte trần không tách nổi khỏi "socket mở và echo".
 *
 * ── Cạm bẫy đã trả giá, và cách luồng này né ────────────────────────────────
 * 1. **429 giả trang thành lỗi sản phẩm.** `startSandbox` (`flow-kit.ts`) đọc mã
 *    trạng thái của chính lượt gọi `playgrounds.start` và tách hai ca 429
 *    (rate-limit Traefik / hết chỗ) thay vì đọc băng lỗi trên trang rồi đoán.
 * 2. **Kết thúc phiên là tác dụng phụ không hoàn tác được trên cụm dùng
 *    chung.** `endSandbox` khẳng định request `session.reap` mang ĐÚNG
 *    `sessionId` mà chính luồng vừa tạo.
 * 3. **Trần chỗ hiện đang SAI và đã ghi nợ** (`phase-13.md:96-98`). Nếu `start`
 *    trả 429 vì hết chỗ, thông báo nói thẳng đó là món nợ ĐÃ GHI.
 * 4. **Không `kubectl delete pod` để dọn.** Đường nhả phiên duy nhất là nút
 *    "Kết thúc phiên" của chính trang; `afterEach` chỉ bấm lại đúng nút đó khi
 *    luồng đỏ giữa chừng. Xoá pod bằng tay làm lệch warm pool.
 *
 * ── `E2E_REQUIRE_SESSION` KHÔNG xuất hiện ở đây, có chủ ý ───────────────────
 * Phiên sandbox LÀ toàn bộ nội dung của luồng này — một lượt "bỏ qua vì không có
 * sandbox" không còn đo gì cả, nên nó không có nhánh skip nào để cờ gác. Không
 * mở được phiên ⇒ ĐỎ, luôn.
 */

import { t } from '@devops-platform/copy';
import {
  SANDBOX_FLOW_TIMEOUT_MS,
  endSandbox,
  expect,
  releaseSandboxQuietly,
  startSandbox,
  test,
  watchRateLimits,
} from './flow-kit';
import {
  SHELL_MARKER_CMD,
  SHELL_MARKER_OUT,
  expectTerminalLive,
  expectTerminalOutput,
  terminalSurface,
  typeInTerminal,
  watchTerminalTraffic,
} from './session-kit';
import { trpcQuery } from '../fixtures/api';
import { openScreen, settle } from '../fixtures/nav';

test.afterEach(async ({ page }) => {
  if (await releaseSandboxQuietly(page)) {
    test.info().annotations.push({
      type: 'don-dep',
      description:
        'Luồng đỏ khi phiên còn sống; afterEach đã bấm "Kết thúc phiên" để nhả khe quota. ' +
        'Kết quả đo bên trên KHÔNG tính vế kết thúc.',
    });
  }
});

test.describe('luồng 7 — sân chơi', { tag: '@flow' }, () => {
  test('TTL trước khi bắt đầu → mở sandbox → terminal sống → kết thúc có lý do', async ({
    page,
    api,
  }) => {
    test.setTimeout(SANDBOX_FLOW_TIMEOUT_MS);
    const rateLimited = watchRateLimits(page);
    // Đăng ký TRƯỚC khi mở phiên: frame đầu (dấu nhắc shell) đến ngay lúc mount.
    const traffic = watchTerminalTraffic(page);

    // ── 1. Danh mục sân chơi ────────────────────────────────────────────────
    await openScreen(page, '/playgrounds', 'user');
    await expect(
      page.getByRole('heading', { level: 1, name: t('catalog.title.playgrounds'), exact: true }),
    ).toBeVisible();

    /*
      Dòng danh mục (`BoardRow`) là MỘT link tới `/playgrounds/<id>`. Chọn theo
      đích của link: cùng trang còn link `/playgrounds` (không gạch chéo cuối) ở
      `SectionSwitcher` và footer, và chúng không phải dòng nào cả. Danh mục rỗng
      ⇒ đỏ, không skip: nội dung nạp từ image, nên rỗng là vấn đề của bản deploy.
    */
    const rows = page.locator('a[href^="/playgrounds/"]');
    await expect(
      rows.first(),
      'Danh mục sân chơi không có dòng nào. Nội dung nạp từ image — danh mục rỗng là vấn ' +
        'đề của bản deploy, không phải của harness.',
    ).toBeVisible();

    const href = await rows.first().getAttribute('href');
    expect(href, 'dòng sân chơi đầu tiên không có href').not.toBeNull();
    const playgroundId = decodeURIComponent((href ?? '').replace(/^\/playgrounds\//, ''));
    expect(playgroundId, `href '${href ?? ''}' không tách ra được id`).not.toBe('');

    /*
      TTL KỲ VỌNG lấy từ API cho ĐÚNG id vừa chọn, không hằng số chép tay: một số
      30 gõ cứng đỏ ở mọi nội dung khác, và đây đồng thời là phép so UI ↔ nguồn.
      Dùng id LẤY TỪ DÒNG chứ không `firstItemId`: danh mục sắp xếp lại ở client
      (`sortPage`), nên dòng đầu không nhất thiết là mục đầu server trả.
    */
    const detail = await trpcQuery<{ playground: { ttlSeconds: number; title: string } }>(
      api,
      'playgrounds.get',
      { playgroundId },
    );
    const ttlMinutes = Math.round(detail.playground.ttlSeconds / 60);
    expect(
      ttlMinutes,
      `playgrounds.get trả ttlSeconds=${String(detail.playground.ttlSeconds)} ⇒ ${String(ttlMinutes)} phút. ` +
        'Một TTL 0 phút làm mọi khẳng định chuỗi bên dưới trở nên vô nghĩa.',
    ).toBeGreaterThan(0);

    /*
      AC 13.D mục 15, nửa đầu: TTL đọc được NGAY TRÊN DÒNG, trước cả khi mở sân
      chơi ra (`catalog.meta.ttl`). `BoardRow` vẽ phần meta HAI lần (một bản cho
      màn hẹp `md:hidden`, một bản cho màn rộng), nên lọc bản đang hiện, nếu không
      Playwright đỏ vì strict mode chứ không vì sản phẩm.
    */
    await expect(
      rows
        .first()
        .getByText(t('catalog.meta.ttl', { minutes: ttlMinutes }), { exact: true })
        .filter({ visible: true }),
      `Dòng '${detail.playground.title}' không nói TTL. Người học phải biết môi trường tự ` +
        'đóng sau bao lâu TRƯỚC KHI bấm vào, không chỉ trước khi bấm Bắt đầu.',
    ).toBeVisible();

    // ── 2. Mở sân chơi qua chính link của dòng ──────────────────────────────
    await rows.first().click();
    await page.waitForURL(`**/playgrounds/${playgroundId}`);
    await settle(page);

    const startButton = page.getByRole('button', { name: t('session.controls.start'), exact: true });
    const endButton = page.getByRole('button', { name: t('session.controls.end'), exact: true });
    const terminal = terminalSurface(page);

    /*
      Neo vào khoang phiên (`data-testid="dlp-session-controls"`), không đếm trên
      cả trang. Hai lý do đã trả giá:
      - `getByText('Sandbox sẵn sàng')` trần khớp HAI phần tử (badge của
        `SessionControls` và `SessionStatusPill` trên thanh khoang): hai chỗ nói
        cùng một pha là CHỦ Ý (`session-status.tsx`), không phải lỗi.
      - đếm `[aria-live="polite"]` toàn trang gom luôn container của Sonner (vùng
        thông báo toàn cục, mọi trang đều có). D10 chốt rằng *pha phiên* chỉ được
        đọc ra từ MỘT chỗ; đó là thứ ô dưới đếm.
    */
    const sessionRegion = page.getByTestId('dlp-session-controls');
    const announcer = sessionRegion.locator('[aria-live="polite"]');
    const ttlBadge = sessionRegion.getByText(t('session.controls.ttl-preview', { minutes: ttlMinutes }), {
      exact: true,
    });
    await expect(sessionRegion, 'Không thấy khoang điều khiển phiên — trang sân chơi đã đổi hình dạng?').toBeVisible();
    await expect(
      announcer,
      'Khoang phiên phải có ĐÚNG một vùng aria-live (D10). Nhiều hơn một ⇒ trình đọc màn hình ' +
        'đọc lặp mỗi lần đổi pha; không có ⇒ người dùng mù không bao giờ biết phiên đã sẵn sàng.',
    ).toHaveCount(1);

    // ── 3. TIỀN ĐỀ: TTL hiện TRƯỚC khi bắt đầu, và CHƯA có gì để nối ─────────
    // Thứ tự quan trọng: khẳng định TTL sau khi phiên đã mở là đo một badge khác
    // (đồng hồ thật), và ô AC vẫn xanh kể cả khi người học không được báo trước.
    await expect(startButton, 'không thấy nút "Bắt đầu" — trang sân chơi đã đổi hình dạng?').toBeVisible();
    await expect(
      ttlBadge,
      `Trước khi bấm Bắt đầu, trang KHÔNG nói phiên sống bao lâu (chờ badge ` +
        `"${t('session.controls.ttl-preview', { minutes: ttlMinutes })}"). Đây là AC 13.D mục 15.`,
    ).toBeVisible();
    // Neo vào `t()`: bản regex trước đỏ vì chữ HOA đầu câu, trong khi thông điệp lại
    // nói về "hai con số TTL khác nhau". `ttlMinutes` đi thẳng vào tham số của câu.
    await expect(
      page.getByText(t('session.playground.empty', { minutes: ttlMinutes })),
      'Khoang terminal chưa có phiên phải nói cùng con số TTL đó.',
    ).toBeVisible();

    // Đối chứng của mốc 1: chưa bắt đầu thì KHÔNG có khoang terminal nào.
    await expect(
      terminal,
      'Chưa bấm Bắt đầu mà đã có khoang terminal: "terminal nối được" bên dưới khi đó không ' +
        'còn phân biệt được với một khung vẽ sẵn.',
    ).toHaveCount(0);
    await expect(endButton).toBeHidden();

    // ── 4. Bắt đầu ──────────────────────────────────────────────────────────
    const { sessionId } = await startSandbox(page, 'playgrounds.start', rateLimited);

    // Đối chứng của mốc 2: badge TTL của NỘI DUNG phải biến mất.
    await expect(
      ttlBadge,
      'Phiên đã mở mà badge TTL của nội dung vẫn còn: nó vẽ vô điều kiện, và khi đó ô "TTL ' +
        'hiện trước khi bắt đầu" ở trên xanh mà không chứng minh gì.',
    ).toBeHidden();

    // ── 5. Terminal nối được: pha ready + byte PTY về ──────────────────────
    await expectTerminalLive(page, traffic);

    // ── 6. Shell CHẠY được, không chỉ vọng lại ────────────────────────────
    await typeInTerminal(page, SHELL_MARKER_CMD);
    await expectTerminalOutput(
      traffic,
      SHELL_MARKER_OUT,
      `Gõ \`${SHELL_MARKER_CMD}\` nhưng không thấy \`${SHELL_MARKER_OUT}\` quay về. Tiếng vọng ` +
        'của phím gõ mang HAI DẤU NHÁY, nên chuỗi này chỉ xuất hiện khi shell THỰC SỰ chạy ' +
        'lệnh. Không có nó thì "terminal nối được" mới chỉ là "socket mở".',
    );

    // ── 7. Kết thúc — và chứng minh ta nhả ĐÚNG phiên của mình ────────────
    await endSandbox(page, sessionId, 'session.reap');

    // ── 8. UI nói LÝ DO, không phải "đang nối lại" ────────────────────────
    // Câu này là chữ của `packages/terminal/src/session-machine.ts` (sự kiện
    // `ENDED`), không thuộc `packages/copy`, nên neo bằng regex có nguồn trích.
    await expect(
      announcer.getByText(/Bạn đã kết thúc phiên/),
      'Phiên đã chết nhưng UI không nói vì sao. `session-machine` đặt sẵn câu "Bạn đã kết thúc ' +
        'phiên…" cho đúng tình huống này; thiếu nó người học chỉ thấy màn hình đổi trạng thái.',
    ).toBeVisible({ timeout: 30_000 });

    // Pha phải về đúng `idle`: câu lý do và badge đến từ hai field khác nhau của
    // cùng một state, nên câu đúng mà badge vẫn kẹt được.
    await expect(
      announcer.getByText(t('session.phase.idle'), { exact: true }),
      'Câu lý do đã hiện nhưng badge pha không về "Chưa có phiên": một sự kiện muộn (close ' +
        'frame của gateway) đã ghi đè lên `ENDED`.',
    ).toBeVisible({ timeout: 30_000 });

    /*
      Đối chứng của mốc 4, nửa đắt giá nhất. `applyClose` chốt
      `RECONNECTABLE_FROM.idle = false` để chặn cảnh này: gateway đóng WS bằng 4404
      SAU khi reap, và nếu chốt đó hỏng thì một phiên người dùng CHỦ ĐỘNG kết thúc
      sẽ hiện ra như bị hệ thống giết. Regex bắt cả nhãn pha
      `session.phase.reconnecting` lẫn câu "Mất kết nối tới phiên (mã N)." của
      `session-machine.ts`.
    */
    await expect(
      page.getByText(/Mất kết nối/),
      'Sau khi tự bấm Kết thúc, UI lại nói "Mất kết nối…": câu của một phiên bị giật mất, ' +
        'kéo theo một vòng nối lại vào một phiên đã reap.',
    ).toBeHidden();

    // Vòng đời khép lại: quay về đúng trạng thái xuất phát, kể cả badge TTL.
    await expect(startButton, 'Nút "Bắt đầu" không quay lại sau khi kết thúc.').toBeVisible();
    await expect(startButton).toBeEnabled();
    await expect(
      terminal,
      'Phiên đã kết thúc mà khoang terminal vẫn còn — nó đang nối vào một phiên đã reap.',
    ).toHaveCount(0);
    await expect(
      ttlBadge,
      'Badge TTL không quay lại sau khi kết thúc, nên lượt mở phiên KẾ TIẾP sẽ không được báo trước.',
    ).toBeVisible();

    if (rateLimited.length > 0) {
      test.info().annotations.push({
        type: 'rate-limit',
        description:
          `Lượt này ăn ${String(rateLimited.length)} phản hồi 429 ở: ${rateLimited.join(', ')}. ` +
          'Mọi ô đỏ kèm theo phải được đọc là NHỊP CHẠY trước khi được đọc là lỗi sản phẩm.',
      });
    }
    if (traffic.controlFrames.length === 0) {
      test.info().annotations.push({
        type: 'chua-do',
        description:
          'Không bắt được control frame nào (text) từ gateway, nên vế "contract §5" chỉ được ' +
          'chứng gián tiếp qua badge pha.',
      });
    }
  });
});
