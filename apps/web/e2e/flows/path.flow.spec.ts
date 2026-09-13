/**
 * Luồng 4 — lộ trình: mở path detail → đọc ổ khoá → mở một item
 * (`phase-13.md:74`).
 *
 * ── Ổ khoá là thứ ĐÁNG kiểm nhất ở đây ──────────────────────────────────────
 * Một lộ trình tuần tự chỉ mở item kế tiếp khi item trước đã đạt
 * (`paths.openItem` từ chối phần còn khoá). Nếu FE vẽ nút "Mở" cho MỌI item thì
 * người học bấm và ăn lỗi từ server — trải nghiệm hỏng, mà không phép kiểm hình
 * thức nào bắt được: trang vẫn render, vẫn đủ chữ, axe vẫn sạch.
 *
 * Nên luồng này khẳng định HAI chiều, không chỉ chiều "mở được":
 *   (a) item mở được thì có nút "Mở" và bấm nó ĐI TỚI nội dung;
 *   (b) item còn khoá thì KHÔNG có nút "Mở" và có nhãn "Còn khoá".
 *
 * Chiều (b) là thứ hay bị bỏ. Một lộ trình mà mọi item đều đã đạt sẽ không có
 * item khoá nào để kiểm — luồng ghi nhận điều đó thay vì im lặng đi qua.
 */

import { t } from '@devops-platform/copy';
import { expect, test } from './flow-kit';
import { firstItemId } from '../fixtures/api';
import { openScreen, settle } from '../fixtures/nav';

test.describe('luồng 4 — lộ trình', { tag: '@flow' }, () => {
  test('path detail → ổ khoá → mở item', async ({ page, api }) => {
    const pathId = await firstItemId(api, 'paths.list');
    expect(
      pathId,
      'paths.list trả 0 mục nên không có lộ trình nào để đi luồng này. Danh mục ' +
        'rỗng là vấn đề của bản deploy, không phải của harness.',
    ).not.toBeNull();

    await openScreen(page, `/paths/${encodeURIComponent(pathId ?? '')}`, 'user');

    // ── 1. Trang chi tiết có tiến độ và danh sách phần ──────────────────────
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const itemCount = await page.locator('ol > li').count();
    expect(
      itemCount,
      'Lộ trình render 0 phần. `path-client` hiện `EmptyState` khi lộ trình rỗng, ' +
        'nên 0 phần ở đây nghĩa là lộ trình trên cụm chưa có mắt xích nào — một ' +
        'vấn đề nội dung thật.',
    ).toBeGreaterThan(0);

    // ── 2. Ổ khoá — chiều (b) ───────────────────────────────────────────────
    // "Còn khoá" là `stateLabel` của `path-view.ts` cho `state: 'locked'`. Item
    // mang nhãn đó KHÔNG được có nút "Mở" cạnh nó.
    /*
      ⚠ Chuỗi lấy từ BẢN ĐỒ COPY, không viết thẳng vào spec.

      Bản trước ghi thẳng `'Còn khoá — hoàn thành phần trước đó thì phần này tự
      mở.'` với một gạch ngang dài. Copy sau đó đổi sang dấu phẩy ở `746c932`
      ("copy mới, và bỏ hai gạch ngang dài") và ô này đỏ — không phải vì sản
      phẩm sai, mà vì spec giữ một bản chép đã lỗi thời. Một chuỗi viết thẳng
      trong harness là một bản sao thứ hai của dữ liệu, và bản sao thì trôi.

      Đọc qua `t()` thì phép kiểm nói đúng điều nó muốn nói: "trang hiện ĐÚNG
      câu mà bản đồ copy khai cho trạng thái này", bất kể câu đó là gì hôm nay.
    */
    const lockedCards = page.locator('ol > li').filter({ hasText: t('catalog.path.state-locked') });
    const lockedCount = await lockedCards.count();
    if (lockedCount > 0) {
      await expect(
        lockedCards.first().getByRole('button', { name: 'Mở', exact: true }),
        'Một phần mang nhãn "Còn khoá" nhưng vẫn có nút "Mở". FE đang mời người ' +
          'học bấm vào thứ server sẽ từ chối — ổ khoá chỉ còn ở tầng server.',
      ).toHaveCount(0);
      await expect(
        lockedCards.first().getByText(t('catalog.path.note-locked')),
        'Phần bị khoá không nói lý do. Một ổ khoá câm đọc ra như trang hỏng.',
      ).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'chua-do',
        description:
          `Lộ trình '${pathId ?? ''}' không có phần nào ở trạng thái "Còn khoá" ở ` +
          `lượt này (tài khoản đã đạt hết, hoặc lộ trình không tuần tự), nên chiều ` +
          `"khoá thì không có nút Mở" KHÔNG được kiểm.`,
      });
    }

    // ── 3. Mở item — chiều (a) ──────────────────────────────────────────────
    const openButtons = page.getByRole('button', { name: 'Mở', exact: true });
    await expect(
      openButtons.first(),
      'Không phần nào mở được. Một lộ trình mà người học không vào được phần nào ' +
        'là lộ trình chết — kể cả khi trang render đẹp.',
    ).toBeVisible();

    await openButtons.first().click();

    // `path-client` gọi `paths.openItem` rồi `router.push(href)`. Đích là một
    // trong bốn loại nội dung, nên chờ ĐỔI ĐƯỜNG DẪN khỏi `/paths/...` thay vì
    // đoán trước đích — đoán đích sẽ đỏ ở lộ trình có mắt xích kiểu khác.
    await page.waitForURL(
      (url) => !url.pathname.startsWith('/paths/'),
      { timeout: 60_000 },
    );
    await settle(page);

    // Khẳng định ta ĐẾN nơi thật, không phải trang lỗi: `path-client` giữ
    // nguyên trang và hiện Alert khi `openItem` từ chối, nên một lượt bấm hỏng
    // sẽ KHÔNG đổi đường dẫn — điều kiện trên đã bắt được. Ở đây kiểm nốt rằng
    // đích không phải trang trống.
    const landed = new URL(page.url()).pathname;
    expect(
      landed,
      `Bấm "Mở" đưa tới ${landed}, không phải một trong bốn loại nội dung. ` +
        `paths.openItem trả href sai, hoặc route đích chưa dựng.`,
    ).toMatch(/^\/(lessons|labs|playgrounds|quiz)\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
