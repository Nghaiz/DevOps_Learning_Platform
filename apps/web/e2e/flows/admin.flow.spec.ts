/**
 * Luồng 6 — quản trị: health → users → sessions → content → audit
 * (`phase-13.md:74`, 13.G).
 *
 * ── Cổng vai trò là điều kiện tồn tại của luồng này ─────────────────────────
 * `requireRole(account, 'admin')` NÉM khi `E2E_REQUIRE_ROLES=1`. Đây chính là
 * ca mà §3ter ràng buộc 7 mô tả từng chữ: "một lượt mà cả năm màn quản trị đều
 * SKIP trông y hệt một lượt chúng PASS". Không có cờ đó thì lượt chạy bằng tài
 * khoản thường vẫn exit 0 và bảng tổng kết vẫn sạch.
 *
 * ── Luồng này KHÔNG bấm nút phá ─────────────────────────────────────────────
 * Đổi vai trò và kết thúc phiên là hành động lên NGƯỜI KHÁC trên một cụm dùng
 * chung. Luồng mở hộp thoại xác nhận và khẳng định nó nói đúng thứ sắp xảy ra,
 * rồi HUỶ. Cái nó chứng minh là đường đi tới hành động có thật và có rào; cái
 * nó cố ý không làm là đá một người đang học ra khỏi phiên để lấy một ô xanh.
 * Đợt 3 muốn nghiệm thu D15 (admin kết thúc phiên người khác) thì làm bằng tay
 * trên một phiên do chính người nghiệm thu mở — đó là một phép đo khác, ghi
 * vào report chứ không nhét vào đây.
 */

import { t } from '@devops-platform/copy';

import { expect, requireRole, test } from './flow-kit';
import { openScreen } from '../fixtures/nav';

test.describe('luồng 6 — quản trị', { tag: '@flow' }, () => {
  test('health → users → sessions → content → audit', async ({ page, account }) => {
    requireRole(account, 'admin');
    test.setTimeout(3 * 60_000);

    // Thanh mục con của section Quản trị (`components/shell/section-bar.tsx`), nằm ngay
    // dưới thanh điều hướng trên cùng ở mọi trang thuộc mục. Nó KHÔNG phải nav của
    // header (`shell.nav.aria`), nên phạm vi này không khớp nhầm thanh trên cùng.
    const adminNav = page.getByRole('navigation', {
      name: t('shell.subnav.aria', { section: t('shell.section.admin') }),
      exact: true,
    });
    const switchTo = (label: string) => adminNav.getByRole('link', { name: label, exact: true });

    // ── 1. Tổng quan: sức chứa + trạng thái nguồn metric ────────────────────
    await openScreen(page, '/admin', 'admin');
    await expect(
      page.getByRole('heading', { name: t('admin.overview.title'), level: 1 }),
    ).toBeVisible();
    await expect(adminNav).toBeVisible();
    // Sức chứa là một mục `Section` có `h2` riêng; neo vào heading thay vì
    // `getByText(...).first()`, vì chữ đó còn nằm trong nhãn thước đo.
    await expect(
      page.getByRole('heading', { name: t('admin.capacity.title'), level: 2, exact: true }),
    ).toBeVisible();

    // ⚠ KHÔNG khẳng định `ok: true` cho mọi nguồn. §3bis: netpol web→gateway:8083
    // bị TỪ CHỐI có lý do, nên `gateway: reached:false, ok:false` là hành vi
    // ĐÚNG THIẾT KẾ trên cụm hardened. Một phép kiểm đòi tất cả xanh sẽ đỏ vĩnh
    // viễn ở đúng chỗ hệ thống đang hoạt động như đã quyết định.
    // Thứ luồng khẳng định: trang NÓI RA trạng thái, thay vì im lặng.

    // ── 2. Người dùng: bảng + rào đổi vai trò ───────────────────────────────
    await switchTo(t('shell.nav.admin-users')).click();
    await page.waitForURL('**/admin/users');
    await expect(page.getByRole('heading', { name: t('admin.users.title'), level: 1 })).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: t('admin.users.col-role'), exact: true }),
    ).toBeVisible();

    // Hàng dữ liệu = hàng có ô `cell`; hàng tiêu đề chỉ có `columnheader`.
    const userRows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(
      userRows,
      'Bảng người dùng render 0 hàng, dù chính tài khoản đang đăng nhập phải có ' +
        'trong đó. Một bảng rỗng vẫn "hiện ra".',
    ).not.toHaveCount(0);

    // Mở hộp thoại xác nhận rồi HUỶ — xem khối chú thích đầu file.
    await page.getByRole('button', { name: t('admin.users.change-role'), exact: true }).first().click();
    // `ConfirmDialog` của ds là Radix AlertDialog: role `alertdialog`, không phải `dialog`.
    const roleDialog = page.getByRole('alertdialog');
    await expect(roleDialog).toBeVisible();
    await expect(
      // Đoạn giữa của `admin.role-change.body` — khoá ĐỘNG (email, từ, thành),
      // nên khớp chuỗi con thay vì gọi `t()` với tham số bịa.
      roleDialog.getByText('Việc này được ghi vào nhật ký quản trị kèm tên bạn'),
      'Hộp thoại đổi vai trò không nói rằng hành động sẽ được ghi audit. AC 13.G ' +
        'mục 24 đòi mọi hành động quản trị có dấu vết, và người bấm phải biết trước.',
    ).toBeVisible();
    await roleDialog.getByRole('button', { name: t('common.action.cancel'), exact: true }).click();
    await expect(roleDialog).toBeHidden();

    // ── 3. Phiên đang chạy ──────────────────────────────────────────────────
    await switchTo(t('shell.nav.admin-sessions')).click();
    await page.waitForURL('**/admin/sessions');
    await expect(
      page.getByRole('heading', { name: t('admin.sessions.title'), level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(t('admin.sessions.alert-title'), { exact: true }),
    ).toBeVisible();

    // Danh sách có thể RỖNG hợp lệ (không ai đang học). Nên phép kiểm là: hoặc
    // có bảng với cột "Chủ phiên", hoặc có trạng thái rỗng — chứ không phải một
    // trang câm. Trang câm là thứ duy nhất sai ở đây.
    //
    // ⚠ CHỜ một trong hai xuất hiện TRƯỚC khi rẽ nhánh. Lúc query còn chạy trang
    // vẽ `LedgerSkeleton`; một `count()` tức thời ở thời điểm đó trả 0 và luồng
    // rơi vào nhánh "không có phiên" mà chưa hề đọc danh sách. Trang lỗi
    // (`LedgerError`) thì không khớp vế nào, nên nó đỏ ở đây — đúng ý.
    const sessionsTable = page.getByRole('columnheader', {
      name: t('admin.sessions.col-owner'),
      exact: true,
    });
    const sessionsEmpty = page.getByText(t('admin.sessions.empty-title'), { exact: true });
    await expect(
      sessionsTable.or(sessionsEmpty),
      'Trang phiên không vẽ bảng lẫn trạng thái rỗng — trang câm hoặc lỗi tải.',
    ).toBeVisible({ timeout: 30_000 });
    if (await sessionsTable.count()) {
      await expect(
        page.getByRole('button', { name: t('admin.sessions.terminate'), exact: true }).first(),
      ).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'chua-do',
        description:
          'Không có phiên nào đang sống lúc chạy, nên nút "Kết thúc" của admin ' +
          'KHÔNG được kiểm. D15 (admin kết thúc phiên người khác) cần một phép đo ' +
          'tay riêng ở đợt 3.',
      });
    }

    // ── 4. Nội dung ─────────────────────────────────────────────────────────
    await switchTo(t('shell.nav.admin-content')).click();
    await page.waitForURL('**/admin/content');
    await expect(page.getByRole('heading', { name: t('admin.content.title'), level: 1 })).toBeVisible();
    await expect(
      page.getByText(t('admin.content.alert-title'), { exact: true }),
      'Trang nội dung không nói rằng nút Lưu trữ đi qua đường người soạn và KHÔNG ' +
        'ghi admin_audit. Giấu chuyện đó làm người vận hành tin nhật ký đầy đủ hơn ' +
        'thực tế.',
    ).toBeVisible();

    // ── 5. Nhật ký ──────────────────────────────────────────────────────────
    await switchTo(t('shell.nav.admin-audit')).click();
    await page.waitForURL('**/admin/audit');
    await expect(page.getByRole('heading', { name: t('admin.audit.title'), level: 1 })).toBeVisible();
    await expect(
      page.getByText(t('admin.audit.alert-title'), { exact: true }),
    ).toBeVisible();

    // Cột phải có mặt kể cả khi chưa hành động nào được ghi — bảng rỗng là
    // trạng thái hợp lệ của một cụm sạch, bảng KHÔNG TỒN TẠI thì không.
    //
    // ⚠ Nhánh thứ hai là `[data-slot="empty-state"]`, KHÔNG phải `role="status"`.
    // Bản đầu tìm `role="status"` và đỏ trên cụm 2026-09-07 — nhưng khối rỗng
    // (nay là `Empty` của `packages/ds`) chưa từng khai vai trò đó, nên phép
    // kiểm đang khẳng định một điều không đúng về sản phẩm chứ không phát hiện
    // ra lỗi nào. `role="status"` là một live region: gắn nó vào MỌI trạng thái
    // rỗng nghĩa là trình đọc màn hình xướng lên ở mỗi trang danh mục trống, một
    // thay đổi hành vi rộng — không đáng đánh đổi để một locator khớp.
    // `data-slot` là hook ổn định mà component đã cố ý phát ra.
    await expect(
      page
        .getByRole('columnheader', { name: t('admin.audit.col-action'), exact: true })
        .or(page.locator('[data-slot="empty-state"]'))
        .first(),
      'Trang nhật ký không có bảng lẫn trạng thái rỗng — không đọc được gì.',
    ).toBeVisible();
  });
});
