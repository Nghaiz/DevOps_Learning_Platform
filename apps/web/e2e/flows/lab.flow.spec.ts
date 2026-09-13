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
  SESSION_READY_TIMEOUT_MS,
  endSandbox,
  expect,
  startSandbox,
  test,
} from './flow-kit';
import { t } from '@devops-platform/copy';
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

    /*
      ── 1. Danh sách nhiệm vụ ────────────────────────────────────────────────

      ⚠ Neo vào `aria-label` của danh sách, lấy TỪ BẢN ĐỒ COPY.

      Bản trước tìm một `<table>` với `columnheader "Nhiệm vụ"` và đếm `tbody tr`,
      cộng một caption viết thẳng. Trang lab đã đổi hình ở `0487000 feat(lab):
      trang lab dùng danh sách kiểm` — nay là `<ul aria-label>` chứa `<li><button>`
      (`components/session/task-checklist.tsx`), không còn bảng nhiệm vụ nào.
      Spec giữ bản chép cũ nên đỏ, và nó đỏ vì HARNESS lạc hậu, không vì sản phẩm
      sai. (Bảng xếp hạng ở tab bên cạnh VẪN là `<table>`; các ô của nó bên dưới
      giữ nguyên.)

      Cùng lý do như `path.flow`: một chuỗi viết thẳng trong spec là bản sao thứ
      hai của dữ liệu, và bản sao thì trôi. `t()` làm phép kiểm nói đúng điều nó
      muốn nói.

      Ô ĐẾM giữ nguyên tinh thần cũ: một danh sách rỗng vẫn "hiện ra", nên phải
      đếm mục chứ không chỉ kiểm danh sách có mặt.
    */
    const taskList = page.getByRole('list', { name: t('session.lab.checklist-legend') });
    await expect(
      taskList,
      'Không thấy danh sách nhiệm vụ của lab. Trang đã đổi hình dạng?',
    ).toBeVisible();

    const taskRows = taskList.getByRole('listitem');
    await expect(
      taskRows,
      'Danh sách nhiệm vụ render 0 mục. Một danh sách rỗng vẫn "hiện ra" nên phép ' +
        'kiểm phải đếm mục, không chỉ kiểm danh sách có mặt.',
    ).not.toHaveCount(0);

    // ── 2. Bắt đầu lần thử, rồi chấm MỘT task ───────────────────────────────
    // Nhãn nút là 'Bắt đầu' khi chưa có lần thử và 'Làm lại' khi đã có
    // (`lab-client.tsx` truyền `startLabel`). Chọn theo cái đang hiện, thay vì
    // giả định tài khoản e2e chưa từng làm lab này.
    const startLabel = (await page.getByRole('button', { name: 'Làm lại', exact: true }).count())
      ? 'Làm lại'
      : 'Bắt đầu';
    await startSandbox(page, startLabel);

    // Mỗi mục là một `<button>` thật (chủ ý của `TaskChecklist`) — bấm nó mở đề
    // của đúng nhiệm vụ đó.
    await taskRows.first().getByRole('button').first().click();

    const checkTask = page.getByRole('button', { name: 'Chấm nhiệm vụ này' });
    await expect(checkTask).toBeVisible();
    /*
      ⏱ Chờ theo mốc PHA PHIÊN, không theo trần mặc định 15s.

      `lab-client` khoá nút này vì BA lý do, không phải hai: chưa có lần thử,
      lần thử đã nộp, HOẶC `setupPending` — vế thứ ba thêm ở P15/15.C, khi
      setup của lab chuyển sang chạy NỀN để người học không bị chặn ở màn
      trắng. Chú thích cũ ở đây chỉ liệt kê hai, nên nó kết luận sai rằng một
      nút xám sau khi Bắt đầu thành công là mâu thuẫn. Không mâu thuẫn: đó là
      cửa sổ setup đang chạy.

      Setup của lab k8s đi đường LẠNH mất 17-26s (đo ở P15), tức LUÔN vượt
      trần 15s mặc định của `toBeEnabled()`. Ô này vì thế đỏ một cách có hệ
      thống trên lab k8s và xanh trên lab linux — tính chất "đỏ tùy lab đứng đầu
      danh mục" đúng là thứ làm người đọc đi truy sai chỗ.

      Dùng `SESSION_READY_TIMEOUT_MS` thay vì một con số mới: đây vẫn là "chờ pha
      phiên đổi", cùng thứ mà `startSandbox` đã chờ.
    */
    await expect(
      checkTask,
      'Nút "Chấm nhiệm vụ này" còn khoá sau khi phiên đã mở VÀ setup đã có đủ ' +
        'thời gian chạy. `lab-client` khoá nó ở ba trường hợp: chưa có lần thử, ' +
        'lần thử đã nộp, hoặc `setupPending`. Hai cái đầu mâu thuẫn với việc vừa ' +
        'bấm Bắt đầu thành công; cái thứ ba nghĩa là setup chạy quá lâu hoặc đã ' +
        'chết — đọc banner setup trên trang để biết cái nào.',
    ).toBeEnabled({ timeout: SESSION_READY_TIMEOUT_MS });
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
