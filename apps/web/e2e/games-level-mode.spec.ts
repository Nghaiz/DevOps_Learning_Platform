/**
 * Chế độ LEVEL của đấu trường K8s render được sau khi người chơi BẤM vào level.
 *
 * ══ Vì sao file này tồn tại, khi `games.spec.ts` đã bấm level từ lâu ═════════
 *
 * `phase-18-exec.md` §5.4 ghi *"không ô nào chứng minh chế độ LEVEL render
 * được"*. Đo lại 2026-09-15 thì câu đó **sai như đang viết**: `games.spec.ts`
 * gọi `chooseLevel(...)` ở ba ô. Vấn đề thật nằm một tầng thấp hơn và tệ hơn —
 * **ô đó chưa bao giờ CHẠY**. Job CI `web-a11y` chạy đúng `e2e:a11y`, và script
 * đó liệt kê `a11y.spec.ts csp.spec.ts`. `games.spec.ts` không nằm trong bất kỳ
 * lệnh nào CI gọi.
 *
 * Đó là lý do C1 sống sót: `arena-overlays.tsx` gọi `useProblemSubmit` vô điều
 * kiện, hook gọi `api.useUtils()`, và `app/games/layout.tsx` CỐ Ý không cấp
 * `TrpcQueryProvider` — nên đấu trường ném ngay khi người chơi chọn một level.
 * Trang `/games/k8s` vẫn tải bình thường vì nó mở ra màn CHỌN LEVEL, và màn đó
 * không render `ArenaOverlays`. Mọi ô chỉ TẢI trang đều xanh. Vá ở `c4fa97a`.
 *
 * ⛔ Bài học, và nó đắt hơn bản vá: một ô test không nằm trong lệnh nào CI chạy
 * thì **không phải một cổng**, nó là một tài liệu. `password-reset.spec.ts` đã
 * ghi đúng nhận xét này về chính nó từ trước. Nên file này cố ý ở lại trong
 * `e2e:ci` — nếu ai đó gỡ nó khỏi script đó, cổng biến mất mà không ai đỏ.
 *
 * ══ Vì sao KHÔNG gộp vào `games.spec.ts` ════════════════════════════════════
 *
 * `games.spec.ts` khẳng định render bằng WebGL, số draw call, và rò rỉ
 * geometry — chúng cần một cửa sổ đo cảnh 3D và chịu ảnh hưởng của runner. Ô ở
 * đây cố ý KHÔNG chạm tới cảnh: nó chỉ hỏi *"cây React có dựng được không"*,
 * nên nó rẻ, tất định, và chạy được trên runner không GPU. Kéo cả
 * `games.spec.ts` vào CI là kéo theo nguyên bộ đo GPU — một cách chắc chắn để
 * cổng này trở nên lung lay rồi bị tắt.
 *
 * ══ Chạy ════════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ORIGIN=http://localhost:3000 pnpm --filter @devops-platform/web e2e games-level-mode
 */

import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';

const GAME_PATH = '/games/k8s';

/**
 * Nút chính của màn chọn level (`level-picker.tsx`).
 *
 * Nhắm nút CTA chứ không nhắm một tiêu đề level cụ thể, có chủ ý: một ô ghim
 * tên level sẽ đỏ vào ngày ai đó đổi nội dung dạy học, và nó sẽ đỏ với thông
 * điệp *"đấu trường hỏng"* trong khi đấu trường hoàn toàn khoẻ. Nút này tồn tại
 * bất kể danh sách level là gì.
 */
const PICK_LEVEL = /^(Bắt đầu|Tiếp tục):/;

/**
 * Điều khiển do `ArenaOverlays` render (`hud/arena-dock.tsx`).
 *
 * ⚠ Phải khẳng định một thứ BÊN TRONG `ArenaOverlays`, không phải chỉ khung
 * `.arena-root`. C1 ném từ chính `ArenaOverlays`, và một ô chỉ hỏi "khung có
 * không" sẽ đọc ra kết quả đúng vì lý do sai ở ngày mà React đổi cách lan lỗi.
 */
const HUD_CONTROL = 'Cài đặt';

interface PageFaults {
  readonly uncaught: readonly string[];
  readonly consoleErrors: readonly string[];
}

/**
 * Thu lỗi trình duyệt để ĐÍNH KÈM, không phải để làm cổng.
 *
 * Cổng là phép khẳng định DOM ở dưới. Lý do: một lỗi React bị error boundary
 * bắt có thể KHÔNG nổi lên `pageerror` — hành vi đó khác nhau giữa bản dev và
 * bản dựng, và giữa các phiên bản React. Dựng cổng trên `pageerror` là dựng
 * trên một thứ có thể im lặng đúng lúc cần nó nói. Nhưng khi ô đỏ thì danh sách
 * này là thứ đọc ra NGAY nguyên nhân, nên nó đáng thu.
 */
function collectFaults(page: Page): () => PageFaults {
  const uncaught: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => uncaught.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  return () => ({ uncaught, consoleErrors });
}

async function attachFaults(testInfo: TestInfo, faults: PageFaults): Promise<void> {
  await testInfo.attach('loi-trinh-duyet', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(faults, null, 2)),
  });
}

test.describe('đấu trường K8s — chế độ LEVEL', () => {
  test('bấm vào một level ⇒ đấu trường dựng được, không rơi vào error boundary', async ({
    page,
  }, testInfo) => {
    const faults = collectFaults(page);

    await openScreen(page, GAME_PATH, 'anon');

    // Tiền đề: đây là màn CHỌN LEVEL, chưa phải đấu trường. Không có nó thì một
    // trang đã ở sẵn trong đấu trường cũng làm ô dưới xanh mà chẳng bấm gì.
    const pick = page.getByRole('button', { name: PICK_LEVEL }).first();
    await expect(
      pick,
      `${GAME_PATH} không hiện nút chọn level. Màn chọn level đã đổi hình, hoặc chính ` +
        `trang này đã hỏng trước cả bước bấm — hai ca khác nhau, xem 'loi-trinh-duyet'.`,
    ).toBeVisible({ timeout: 20_000 });

    await pick.click();
    await settle(page);

    const arena = page.locator('.arena-root');
    const hud = page.getByRole('button', { name: HUD_CONTROL, exact: true }).first();

    const seen = faults();
    await attachFaults(testInfo, seen);

    await expect(
      arena,
      `Bấm vào level xong mà '.arena-root' không dựng. Đây ĐÚNG hình dạng C1 ` +
        `(c4fa97a): trang tải sạch, chỉ ném khi người chơi chọn level. Lỗi thu được: ` +
        `${seen.uncaught.join(' | ') || '(không có pageerror — đọc consoleErrors trong file đính kèm)'}`,
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      hud,
      `'.arena-root' có nhưng HUD của 'ArenaOverlays' không render. C1 ném từ ĐÚNG ` +
        `component này, nên đây là nửa quan trọng hơn của phép kiểm.`,
    ).toBeVisible({ timeout: 30_000 });
  });
});
