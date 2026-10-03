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
 * Mục "Chạy thử rồi xuất bản" của `publish-panel.tsx` nói với người soạn rằng
 * cả lượt "có thể mất vài phút" (riêng dựng sandbox cho bài Kubernetes đo được
 * ~49 giây trên cụm lab). Nên test này có ngân sách riêng, và nó chờ theo
 * TRẠNG THÁI kết thúc chứ không theo đồng hồ.
 */

import { t } from '@devops-platform/copy';

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
    await expect(page.getByRole('heading', { name: t('author.list.title'), level: 1 })).toBeVisible();

    await page.getByRole('link', { name: t('author.list.new-cta'), exact: true }).first().click();
    await page.waitForURL('**/author/new');

    // ── 2. Tạo bản nháp ─────────────────────────────────────────────────────
    // Chỉ hai ô là bắt buộc phía client (`toDraftInput`: title + backendImageId),
    // và `emptyDraft()` đã đặt sẵn `backendImageId: 'ubuntu'` + `tier: 'sysbox'`
    // — đúng hai mặc định mà cụm lab chạy được (P12). Không đụng vào chúng.
    // `exact`: khi bật phần mở đầu/kết thúc, trang còn ô "Tiêu đề phần".
    await page.getByLabel(t('author.new.id.label'), { exact: true }).fill(draftId);
    await page.getByLabel(t('author.draft-meta-fields-tieu-de'), { exact: true }).fill('E2E luồng soạn bài');
    await page.getByRole('button', { name: t('author.new.submit'), exact: true }).click();

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
    await page.getByLabel(t('author.draft-meta-fields-do-kho'), { exact: true }).click();
    await page.getByRole('option', { name: t('common.difficulty.beginner'), exact: true }).click();

    await page.getByRole('button', { name: t('author.step-list-fields-them-buoc'), exact: true }).click();

    // Mỗi bước là một `<section aria-labelledby>` có heading "Bước N" (bản dựng
    // lại PTIT 2026-10-03 bỏ `Card`), nên nó là một landmark `region` mang đúng
    // tên đó. Neo bằng vai trò + tên chứ không bằng `data-slot="card"`: bản cũ
    // neo vào hook của `Card` và sẽ khớp 0 phần tử khi thẻ thôi là `Card`.
    // `exact` vì "Bước 1" là tiền tố của "Bước 10".
    // Tên ghép y như `components/author/step-station.tsx` ghép.
    const stepCard = page.getByRole('region', {
      name: `${t('author.step-list-fields-buoc')} 1`,
      exact: true,
    });
    await stepCard
      .getByLabel(t('author.draft-meta-fields-tieu-de'), { exact: true })
      .fill('Bước kiểm thử tự động');
    await stepCard.getByLabel(t('author.phase-fields-noi-dung-markdown'), { exact: true }).fill(
      'Bước này do harness e2e sinh ra để đi hết luồng soạn bài. Không có gì phải làm.',
    );
    await stepCard.getByLabel(t('author.phase-fields-script-cham'), { exact: true }).fill('true\n');

    await page.getByRole('button', { name: t('common.action.save'), exact: true }).click();
    // ⚠ Chờ ô trạng thái LƯU về `saved`, không chờ "Không lưu được" biến mất.
    // Phép cũ (`toBeHidden`) xanh NGAY sau cú bấm, trước khi máy chủ trả lời, vì
    // chữ lỗi chưa từng hiện. Bản dựng lại còn KHOÁ cả "Kiểm tra" lẫn "Xuất bản"
    // khi màn hình lệch bản đã lưu (`mustSaveBeforePublish`,
    // `components/author/studio/save-status.ts`), nên đi tiếp trước khi lưu xong
    // là đo trên một trang đang khoá. `data-save-status` là hook `SaveState` cố ý
    // phát ra; giá trị `error` của nó chính là ô "Không lưu được" của bản trước.
    await expect(
      page.locator('[data-save-status]'),
      'Bản nháp không lưu được. Xem thông báo lỗi trên trang — luồng dừng ở đây ' +
        'vì mọi bước sau sẽ đo trên một bản nháp cũ.',
    ).toHaveAttribute('data-save-status', 'saved', { timeout: 60_000 });

    // ── 4. Kiểm tra trước ───────────────────────────────────────────────────
    await page.getByRole('tab', { name: t('author.edit.tab.publish'), exact: true }).click();
    await page.getByRole('button', { name: t('author.publish-panel-kiem-tra'), exact: true }).click();

    // Tiêu đề alert của `CheckReport`; dải bên còn một dòng "Kiểm tra định dạng:
    // sạch", nên neo heading chứ không neo chuỗi trần.
    await expect(
      page.getByRole('heading', { name: t('author.publish-panel-dinh-dang-hop-le'), exact: true }),
      'Lượt kiểm tra báo bản nháp chưa qua schema. Nút "Xuất bản" sẽ bị khoá, nên ' +
        'luồng không đi tiếp được — đọc danh sách lỗi trên trang để biết ô nào.',
    ).toBeVisible({ timeout: 60_000 });

    // ── 5. Xuất bản ─────────────────────────────────────────────────────────
    // `exact`: dải bên có nút "Mở chế độ Xuất bản", và tab cùng tên là `tab`.
    const publish = page.getByRole('button', { name: t('author.studio.action.publish'), exact: true });
    await expect(
      publish,
      'Nút Xuất bản đang khoá dù lượt kiểm tra đã sạch — hai chỉ báo mâu thuẫn nhau.',
    ).toBeEnabled();
    await publish.click();

    // ── 6. Thấy kết quả ─────────────────────────────────────────────────────
    // Chờ một TRẠNG THÁI KẾT THÚC, không chờ một khoảng thời gian. "Đang chạy
    // thử trong sandbox" là pha giữa và nó có thể kéo dài vài phút. `PhaseReport`
    // (`components/author/publish-reports.tsx`) có BA kết thúc: đạt, trượt, và
    // mất dấu (`lost`, bài quay về Nháp mà máy chủ không ghi lý do). Bỏ sót vế
    // thứ ba thì một lượt `lost` đỏ sau ~10 phút với câu "chưa tới trạng thái
    // kết thúc nào", nói sai nguyên nhân.
    // ⚠ Neo vào TIÊU ĐỀ ALERT, không phải chuỗi trần. "Đã xuất bản" có ở HAI
    // chỗ trên trang này: ô trạng thái ở đầu trang (`StateChip`, một `<span>`)
    // và tiêu đề của alert kết quả (`<h5 data-slot="alert-title">`). Bản trước
    // dùng `getByText` nên đỏ với `strict mode violation … resolved to 2 elements`
    // — đo 2026-09-07, và chỉ lộ ra SAU khi bản vá polling làm trang thật sự tới
    // được trạng thái kết thúc (trước đó nó kẹt ở "Đang chạy thử" nên không bao
    // giờ có hai phần tử cùng lúc).
    //
    // Alert là thứ ta đang đo (kết quả của lượt chạy thử); badge chỉ nói trạng
    // thái hàng. Lấy nhầm badge sẽ xanh cả khi lượt chạy thử chưa báo gì.
    const published = page.getByRole('heading', { name: t('author.publish.passed'), exact: true });
    // Đọc qua `t()` chứ không gõ lại: bản gõ tay trước đây còn mang gạch ngang
    // dài trong khi bản đồ chữ đã bỏ nó, nên `failed` không bao giờ khớp và ô
    // "không trượt" dưới đây xanh trong mọi trường hợp.
    const failed = page.getByRole('heading', {
      name: t('author.publish-panel-luot-chay-thu-truot-bai-quay-ve-nhap'),
      exact: true,
    });
    const lost = page.getByRole('heading', {
      name: t('author.publish-panel-khong-con-dau-vet-cua-luot-chay-thu'),
      exact: true,
    });

    await expect(async () => {
      expect(
        (await published.count()) + (await failed.count()) + (await lost.count()),
        'Lượt xuất bản chưa tới trạng thái kết thúc nào.',
      ).toBeGreaterThan(0);
    }).toPass({ timeout: PUBLISH_TIMEOUT_MS - 120_000, intervals: [2_000, 5_000, 10_000] });

    await expect(
      lost,
      'Lượt chạy thử MẤT DẤU: bài quay về Nháp mà máy chủ không ghi lý do (thường ' +
        'là pod web khởi động lại giữa lượt). Không phải lỗi nội dung.',
    ).toHaveCount(0);

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
    // Nút "Lưu trữ" của mục 04 mở `ConfirmDialog`, mà nút xác nhận cũng mang
    // đúng chữ đó. Bấm nút thứ hai TRONG hộp thoại (tên hộp = tiêu đề của nó),
    // thay cho cặp `.first()` / `.last()` của bản trước: cặp đó phụ thuộc thứ tự
    // DOM và không nói nút nào là nút nào.
    const archiveLabel = t('author.studio.action.archive');
    await page.getByRole('button', { name: archiveLabel, exact: true }).click();
    const archiveDialog = page.getByRole('dialog', { name: t('author.publish-panel-luu-tru-bai-nay') });
    await archiveDialog.getByRole('button', { name: archiveLabel, exact: true }).click();

    // ⚠ Neo vào TOAST, không phải chuỗi trần — cùng họ bẫy với "Đã xuất bản" ở
    // trên. Đo 2026-09-07 (`EXIT_author=1`), khi toast còn là Radix:
    //
    //   strict mode violation: getByText('Đã lưu trữ') resolved to 2 elements:
    //     1) <div class="text-sm font-medium">Đã lưu trữ</div>        ← tiêu đề toast
    //     2) <span role="status" aria-live="assertive">Notification Đã lưu trữBài…
    //
    // Phần tử thứ hai là vùng PHÁT LẠI của Radix Toast. Nay `packages/ui/src/toast.tsx`
    // chạy trên `sonner` và không còn vùng phát lại, nhưng neo theo chuỗi trần vẫn
    // là đặt cược rằng chữ đó chỉ có một chỗ trên trang. `data-slot="toast"` là hook
    // `ToastCard` cố ý phát ra, nên phép kiểm nói thẳng nó muốn CÁI TOAST.
    // Dùng `.first()` thì cũng hết đỏ, nhưng nó GIẤU sự mơ hồ: lượt sau khớp
    // nhầm phần tử nào cũng vẫn xanh.
    //
    // Sản phẩm lúc đó KHÔNG sai — đối chứng bằng DB cho thấy mục đã `archived`.
    // Một phép kiểm đỏ trên một thao tác đã thành công là phép kiểm nói dối.
    await expect(
      page.locator('[data-slot="toast"]').filter({ hasText: t('author.edit.archived.title') }),
    ).toBeVisible({ timeout: 60_000 });
  });
});
