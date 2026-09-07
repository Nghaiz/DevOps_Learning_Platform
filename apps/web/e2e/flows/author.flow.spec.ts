/**
 * Luồng 5 — soạn bài: tạo → sửa → kiểm tra → xuất bản → thấy kết quả
 * (`phase-13.md:74`, 13.F).
 *
 * ── Cổng vai trò ────────────────────────────────────────────────────────────
 * `requireRole(account, 'author')` là dòng đầu tiên, và nó NÉM khi
 * `E2E_REQUIRE_ROLES=1`. §3ter ràng buộc 7: một lượt skip sạch trông y hệt một
 * lượt xanh. Ô đối chứng trong `a11y.spec.ts` không cứu được ở đây vì
 * `pnpm e2e:flow` lọc `--grep @flow` và ô đó không mang tag.
 *
 * ── Luồng này ĐỂ LẠI DỮ LIỆU trên cụm ───────────────────────────────────────
 * Nó tạo một bản nháp thật với id mang dấu thời gian. Không có API xoá nội
 * dung (chỉ `authoring.archive`), nên bước cuối LƯU TRỮ bản nháp thay vì để nó
 * nằm trong danh sách của người soạn mãi mãi. Id có tiền tố `e2e-` để người
 * vận hành nhận ra ngay thứ gì do harness sinh.
 *
 * ── Xuất bản chạy sandbox THẬT ──────────────────────────────────────────────
 * `publish-panel.tsx` nói với người soạn rằng riêng dựng sandbox cho bài
 * Kubernetes đã ~49 giây và cả lượt "mất vài phút". Nên test này có ngân sách
 * riêng, và nó chờ theo TRẠNG THÁI kết thúc chứ không theo đồng hồ.
 */

import { expect, requireRole, test } from './flow-kit';
import { openScreen } from '../fixtures/nav';

/** Ngân sách riêng: xuất bản dựng sandbox thật rồi chạy từng script của bài. */
const PUBLISH_TIMEOUT_MS = 12 * 60_000;

test.describe('luồng 5 — soạn bài', { tag: '@flow' }, () => {
  test('tạo → sửa → kiểm tra → xuất bản → thấy kết quả', async ({ page, account }) => {
    requireRole(account, 'author');
    test.setTimeout(PUBLISH_TIMEOUT_MS);

    const draftId = `e2e-luong-soan-${String(Date.now())}`;

    // ── 1. Danh sách bài của người soạn ─────────────────────────────────────
    await openScreen(page, '/author', 'author');
    await expect(page.getByRole('heading', { name: 'Soạn bài', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Tạo bài mới' }).first().click();
    await page.waitForURL('**/author/new');

    // ── 2. Tạo bản nháp ─────────────────────────────────────────────────────
    // Chỉ hai ô là bắt buộc phía client (`toDraftInput`: title + backendImageId),
    // và `emptyDraft()` đã đặt sẵn `backendImageId: 'ubuntu'` + `tier: 'sysbox'`
    // — đúng hai mặc định mà cụm lab chạy được (P12). Không đụng vào chúng.
    await page.getByLabel('Id', { exact: true }).fill(draftId);
    await page.getByLabel('Tiêu đề').fill('E2E luồng soạn bài');
    await page.getByRole('button', { name: 'Tạo bản nháp' }).click();

    // `author-new-client` đẩy sang trang sửa của bản vừa tạo.
    await page.waitForURL(`**/author/${draftId}`, { timeout: 60_000 });

    // ── 3. Sửa: thêm một bước có script chấm chạy được ──────────────────────
    // Bài không có bước nào thì schema xuất bản từ chối (`step-list-fields`
    // nói thẳng điều đó). Script chấm là `true` — cố ý TẦM THƯỜNG: luồng này đo
    // đường soạn-kiểm-xuất-bản, không đo khả năng viết đề của harness. Một
    // script phức tạp sẽ làm lượt chạy thử trượt vì lý do không liên quan gì
    // tới thứ đang được kiểm.
    // ⚠ `difficulty` BẮT BUỘC khi xuất bản, và bản nháp mới ra đời với ô đó
    // TRỐNG. Hai schema khác nhau: `toDraftInput` (tạo nháp) chỉ đòi
    // title + backendImageId, còn schema XUẤT BẢN đòi thêm độ khó. Ghi chú ở
    // bước 2 nói về schema thứ nhất và đã bị đọc nhầm thành "không còn ô bắt
    // buộc nào nữa".
    //
    // Bỏ bước này thì lượt kiểm tra đỏ với
    //     difficulty — Invalid option: expected one of "beginner"|"intermediate"|"advanced"
    // và nút "Xuất bản" bị khoá, nên luồng dừng ở giữa — đo được 2026-09-07.
    // Đây KHÔNG phải lỗi sản phẩm: một bản nháp mới chưa đủ điều kiện xuất bản
    // là đúng định nghĩa của bản nháp.
    await page.getByLabel('Độ khó').click();
    await page.getByRole('option', { name: 'Cơ bản' }).click();

    await page.getByRole('button', { name: /^Thêm bước$/ }).click();

    // ⚠ Thẻ bước là một `Card`, và chữ "Bước 1" nằm trong một `<h3>` — KHÔNG
    // phải một `<div>` có text đúng bằng "Bước 1". Bản đầu dùng
    // `locator('div').filter({ hasText: /^Bước 1$/ })` và khớp 0 phần tử trên
    // cụm 2026-09-07: `hasText` đối chiếu với TOÀN BỘ text của phần tử, mà div
    // bọc gần nhất còn chứa ba nút "Lên"/"Xuống"/"Xoá" nên text của nó là
    // "Bước 1LênXuốngXoá". Triệu chứng đọc ra rất lạc hướng — một
    // `locator.fill: Timeout` ở dòng NGAY SAU, tức trông như ô nhập không nhận
    // chữ chứ không như thẻ bước không tồn tại.
    //
    // Neo bằng chính heading rồi lấy `Card` chứa nó: `data-slot="card"` là hook
    // ổn định `packages/ui/src/card.tsx` cố ý phát ra, còn `h3` là cấu trúc
    // ngữ nghĩa thật của thẻ bước.
    const stepCard = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { name: 'Bước 1', exact: true }) });
    await stepCard.getByLabel('Tiêu đề').fill('Bước kiểm thử tự động');
    await stepCard.getByLabel('Nội dung (Markdown)').fill(
      'Bước này do harness e2e sinh ra để đi hết luồng soạn bài. Không có gì phải làm.',
    );
    await stepCard.getByLabel('Script chấm').fill('true\n');

    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(
      page.getByText('Không lưu được'),
      'Bản nháp không lưu được. Xem thông báo lỗi trên trang — luồng dừng ở đây ' +
        'vì mọi bước sau sẽ đo trên một bản nháp cũ.',
    ).toBeHidden({ timeout: 60_000 });

    // ── 4. Kiểm tra trước ───────────────────────────────────────────────────
    await page.getByRole('tab', { name: 'Xuất bản' }).click();
    await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();

    await expect(
      page.getByText('Định dạng hợp lệ'),
      'Lượt kiểm tra báo bản nháp chưa qua schema. Nút "Xuất bản" sẽ bị khoá, nên ' +
        'luồng không đi tiếp được — đọc danh sách lỗi trên trang để biết ô nào.',
    ).toBeVisible({ timeout: 60_000 });

    // ── 5. Xuất bản ─────────────────────────────────────────────────────────
    const publish = page.getByRole('button', { name: 'Xuất bản', exact: true });
    await expect(
      publish,
      'Nút Xuất bản đang khoá dù lượt kiểm tra đã sạch — hai chỉ báo mâu thuẫn nhau.',
    ).toBeEnabled();
    await publish.click();

    // ── 6. Thấy kết quả ─────────────────────────────────────────────────────
    // Chờ một trong hai TRẠNG THÁI KẾT THÚC, không chờ một khoảng thời gian.
    // "Đang chạy thử trong sandbox" là pha giữa và nó có thể kéo dài vài phút.
    // ⚠ Neo vào TIÊU ĐỀ ALERT, không phải chuỗi trần. "Đã xuất bản" có ở HAI
    // chỗ trên trang này: badge trạng thái ở đầu trang (`<span data-slot="badge">`)
    // và tiêu đề của alert kết quả (`<h5 data-slot="alert-title">`). Bản trước
    // dùng `getByText` nên đỏ với `strict mode violation … resolved to 2 elements`
    // — đo 2026-09-07, và chỉ lộ ra SAU khi bản vá polling làm trang thật sự tới
    // được trạng thái kết thúc (trước đó nó kẹt ở "Đang chạy thử" nên không bao
    // giờ có hai phần tử cùng lúc).
    //
    // Alert là thứ ta đang đo (kết quả của lượt chạy thử); badge chỉ nói trạng
    // thái hàng. Lấy nhầm badge sẽ xanh cả khi lượt chạy thử chưa báo gì.
    const published = page.getByRole('heading', { name: 'Đã xuất bản', exact: true });
    const failed = page.getByText('Lượt chạy thử trượt — bài quay về Nháp');

    await expect(async () => {
      expect(
        (await published.count()) + (await failed.count()),
        'Lượt xuất bản chưa tới trạng thái kết thúc nào.',
      ).toBeGreaterThan(0);
    }).toPass({ timeout: PUBLISH_TIMEOUT_MS - 120_000, intervals: [2_000, 5_000, 10_000] });

    // Bản nháp này chỉ có một bước với script `true`, nên một lượt trượt KHÔNG
    // phải "nội dung sai" — nó là đường xuất bản hỏng, và đó là lỗi thật.
    await expect(
      failed,
      'Lượt chạy thử TRƯỢT trên một bản nháp mà script chấm là `true`. Đây không ' +
        'phải lỗi nội dung: đường xuất bản (dựng sandbox → chạy script → ghi kết ' +
        'quả) đang hỏng. Đọc bảng "3. Kết quả chạy thử" trên trang.',
    ).toHaveCount(0);
    await expect(published).toBeVisible();

    // ── 7. Dọn: lưu trữ bản nháp harness vừa tạo ────────────────────────────
    // Không có đường xoá nội dung; lưu trữ là cách duy nhất để nó biến khỏi
    // danh mục người học. Bỏ bước này thì mỗi lượt e2e để lại một bài rác mà
    // người học nhìn thấy.
    await page.getByRole('button', { name: 'Lưu trữ', exact: true }).first().click();
    await page.getByRole('button', { name: 'Lưu trữ', exact: true }).last().click();

    // ⚠ Neo vào TOAST, không phải chuỗi trần — cùng bẫy đã sửa cho "Đã xuất bản"
    // ở dòng 125, và nó cắn lại ở đây (đo 2026-09-07, `EXIT_author=1`):
    //
    //   strict mode violation: getByText('Đã lưu trữ') resolved to 2 elements:
    //     1) <div class="text-sm font-medium">Đã lưu trữ</div>        ← tiêu đề toast
    //     2) <span role="status" aria-live="assertive">Notification Đã lưu trữBài…
    //
    // Phần tử thứ hai là vùng PHÁT LẠI của Radix Toast: nó đọc lại nội dung toast
    // cho trình đọc màn hình, nên mọi chuỗi trong toast tồn tại ĐÚNG HAI LẦN
    // trong cây a11y. Đây là hành vi đúng của thư viện, không phải lỗi — spec
    // phải nói rõ nó muốn cái nào.
    //
    // Radix dựng toast theo mẫu WAI-ARIA: viewport là một `list`, mỗi toast là
    // một `listitem`, còn vùng phát lại nằm NGOÀI list đó. Nên `listitem` tách
    // được hai thứ. Dùng `.first()` thì cũng hết đỏ, nhưng nó GIẤU sự mơ hồ:
    // lượt sau khớp nhầm phần tử nào cũng vẫn xanh.
    //
    // Sản phẩm lúc đó KHÔNG sai — đối chứng bằng DB cho thấy mục đã `archived`.
    // Một phép kiểm đỏ trên một thao tác đã thành công là phép kiểm nói dối.
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Đã lưu trữ' }),
    ).toBeVisible({ timeout: 60_000 });
  });
});
