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
 * ~30–50 giây dựng một sandbox trống thì phải biết trước nó sống bao lâu. Không
 * luồng nào trong sáu luồng cũ khẳng định điều đó, và một ô AC "3/4" đọc ra
 * thành "cái thứ tư cũng gần giống thôi" thì sai: nó là cái duy nhất có yêu cầu
 * này.
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
 * Cặp thứ ba: harness gõ `echo DLP''E2E-OK`. PTY echo lại đúng chuỗi ĐÃ GÕ
 * (có hai dấu nháy), còn shell chỉ in ra `DLPE2E-OK` khi nó THỰC SỰ chạy lệnh.
 * Tìm chuỗi không-dấu-nháy vì thế phân biệt được "socket mở và echo" với
 * "sandbox thật sự chạy" — hai thứ mà một phép đếm byte trần không tách nổi.
 *
 * ── Cạm bẫy đã trả giá, và cách luồng này né ────────────────────────────────
 * 1. **429 giả trang thành lỗi sản phẩm.** Cụm dùng chung có rate-limit ở
 *    Traefik (`ratelimit-web` 120/1m, burst 60, đếm theo IP nguồn) và một trần
 *    quota ở orchestrator. Cả hai trả 429, và cả hai đọc ra trên DOM y hệt một
 *    lỗi ứng dụng. Nên luồng này **đọc mã trạng thái của chính lượt gọi**
 *    `playgrounds.start` chứ không đọc băng lỗi trên trang rồi đoán — cùng kỷ
 *    luật mà `flow-kit.signInThroughForm` đã phải học ở lượt 09-07.
 * 2. **Kết thúc phiên là tác dụng phụ không hoàn tác được trên cụm dùng
 *    chung.** Luồng khẳng định request `session.reap` mang ĐÚNG `sessionId` mà
 *    chính nó vừa tạo. Không phải trang trí: nút "Kết thúc phiên" bấm được ở
 *    mọi pha có `sessionId`, nên một trang mở nhầm phiên của người khác vẫn cho
 *    ra một lượt bấm "thành công".
 * 3. **Trần chỗ hiện đang SAI và đã ghi nợ** (`phase-13.md:96-98`: UI in
 *    "còn N chỗ" trong khi server trả 429, vì `CAPACITY_HARD_LIMIT` mã hoá giả
 *    định mọi phiên đều profile mặc định). Nếu `start` trả 429 vì hết chỗ,
 *    thông báo dưới đây nói thẳng đó là món nợ ĐÃ GHI — để lượt sau không ghi
 *    nó thành một phát hiện mới.
 * 4. **Không `kubectl delete pod` để dọn.** Đường nhả phiên duy nhất ở đây là
 *    nút "Kết thúc phiên" của chính trang; khối `finally` chỉ bấm lại đúng nút
 *    đó khi luồng đỏ giữa chừng. Xoá pod bằng tay làm lệch warm pool và
 *    orchestrator sẽ giao tên pod đã chết cho người kế tiếp.
 *
 * ── `E2E_REQUIRE_SESSION` KHÔNG xuất hiện ở đây, có chủ ý ───────────────────
 * Ba ô D10 trong `keyboard.spec.ts` `skip` khi không mở được phiên, nên chúng
 * cần cờ đó để lượt skip thành đỏ (§3ter mục 7). Luồng này thì phiên sandbox LÀ
 * toàn bộ nội dung — một lượt "bỏ qua vì không có sandbox" không còn đo gì cả,
 * nên nó không có nhánh skip nào để cờ gác. Không mở được phiên ⇒ ĐỎ, luôn.
 * Ghi ra đây để người sau grep cờ đó và không thấy thì biết là cố ý.
 */

import {
  SANDBOX_FLOW_TIMEOUT_MS,
  SESSION_READY_TIMEOUT_MS,
  expect,
  test,
} from './flow-kit';
import { trpcQuery } from '../fixtures/api';
import { openScreen, settle } from '../fixtures/nav';

/**
 * Chuỗi gõ vào terminal, và chuỗi PHẢI quay về.
 *
 * Hai dấu nháy rỗng ở giữa là cả mẹo: `echo DLP''E2E-OK` gõ ra 16 ký tự mà PTY
 * echo lại nguyên văn (có nháy), trong khi shell chỉ in `DLPE2E-OK` sau khi
 * ĐÃ chạy lệnh. Tìm `MARKER_OUT` vì thế không thể khớp nhầm với tiếng vọng của
 * chính phím ta gõ — điều mà một marker trần (`echo XYZ`) không bảo đảm được.
 */
const MARKER_CMD = "echo DLP''E2E-OK";
const MARKER_OUT = 'DLPE2E-OK';

/** Kết quả tRPC đã bóc vỏ batch. Xem `readTrpcResponse`. */
type TrpcEnvelope = {
  readonly error?: { readonly message?: string };
  readonly result?: { readonly data?: unknown };
};

/**
 * Bóc `data` khỏi phản hồi tRPC.
 *
 * `httpBatchLink` gói phản hồi trong MỘT MẢNG kể cả khi chỉ có một lời gọi
 * (`lib/trpc-react.tsx` + `lib/trpc.ts` đều dùng link này). Đọc thẳng
 * `body.result` sẽ ra `undefined` — im lặng, và mọi khẳng định phía sau đo trên
 * một `sessionId` rỗng.
 */
function unwrapTrpc(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  const first = (Array.isArray(parsed) ? parsed[0] : parsed) as TrpcEnvelope | undefined;
  if (first?.error !== undefined) {
    throw new Error(`tRPC trả lỗi: ${first.error.message ?? JSON.stringify(first.error)}`);
  }
  return first?.result?.data;
}

test.describe('luồng 7 — sân chơi', { tag: '@flow' }, () => {
  test('TTL trước khi bắt đầu → mở sandbox → terminal sống → kết thúc có lý do', async ({
    page,
    api,
  }) => {
    test.setTimeout(SANDBOX_FLOW_TIMEOUT_MS);

    /*
      Máy thu 429 cho CẢ lượt chạy. Traefik chặn ở tầng điều hướng lẫn tầng
      tRPC, và dạng thứ hai (`procName: "too_many_requests"`) trông y hệt một
      lỗi ứng dụng. Gom lại để mọi thông báo lỗi bên dưới nói ra được rằng nhịp
      chạy — chứ không phải sản phẩm — mới là thứ hỏng.
    */
    const rateLimited: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 429) rateLimited.push(new URL(res.url()).pathname);
    });

    /*
      Byte đi VỀ từ gateway. Đăng ký TRƯỚC khi mở phiên: WebSocket được tạo ngay
      khi `TerminalSurface` mount, nên một listener gắn sau đó bỏ lỡ đúng những
      frame đầu tiên — trong đó có dấu nhắc shell.

      Text frame = control JSON (contract §5); binary frame = byte PTY. Tách hai
      loại vì chúng chứng minh hai chuyện khác nhau: control `ready` chứng minh
      gateway đã attach, byte binary chứng minh có thứ gì đó ở đầu kia đang nói.
    */
    let ptyBytes = 0;
    let ptyText = '';
    const controlFrames: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const payload = frame.payload;
        if (typeof payload === 'string') {
          controlFrames.push(payload);
          return;
        }
        ptyBytes += payload.length;
        ptyText += payload.toString('utf8');
      });
    });

    // ── 1. Danh mục sân chơi ────────────────────────────────────────────────
    await openScreen(page, '/playgrounds', 'user');
    await expect(page.getByRole('heading', { name: 'Sân chơi', level: 1 })).toBeVisible();

    // Thẻ danh mục LÀ một link (`CatalogCard`). Danh mục rỗng ⇒ đỏ, không skip:
    // nội dung nạp từ image, nên rỗng là vấn đề của bản deploy.
    const cards = page.locator('a[href^="/playgrounds/"]');
    await expect(
      cards.first(),
      'Danh mục sân chơi không có thẻ nào. Nội dung nạp từ image — danh mục rỗng ' +
        'là vấn đề của bản deploy, không phải của harness.',
    ).toBeVisible();

    const href = await cards.first().getAttribute('href');
    expect(href, 'thẻ sân chơi đầu tiên không có href').not.toBeNull();
    const playgroundId = decodeURIComponent((href ?? '').replace(/^\/playgrounds\//, ''));
    expect(playgroundId, `href '${href ?? ''}' không tách ra được id`).not.toBe('');

    /*
      TTL KỲ VỌNG lấy từ API cho ĐÚNG id vừa chọn, không hằng số chép tay.

      Hai lý do, cả hai đã có tiền lệ trong repo này: (a) một số 30 gõ cứng sẽ
      đỏ ở mọi nội dung khác và người sau sẽ "sửa" bằng cách đổi số, biến phép
      kiểm thành một phép chép; (b) đây đồng thời là phép so UI ↔ nguồn — nếu
      trang in TTL từ một chỗ khác với thứ `playgrounds.get` trả, ô này đỏ, và
      đó chính xác là lỗi AC 13.D mục 15 nói tới.

      Dùng id LẤY TỪ THẺ chứ không `firstItemId`: `playgrounds-client` sắp xếp
      lại ở client (`sortPage`), nên thẻ đầu tiên không nhất thiết là mục đầu
      tiên server trả. So TTL của mục A với thẻ của mục B là một ô đỏ nói dối.
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
        'Một TTL 0 phút làm mọi khẳng định chuỗi bên dưới trở nên vô nghĩa (khớp ' +
        'với một badge trống cũng được).',
    ).toBeGreaterThan(0);

    // AC 13.D mục 15, nửa đầu: TTL phải đọc được NGAY TRÊN THẺ, trước cả khi mở
    // sân chơi ra — không chỉ trước khi bấm "Bắt đầu" ở bên trong.
    await expect(
      cards.first().getByText(new RegExp(`Tự đóng sau\\s*${String(ttlMinutes)}\\s*phút`)),
      `Thẻ '${detail.playground.title}' không nói TTL. Người học phải biết môi ` +
        `trường tự đóng sau bao lâu TRƯỚC KHI bấm vào, không chỉ trước khi bấm Bắt đầu.`,
    ).toBeVisible();

    // ── 2. Mở sân chơi qua chính link của thẻ ───────────────────────────────
    // Đi bằng link thật, không `goto`: một thẻ danh mục hỏng href là lỗi thật
    // mà `goto` đi vòng qua.
    await cards.first().click();
    await page.waitForURL(`**/playgrounds/${playgroundId}`);
    await settle(page);

    const startButton = page.getByRole('button', { name: 'Bắt đầu', exact: true });
    const endButton = page.getByRole('button', { name: 'Kết thúc phiên' });
    const terminal = page.getByTestId('dlp-terminal');
    const ttlBadge = page.getByText(new RegExp(`Phiên kéo dài\\s*${String(ttlMinutes)}\\s*phút`));

    /*
      Nhãn pha PHẢI đọc trong vùng aria-live, không đọc trần trên cả trang.

      Đo 2026-09-08: `getByText('Sandbox sẵn sàng')` trần trụi khớp HAI phần tử
      — badge trong `SessionControls` và `SessionStatusPill` trên đầu khoang
      terminal — và Playwright đỏ vì strict mode. Đó là lỗi của harness, không
      phải của sản phẩm: hai chỗ nói cùng một pha là CHỦ Ý (`session-status.tsx`
      giải thích vì sao — câu hỏi "terminal còn sống không" nảy ra khi mắt đang
      ở terminal, không phải ở đầu trang).

      Neo vào vùng sống thì vừa hết mơ hồ vừa khẳng định thêm một thứ có giá:
      D10 chốt trang chỉ được có ĐÚNG MỘT vùng aria-live, và ô `toHaveCount(1)`
      dưới đây là chỗ duy nhất trong suite luồng nói ra điều đó. Hai vùng sống
      thì trình đọc màn hình đọc hai lần cho một lần đổi pha.
    */
    const announcer = page.locator('[aria-live="polite"]');
    await expect(
      announcer,
      'Trang sân chơi phải có ĐÚNG một vùng aria-live (D10). Nhiều hơn một ⇒ trình ' +
        'đọc màn hình đọc lặp mỗi lần đổi pha; không có cái nào ⇒ người dùng mù không ' +
        'bao giờ biết phiên đã sẵn sàng.',
    ).toHaveCount(1);

    // ── 3. TIỀN ĐỀ: TTL hiện TRƯỚC khi bắt đầu, và CHƯA có gì để nối ─────────
    // Thứ tự quan trọng: cả bốn khẳng định dưới đây chạy TRƯỚC cú bấm Bắt đầu.
    // Khẳng định TTL sau khi phiên đã mở là đo một cái badge khác (đồng hồ
    // thật), và ô AC vẫn xanh kể cả khi người học không hề được báo trước.
    await expect(
      startButton,
      'không thấy nút "Bắt đầu" — trang sân chơi đã đổi hình dạng?',
    ).toBeVisible();
    await expect(
      ttlBadge,
      `Trước khi bấm Bắt đầu, trang KHÔNG nói phiên sống bao lâu (chờ badge ` +
        `"Phiên kéo dài ${String(ttlMinutes)} phút"). Đây là AC 13.D mục 15 và là thứ ` +
        `phân biệt sân chơi với ba trình học kia: người ta bỏ ~40 giây dựng một ` +
        `sandbox trống thì phải biết trước nó tự đóng khi nào.`,
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp(`phiên tự đóng sau\\s*${String(ttlMinutes)}\\s*phút`)),
      'Khoang terminal chưa có phiên phải nói cùng con số TTL đó. Hai chỗ trên ' +
        'cùng một màn hình nói hai con số khác nhau còn tệ hơn không nói.',
    ).toBeVisible();

    // Đối chứng của mốc 1: chưa bắt đầu thì KHÔNG có khoang terminal nào. Không
    // có vế này, một trang vẽ sẵn terminal rỗng vẫn qua được mọi ô ở trên.
    await expect(
      terminal,
      'Chưa bấm Bắt đầu mà đã có khoang terminal. Khi đó mọi khẳng định "terminal ' +
        'nối được" bên dưới không còn phân biệt được với một khung vẽ sẵn.',
    ).toHaveCount(0);
    await expect(endButton).toBeHidden();

    let sessionId = '';
    try {
      // ── 4. Bắt đầu — ĐỌC MÃ TRẠNG THÁI, đừng đọc DOM rồi đoán ─────────────
      const startResponse = page.waitForResponse(
        (res) =>
          res.url().includes('/api/trpc/playgrounds.start') && res.request().method() === 'POST',
        { timeout: 90_000 },
      );
      await startButton.click();
      const res = await startResponse;

      if (res.status() === 429) {
        const body = (await res.text()).slice(0, 400);
        throw new Error(
          body.includes('trần số sandbox đồng thời')
            ? 'playgrounds.start trả 429 vì CỤM HẾT CHỖ (trần sandbox đồng thời). Đây là ' +
              'MÓN NỢ ĐÃ GHI ở phase-13.md:96-98 — "còn N chỗ" trên UI đếm theo trần mặc ' +
              'định 256Mi trong khi quota thật tính theo profile — KHÔNG phải phát hiện ' +
              `mới và KHÔNG vá ở lane này. Thân: ${body}`
            : 'playgrounds.start trả 429 vì RATE LIMIT (Traefik `ratelimit-web` 120/1m ' +
              'burst 60, đếm theo IP nguồn), KHÔNG phải sản phẩm hỏng. Giãn nhịp: ' +
              `\`e2e/scripts/paced-run.sh e2e/flows/playground.flow.spec.ts --batch 1\`. Thân: ${body}`,
        );
      }
      if (!res.ok()) {
        throw new Error(
          `playgrounds.start trả HTTP ${String(res.status())}: ${(await res.text()).slice(0, 300)}` +
            (rateLimited.length > 0 ? ` — trong lượt này đã có 429 ở: ${rateLimited.join(', ')}` : ''),
        );
      }

      const data = unwrapTrpc(await res.text()) as { sessionId?: string } | undefined;
      sessionId = data?.sessionId ?? '';
      expect(
        sessionId,
        'playgrounds.start trả 200 nhưng không có `sessionId` trong body. Không có nó ' +
          'thì bước kết thúc bên dưới không chứng minh được là ta nhả ĐÚNG phiên của mình.',
      ).not.toBe('');

      // Dấu hiệu quan sát được của "phiên đã có id" — `SessionControls` chỉ vẽ
      // nút Kết thúc khi `state.sessionId !== null` (C5).
      await expect(
        endButton,
        'Phiên đã được cấp ở server nhưng UI không bao giờ vào trạng thái có phiên.',
      ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });

      // Đối chứng của mốc 2: badge TTL của NỘI DUNG phải biến mất. Xem bảng ở
      // đầu file — đây là vế biến phép kiểm TTL thành cổng hai chiều.
      await expect(
        ttlBadge,
        'Phiên đã mở mà badge TTL của nội dung vẫn còn. `SessionControls` chỉ vẽ nó ' +
          'khi chưa có phiên; còn nghĩa là nó vẽ vô điều kiện, và khi đó ô "TTL hiện ' +
          'trước khi bắt đầu" ở trên xanh mà không chứng minh gì.',
      ).toBeHidden();

      // ── 5. Terminal nối được: control `ready` + byte PTY về ────────────────
      await expect(
        terminal,
        'Có sessionId nhưng khoang terminal không bao giờ hiện ra.',
      ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });

      await expect(
        announcer.getByText('Sandbox sẵn sàng'),
        'Badge pha không bao giờ tới "Sandbox sẵn sàng". Gateway chưa gửi control ' +
          '`ready` (contract §5), hoặc parser đã bỏ frame đó — đúng chế độ hỏng đã ' +
          'ghi ở `protocol.ts`: terminal vẽ được prompt nhưng badge đứng ở "Đang kết ' +
          'nối…" mãi mãi, không log, không lỗi.',
      ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });

      await expect
        .poll(() => ptyBytes, {
          timeout: 60_000,
          message:
            'WebSocket mở nhưng KHÔNG một byte PTY nào đi về. Không có dấu nhắc shell ' +
            'nghĩa là pod chưa attach — một khoang terminal đen cũng "hiện ra" và mọi ' +
            'phép kiểm hình thức vẫn xanh trên nó.',
        })
        .toBeGreaterThan(0);

      // ── 6. Shell CHẠY được, không chỉ vọng lại ────────────────────────────
      const textarea = terminal.locator('textarea').first();
      await textarea.waitFor({ state: 'attached', timeout: 30_000 });
      await textarea.focus();
      await page.keyboard.type(MARKER_CMD);
      await page.keyboard.press('Enter');

      await expect
        .poll(() => ptyText, {
          timeout: 60_000,
          message:
            `Gõ \`${MARKER_CMD}\` nhưng không thấy \`${MARKER_OUT}\` quay về. Tiếng vọng ` +
            `của phím gõ mang HAI DẤU NHÁY, nên chuỗi này chỉ xuất hiện khi shell THỰC ` +
            `SỰ chạy lệnh. Không có nó thì "terminal nối được" mới chỉ là "socket mở".`,
        })
        .toContain(MARKER_OUT);

      // ── 7. Kết thúc — và chứng minh ta nhả ĐÚNG phiên của mình ────────────
      const reapRequest = page.waitForRequest(
        (req) => req.url().includes('/api/trpc/session.reap') && req.method() === 'POST',
        { timeout: 60_000 },
      );
      const reapResponse = page.waitForResponse(
        (r) => r.url().includes('/api/trpc/session.reap') && r.request().method() === 'POST',
        { timeout: 60_000 },
      );
      await endButton.click();

      const sentReap = await reapRequest;
      expect(
        sentReap.postData() ?? '',
        `Lượt \`session.reap\` KHÔNG mang sessionId '${sessionId}' mà chính luồng này vừa ` +
          'tạo. Nút "Kết thúc phiên" bấm được ở mọi pha có sessionId, nên một trang giữ ' +
          'nhầm phiên của người khác vẫn cho ra một cú bấm "thành công" — trên cụm dùng ' +
          'chung đó là tác dụng phụ không hoàn tác được.',
      ).toContain(sessionId);

      const reaped = await reapResponse;
      expect(
        reaped.ok(),
        `session.reap trả HTTP ${String(reaped.status())}. Phiên có thể vẫn đang giữ một ` +
          'khe quota của cụm.',
      ).toBe(true);

      // ── 8. UI nói LÝ DO, không phải "đang nối lại" ────────────────────────
      await expect(
        endButton,
        'Bấm Kết thúc nhưng nút vẫn còn — máy trạng thái chưa nhận `ENDED`.',
      ).toBeHidden({ timeout: 60_000 });

      await expect(
        announcer.getByText(/Bạn đã kết thúc phiên/),
        'Phiên đã chết nhưng UI không nói vì sao. `session-machine` đặt sẵn câu "Bạn đã ' +
          'kết thúc phiên. Bấm Bắt đầu để mở phiên mới." đúng cho tình huống này; thiếu ' +
          'nó thì người học chỉ thấy màn hình đổi trạng thái mà không biết ai làm.',
      ).toBeVisible({ timeout: 30_000 });

      // Và pha phải về đúng `idle`, không dừng ở một pha lỡ dở. Câu lý do ở
      // trên có thể đúng trong khi badge vẫn kẹt — hai thứ đến từ hai field
      // khác nhau của cùng một state.
      await expect(
        announcer.getByText('Chưa có phiên'),
        'Câu lý do đã hiện nhưng badge pha không về "Chưa có phiên". `ENDED` phải đưa ' +
          'máy trạng thái về `initialState`; kẹt ở pha khác nghĩa là một sự kiện muộn ' +
          '(close frame của gateway) đã ghi đè lên nó.',
      ).toBeVisible({ timeout: 30_000 });

      // Đối chứng của mốc 4 — và là nửa đắt giá nhất. `applyClose` chốt
      // `RECONNECTABLE_FROM.idle = false` ĐÚNG để chặn cảnh này: gateway đóng
      // WS bằng 4404 SAU khi reap xong, và nếu chốt đó hỏng thì một phiên người
      // dùng CHỦ ĐỘNG kết thúc sẽ hiện ra như bị hệ thống giết.
      await expect(
        page.getByText(/Mất kết nối/),
        'Sau khi tự bấm Kết thúc, UI lại nói "Mất kết nối — đang thử lại…". Đó là câu ' +
          'của một phiên bị giật mất, không phải của một phiên người dùng tự đóng — và ' +
          'nó còn kéo theo một vòng nối lại vào một phiên đã reap.',
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
        'Badge TTL không quay lại sau khi kết thúc, nên lượt mở phiên KẾ TIẾP sẽ không ' +
          'được báo trước.',
      ).toBeVisible();
    } finally {
      /*
        Lưới an toàn, KHÔNG phải một bước đo. Nếu luồng đỏ ở giữa (mục 5/6), một
        phiên thật vẫn đang giữ một khe quota tới hết TTL và luồng CHẠY SAU sẽ
        đỏ vì hết chỗ — lỗi hiện ra ở nhầm chỗ.

        Chỉ bấm lại ĐÚNG cái nút của trang này (tức đúng phiên của luồng này);
        không `kubectl delete pod`, không gọi API bằng tay. Nuốt lỗi có chủ ý:
        khối này chạy CẢ khi test đã đỏ, và một ngoại lệ ở đây sẽ thay thế lý do
        đỏ thật bằng một lý do dọn dẹp.
      */
      if (await endButton.count()) {
        test.info().annotations.push({
          type: 'don-dep',
          description:
            `Luồng đỏ khi phiên '${sessionId}' còn sống — đã bấm "Kết thúc phiên" ở khối ` +
            `finally để nhả khe quota. Kết quả đo bên trên KHÔNG tính vế kết thúc.`,
        });
        await endButton.click().catch(() => undefined);
        await endButton.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);
      }

      if (rateLimited.length > 0) {
        test.info().annotations.push({
          type: 'rate-limit',
          description:
            `Lượt này ăn ${String(rateLimited.length)} phản hồi 429 ở: ${rateLimited.join(', ')}. ` +
            `Mọi ô đỏ kèm theo phải được đọc là NHỊP CHẠY trước khi được đọc là lỗi sản phẩm.`,
        });
      }

      if (controlFrames.length === 0 && sessionId !== '') {
        test.info().annotations.push({
          type: 'chua-do',
          description:
            'Không bắt được control frame nào (text) từ gateway, nên vế "contract §5" chỉ ' +
            'được chứng gián tiếp qua badge pha.',
        });
      }
    }
  });
});
