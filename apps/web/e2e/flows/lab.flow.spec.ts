/**
 * Luồng 2 — lab: bảng task → chấm từng task → điểm tổng → bảng xếp hạng
 * (`phase-13.md:74`, 13.H mục 27).
 *
 * Bốn thứ luồng này khẳng định, và lý do từng thứ ở đây chứ không ở chỗ khác:
 *   1. bảng task render ĐỦ hàng (một bảng rỗng cũng "hiện ra");
 *   2. chấm RIÊNG một task đi tới kết quả — nút "Chấm nhiệm vụ này", không
 *      phải nút chấm chung của bài học;
 *   3. điểm tổng có mặt và nói bằng chữ (`role="status"` duy nhất của trang);
 *   4. tab "Bảng xếp hạng" mở được và render một bảng thật.
 *
 * ⚠ Bảng xếp hạng chỉ tồn tại khi lab bật `leaderboard`. Không lab nào bật thì
 * bước 4 báo rõ điều đó thay vì đỏ mập mờ — nhưng nó KHÔNG tự bỏ qua trong im
 * lặng, vì "không có tab" và "tab hỏng" là hai chuyện khác nhau.
 */

import {
  SANDBOX_FLOW_TIMEOUT_MS,
  endSandbox,
  expect,
  startSandbox,
  test,
} from './flow-kit';
import { firstItemId } from '../fixtures/api';
import { openScreen } from '../fixtures/nav';

test.describe('luồng 2 — lab', { tag: '@flow' }, () => {
  test('bảng task → chấm từng task → điểm tổng → bảng xếp hạng', async ({ page, api }) => {
    test.setTimeout(SANDBOX_FLOW_TIMEOUT_MS);

    const labId = await firstItemId(api, 'labs.list');
    expect(
      labId,
      'labs.list trả 0 mục nên không có lab nào để đi luồng này. Danh mục rỗng là ' +
        'vấn đề của bản deploy (nội dung nạp từ image), không phải của harness.',
    ).not.toBeNull();

    await openScreen(page, `/labs/${encodeURIComponent(labId ?? '')}`, 'user');

    // ── 1. Bảng task ────────────────────────────────────────────────────────
    // Neo vào `TableCaption` — chuỗi đó do chính `TaskTable` phát ra, nên nó
    // phân biệt được "bảng task" với bảng xếp hạng ở tab bên cạnh.
    await expect(
      page.getByText('Bấm một nhiệm vụ để đọc đề và chấm riêng nhiệm vụ đó.'),
    ).toBeVisible();

    const taskTable = page.locator('table', {
      has: page.getByRole('columnheader', { name: 'Nhiệm vụ' }),
    });
    const taskRows = taskTable.locator('tbody tr');
    await expect(
      taskRows,
      'Bảng task render 0 hàng. Một bảng rỗng vẫn "hiện ra" nên phép kiểm phải ' +
        'đếm hàng, không chỉ kiểm bảng có mặt.',
    ).not.toHaveCount(0);

    // ── 2. Bắt đầu lần thử, rồi chấm MỘT task ───────────────────────────────
    // Nhãn nút là 'Bắt đầu' khi chưa có lần thử và 'Làm lại' khi đã có
    // (`lab-client.tsx` truyền `startLabel`). Chọn theo cái đang hiện, thay vì
    // giả định tài khoản e2e chưa từng làm lab này.
    const startLabel = (await page.getByRole('button', { name: 'Làm lại', exact: true }).count())
      ? 'Làm lại'
      : 'Bắt đầu';
    await startSandbox(page, startLabel);

    // Ô tiêu đề task là một `<button>` thật (chủ ý của `TaskTable`) — bấm nó mở
    // đề của đúng task đó.
    await taskRows.first().getByRole('button').first().click();

    const checkTask = page.getByRole('button', { name: 'Chấm nhiệm vụ này' });
    await expect(checkTask).toBeVisible();
    await expect(
      checkTask,
      'Nút "Chấm nhiệm vụ này" đang bị khoá dù phiên đã mở. `lab-client` chỉ khoá ' +
        'nó khi chưa có lần thử hoặc lần thử đã nộp — cả hai đều mâu thuẫn với ' +
        'việc vừa bấm Bắt đầu thành công.',
    ).toBeEnabled();
    await checkTask.click();

    // Ba nhánh của `CheckResultPanel`, y như luồng 1: luồng khẳng định đường
    // chấm chạy tới nơi, không khẳng định bài làm đúng.
    await expect(
      page.getByText(/^(Đạt|Chưa đạt \(exit |Không chấm được)/).first(),
      'Bấm chấm task nhưng không có bảng kết quả nào hiện ra.',
    ).toBeVisible({ timeout: 120_000 });
    await expect(
      page.getByText('Không chấm được'),
      'Lượt chấm task không chạy được (nhánh error) — lỗi hạ tầng chấm bài, ' +
        'không phải "chưa đạt".',
    ).toBeHidden();

    // ── 3. Điểm tổng ────────────────────────────────────────────────────────
    // `lab-client` cố ý chỉ có MỘT chỗ khẳng định điểm trong cả trang; nó là
    // một `role="status"` chứa `summary.headline`. Khẳng định nó có chữ, chứ
    // không so một con số cụ thể — điểm phụ thuộc bài làm, và một phép so cứng
    // sẽ đỏ ở mọi nội dung khác.
    const scoreBanner = page.locator('[role="status"]').filter({ hasText: /điểm|Điểm|task|nhiệm vụ/ });
    await expect(
      scoreBanner.first(),
      'Không thấy bảng điểm tổng. `lab-client` vẽ nó ở MỘT chỗ duy nhất; thiếu ' +
        'nó nghĩa là người học không đọc được mình đang ở đâu.',
    ).toBeVisible();

    // ── 4. Nộp bài — điểm tổng chốt lại từ các lượt chấm đã có ──────────────
    const submit = page.getByRole('button', { name: 'Nộp bài', exact: true });
    await expect(submit).toBeVisible();
    await submit.click();
    // Sau khi nộp, `lab-client` khoá lượt chấm lại và hiện câu lý do đó. Đây là
    // dấu hiệu quan sát được của "đã nộp", không phải một khoảng chờ.
    await expect(
      page.getByText('Lần thử này đã nộp — không chấm lại được. Bấm Bắt đầu để mở lần thử mới.'),
    ).toBeVisible({ timeout: 60_000 });

    // ── 5. Bảng xếp hạng ────────────────────────────────────────────────────
    const leaderboardTab = page.getByRole('tab', { name: 'Bảng xếp hạng' });
    if (await leaderboardTab.count()) {
      await leaderboardTab.click();
      await expect(
        page.getByRole('columnheader', { name: 'Người học' }),
        'Tab "Bảng xếp hạng" mở ra nhưng không có bảng nào — tab tồn tại mà nội ' +
          'dung không render là một lỗi, không phải một lab không bật leaderboard.',
      ).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('columnheader', { name: 'Điểm' })).toBeVisible();
    } else {
      // KHÔNG `test.skip()` ở đây: cả luồng đã chạy xong bốn bước kia và chúng
      // là kết quả thật. Ghi vào báo cáo để đợt 3 biết ô "leaderboard" của AC
      // chưa được luồng này đóng, thay vì tưởng nó đã xanh.
      test.info().annotations.push({
        type: 'chua-do',
        description:
          `Lab '${labId ?? ''}' không bật leaderboard nên bước bảng xếp hạng KHÔNG ` +
          `được kiểm. Muốn đóng ô AC đó thì cụm phải có ít nhất một lab bật cờ này.`,
      });
    }

    await endSandbox(page);
  });
});
