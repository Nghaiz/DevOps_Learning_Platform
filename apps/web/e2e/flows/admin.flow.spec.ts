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

import { expect, requireRole, test } from './flow-kit';
import { openScreen } from '../fixtures/nav';

test.describe('luồng 6 — quản trị', { tag: '@flow' }, () => {
  test('health → users → sessions → content → audit', async ({ page, account }) => {
    requireRole(account, 'admin');
    test.setTimeout(3 * 60_000);

    const adminNav = page.getByRole('navigation', { name: 'Điều hướng quản trị' });

    // ── 1. Tổng quan: sức chứa + trạng thái nguồn metric ────────────────────
    await openScreen(page, '/admin', 'admin');
    await expect(page.getByRole('heading', { name: 'Tổng quan', level: 1 })).toBeVisible();
    await expect(adminNav).toBeVisible();
    await expect(page.getByText('Sức chứa').first()).toBeVisible();

    // ⚠ KHÔNG khẳng định `ok: true` cho mọi nguồn. §3bis: netpol web→gateway:8083
    // bị TỪ CHỐI có lý do, nên `gateway: reached:false, ok:false` là hành vi
    // ĐÚNG THIẾT KẾ trên cụm hardened. Một phép kiểm đòi tất cả xanh sẽ đỏ vĩnh
    // viễn ở đúng chỗ hệ thống đang hoạt động như đã quyết định.
    // Thứ luồng khẳng định: trang NÓI RA trạng thái, thay vì im lặng.

    // ── 2. Người dùng: bảng + rào đổi vai trò ───────────────────────────────
    await adminNav.getByRole('link', { name: 'Người dùng' }).click();
    await page.waitForURL('**/admin/users');
    await expect(page.getByRole('heading', { name: 'Người dùng', level: 1 })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Vai trò' })).toBeVisible();

    const userRows = page.locator('table tbody tr');
    await expect(
      userRows,
      'Bảng người dùng render 0 hàng, dù chính tài khoản đang đăng nhập phải có ' +
        'trong đó. Một bảng rỗng vẫn "hiện ra".',
    ).not.toHaveCount(0);

    // Mở hộp thoại xác nhận rồi HUỶ — xem khối chú thích đầu file.
    await page.getByRole('button', { name: 'Đổi vai trò' }).first().click();
    const roleDialog = page.getByRole('dialog');
    await expect(roleDialog).toBeVisible();
    await expect(
      roleDialog.getByText('Việc này được ghi vào nhật ký quản trị kèm tên bạn'),
      'Hộp thoại đổi vai trò không nói rằng hành động sẽ được ghi audit. AC 13.G ' +
        'mục 24 đòi mọi hành động quản trị có dấu vết, và người bấm phải biết trước.',
    ).toBeVisible();
    await roleDialog.getByRole('button', { name: 'Huỷ' }).click();
    await expect(roleDialog).toBeHidden();

    // ── 3. Phiên đang chạy ──────────────────────────────────────────────────
    await adminNav.getByRole('link', { name: 'Phiên đang chạy' }).click();
    await page.waitForURL('**/admin/sessions');
    await expect(page.getByRole('heading', { name: 'Phiên đang chạy', level: 1 })).toBeVisible();
    await expect(page.getByText('Danh sách này chỉ có phiên CÒN SỐNG')).toBeVisible();

    // Danh sách có thể RỖNG hợp lệ (không ai đang học). Nên phép kiểm là: hoặc
    // có bảng với cột "Chủ phiên", hoặc có trạng thái rỗng — chứ không phải một
    // trang câm. Trang câm là thứ duy nhất sai ở đây.
    const sessionsTable = page.getByRole('columnheader', { name: 'Chủ phiên' });
    if (await sessionsTable.count()) {
      await expect(page.getByRole('button', { name: 'Kết thúc' }).first()).toBeVisible();
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
    await adminNav.getByRole('link', { name: 'Nội dung' }).click();
    await page.waitForURL('**/admin/content');
    await expect(page.getByRole('heading', { name: 'Nội dung', level: 1 })).toBeVisible();
    await expect(
      page.getByText('Lưu trữ không ghi vào nhật ký quản trị'),
      'Trang nội dung không nói rằng nút Lưu trữ đi qua đường người soạn và KHÔNG ' +
        'ghi admin_audit. Giấu chuyện đó làm người vận hành tin nhật ký đầy đủ hơn ' +
        'thực tế.',
    ).toBeVisible();

    // ── 5. Nhật ký ──────────────────────────────────────────────────────────
    await adminNav.getByRole('link', { name: 'Nhật ký' }).click();
    await page.waitForURL('**/admin/audit');
    await expect(page.getByRole('heading', { name: 'Nhật ký quản trị', level: 1 })).toBeVisible();
    await expect(page.getByText('Đây là một nửa của nhật ký')).toBeVisible();

    // Cột phải có mặt kể cả khi chưa hành động nào được ghi — bảng rỗng là
    // trạng thái hợp lệ của một cụm sạch, bảng KHÔNG TỒN TẠI thì không.
    await expect(
      page.getByRole('columnheader', { name: 'Hành động' }).or(page.getByRole('status')).first(),
      'Trang nhật ký không có bảng lẫn trạng thái rỗng — không đọc được gì.',
    ).toBeVisible();
  });
});
