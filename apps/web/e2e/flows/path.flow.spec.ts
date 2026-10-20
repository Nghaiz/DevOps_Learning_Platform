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
 *
 * ── Trang sau bản dựng lại PTIT ─────────────────────────────────────────────
 * `path-client.tsx` vẽ lộ trình thành một tuyến dọc: MỘT
 * `<ol aria-label={t('catalog.path.stations')}>`, mỗi phần là một `<li>` (một
 * "ga") mang nhãn trạng thái, nút "Mở" và lý do khoá ngay tại ga. Mọi locator
 * dưới đây đi qua danh sách CÓ TÊN đó, không qua `ol > li`: selector CSS trần
 * khớp MỌI danh sách có thứ tự mà trang (hay vỏ ứng dụng) thêm vào sau này, và
 * đếm nhầm chúng mà không đỏ. Danh sách có tên chỉ khớp đúng thứ luồng định đo.
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

    // ⚠ CHỜ ga đầu tiên, rồi mới đếm. Lúc `paths.get` còn chạy, trang đã có
    // `h1` (tiêu đề "Đang tải lộ trình" của `PosterHeader`) nhưng chưa có danh
    // sách — `count()` không tự chờ, nên đếm ngay sau `h1` có thể ra 0 trên một
    // lộ trình đầy đủ.
    const stations = page.getByRole('list', { name: t('catalog.path.stations') });
    const stationItems = stations.getByRole('listitem');
    await expect(
      stationItems.first(),
      'Lộ trình render 0 phần. `path-client` hiện `EmptyState` khi lộ trình rỗng, ' +
        'nên 0 phần ở đây nghĩa là lộ trình trên cụm chưa có mắt xích nào — một ' +
        'vấn đề nội dung thật.',
    ).toBeVisible();
    const itemCount = await stationItems.count();
    expect(itemCount, 'Danh sách ga có mặt nhưng không có ga nào.').toBeGreaterThan(0);

    // ── 2. Ổ khoá — chiều (b) ───────────────────────────────────────────────
    // "Còn khoá" là `stateLabel` của `path-view.ts` cho `state: 'locked'`. Ga
    // mang nhãn đó KHÔNG được có nút "Mở".
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
    const openName = t('catalog.path.open');
    const lockedCards = stationItems.filter({ hasText: t('catalog.path.state.locked') });
    const lockedCount = await lockedCards.count();
    if (lockedCount > 0) {
      await expect(
        lockedCards.first().getByRole('button', { name: openName, exact: true }),
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
    // Tìm nút TRONG danh sách ga. Cột phải còn nút "Làm tiếp"
    // (`catalog.path.next-action`) cũng đi qua `openItem`; luồng này đo nút
    // "Mở" tại ga — chính thứ chiều (b) vừa khẳng định là vắng ở ga khoá.
    const openButton = page.getByRole('button', { name: openName, exact: true });
    const target = stationItems.filter({ has: openButton }).first();
    await expect(
      target,
      'Không phần nào mở được. Một lộ trình mà người học không vào được phần nào ' +
        'là lộ trình chết — kể cả khi trang render đẹp.',
    ).toBeVisible();

    // Tên phần, đọc TRƯỚC khi bấm, để bước 4 so được đích với đúng ga đã bấm.
    // Ga mở được luôn có tên thật: `path-view.ts` xếp mắt xích `title: null`
    // vào `missing`, và ga `missing` không có nút "Mở".
    const targetTitle = ((await target.getByRole('heading', { level: 2 }).textContent()) ?? '').trim();
    expect(targetTitle, 'Ga mở được mà tiêu đề rỗng.').not.toBe('');

    await target.getByRole('button', { name: openName, exact: true }).click();

    // `path-client` gọi `paths.openItem` rồi `router.push(href)`. Đích là một
    // trong ba loại nội dung, nên chờ ĐỔI ĐƯỜNG DẪN khỏi `/paths/...` thay vì
    // đoán trước đích — đoán đích sẽ đỏ ở lộ trình có mắt xích kiểu khác.
    await page.waitForURL(
      (url) => !url.pathname.startsWith('/paths/'),
      { timeout: 60_000 },
    );
    await settle(page);

    // Khẳng định ta ĐẾN nơi thật, không phải trang lỗi: `path-client` giữ
    // nguyên trang và hiện Alert ngay tại ga khi `openItem` từ chối, nên một
    // lượt bấm hỏng sẽ KHÔNG đổi đường dẫn — điều kiện trên đã bắt được. Ở đây
    // kiểm nốt rằng đích là một trang nội dung và không phải trang trống.
    //
    // Ba đích là `PATH_ITEM_KIND_BASE_HREF` của `path-view.ts` (bài học, lab,
    // trắc nghiệm). Bản trước cho cả `/playgrounds/` qua, nhưng không loại mắt
    // xích nào dẫn tới đó.
    const landed = new URL(page.url()).pathname;
    expect(
      landed,
      `Bấm "Mở" đưa tới ${landed}, không phải một trong ba loại nội dung. ` +
        `paths.openItem trả href sai, hoặc route đích chưa dựng.`,
    ).toMatch(/^\/(lessons|labs|quiz)\//);

    // ── 4. Đích là ĐÚNG phần đã bấm, và nó đã tải xong ──────────────────────
    // Bài học và lab là trang "immersive": không có đầu trang của site, `h1` duy
    // nhất nằm trong thanh `WorkspaceBar`. Trắc nghiệm giữ đầu trang, `h1` nằm
    // trong `ToolHeader`.
    //
    // ⚠ "Có `h1`" một mình KHÔNG đủ: trang trắc nghiệm vẽ `ToolHeader` cả lúc
    // đang tải ("Đang tải") lẫn lúc lỗi ("Trắc nghiệm"), nên `h1` hiện ra không
    // nói nội dung đã tới. Tiêu đề ga và tiêu đề trang đích đọc từ CÙNG nguồn
    // (`loadItemTitles` ở `server/paths/progress.ts` ↔ `scenario.title`,
    // `lab.title`, `quiz.title` của trang đích), nên so hai chuỗi chứng minh
    // được cả hai điều: đã tải xong, và đến đúng phần đã bấm.
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(
      heading,
      `Bấm "Mở" ở ga "${targetTitle}" nhưng trang đích mang tiêu đề khác — hoặc ` +
        `nội dung chưa tải xong (h1 đang tải/lỗi), hoặc paths.openItem dẫn sai phần.`,
    ).toHaveText(targetTitle);
  });
});
