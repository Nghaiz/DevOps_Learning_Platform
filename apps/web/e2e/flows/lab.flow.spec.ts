/**
 * Luồng 2 — lab: mở lab từ danh mục → mở phiên → terminal CHẠY lệnh → IDE tải →
 * chấm một nhiệm vụ TRƯỢT → sửa bằng terminal → chấm lại ĐẠT → điểm tổng tăng →
 * nộp bài → bảng xếp hạng → nhả phiên (`phase-13.md:74`, 13.H mục 27).
 *
 * ── Vì sao luồng này giải một nhiệm vụ THẬT ─────────────────────────────────
 * Đây là bằng chứng end-to-end duy nhất rằng người học mở được lab, có terminal
 * và IDE dùng được, và qua được phép chấm. Bản trước chỉ khẳng định "lượt chấm
 * chạy tới nơi" (Đạt HOẶC Chưa đạt đều xanh), tức không bao giờ chứng minh được
 * rằng một lab ĐẠT được. Muốn thấy "Đạt" thì harness phải biết đáp án, nên nó
 * dùng một lab + nhiệm vụ CỐ ĐỊNH mà đáp án nằm ngay trong repo:
 *
 *   `content/labs/dlp-linux-triage/setup/background.sh` gieo
 *   `/root/lab-linux/service.secret` với quyền 644, và
 *   `task-harden-secret-permissions/verify.sh` chỉ đạt khi quyền là đúng 600.
 *
 * Lab này được chọn vì cả ba điều cùng lúc: đáp án là MỘT lệnh tất định, lab
 * khai `interface.layout: ide` (nên IDE bị đo thật), và bật `leaderboard`.
 *
 * ⛔ Không có đường lùi sang "lab đầu danh mục". Một lab mà harness không biết
 * đáp án chỉ cho phép khẳng định lại điều yếu cũ, và một ô xanh như thế đọc ra
 * như "lab đạt được" trong khi nó không đo điều đó. Bản deploy thiếu lab này ⇒
 * ĐỎ với câu nói rõ điều đó.
 *
 * ── Đối chứng cùng lượt ─────────────────────────────────────────────────────
 *   | mốc            | dương                         | đối chứng                        |
 *   |----------------|-------------------------------|----------------------------------|
 *   | trước Bắt đầu  | đủ mọi nhiệm vụ của API       | không có terminal, nút chấm khoá |
 *   | shell sống     | `DLPE2E-OK` về qua dây        | chuỗi gõ vào có dấu nháy, khác   |
 *   | trước khi sửa  | terminal đọc `PERM_644`       | chấm ⇒ "Chưa đạt", điểm 0        |
 *   | sau khi sửa    | terminal đọc `PERM_600`       | chấm ⇒ "Đạt", điểm > 0           |
 *
 * Cặp thứ ba là thứ làm ô "Đạt" có nghĩa: cùng nhiệm vụ, cùng phiên, phép chấm
 * TRƯỢT trước khi sửa và ĐẠT sau khi sửa. Một phép chấm luôn trả đạt sẽ đỏ ở vế
 * trượt, thay vì lặng lẽ làm vế đạt xanh.
 */

import type { APIRequestContext } from '@playwright/test';
import { t } from '@devops-platform/copy';
import {
  SANDBOX_FLOW_TIMEOUT_MS,
  SESSION_READY_TIMEOUT_MS,
  endSandbox,
  expect,
  releaseSandboxQuietly,
  startSandbox,
  test,
  watchRateLimits,
} from './flow-kit';
import {
  SHELL_MARKER_CMD,
  SHELL_MARKER_OUT,
  expectIdeLoaded,
  expectTerminalLive,
  expectTerminalOutput,
  runCheck,
  terminalSurface,
  typeInTerminal,
  watchTerminalTraffic,
  workspaceTab,
} from './session-kit';
import { trpcQuery } from '../fixtures/api';
import { openScreen, settle } from '../fixtures/nav';

/** Lab, nhiệm vụ và file mà harness biết đáp án. Xem khối chú thích đầu file. */
const KNOWN = {
  labId: 'dlp-linux-triage',
  taskId: 'harden-secret-permissions',
  file: '/root/lab-linux/service.secret',
} as const;

/**
 * `stat -c 'PERM_%a'` in `PERM_644` / `PERM_600`, còn tiếng vọng của lệnh gõ vào
 * mang `'PERM_%a'`: hai chuỗi khác nhau, nên tìm `PERM_600` chỉ khớp KẾT QUẢ.
 */
const READ_PERM = `stat -c 'PERM_%a' ${KNOWN.file}`;
const FIX_PERM = `chmod 600 ${KNOWN.file}`;

interface LabDetail {
  readonly lab: {
    readonly id: string;
    readonly title: string;
    readonly interfaceLayout: string | null;
    readonly leaderboard: boolean;
    readonly tasks: readonly { readonly id: string; readonly title: string }[];
  };
}

async function loadKnownLab(api: APIRequestContext): Promise<LabDetail> {
  try {
    return await trpcQuery<LabDetail>(api, 'labs.get', { labId: KNOWN.labId });
  } catch (cause) {
    throw new Error(
      `Bản deploy không có lab '${KNOWN.labId}', là lab DUY NHẤT luồng này biết đáp án. ` +
        'Nội dung nạp từ image: kiểm content/labs trong image đang chạy. Không lùi sang lab ' +
        'khác, vì khi đó luồng không còn chứng minh được rằng một lab ĐẠT được.',
      { cause },
    );
  }
}

/*
  ⛔ DỌN PHIÊN KỂ CẢ KHI Ô ĐỎ. Một lượt đỏ giữa chừng bỏ lại một pod sống tới hết
  `SESSION_TTL`. Quota namespace của cụm lab nhỏ, nên vài lượt đỏ liên tiếp là
  kẹt chỗ, và lượt sau đỏ với `ResourceExhausted` ở NHẦM chỗ (đo 2026-09-14).
*/
test.afterEach(async ({ page }) => {
  if (await releaseSandboxQuietly(page)) {
    test.info().annotations.push({
      type: 'don-dep',
      description: 'Luồng đỏ khi phiên còn sống; afterEach đã bấm "Kết thúc phiên" để nhả khe quota.',
    });
  }
});

test.describe('luồng 2 — lab', { tag: '@flow' }, () => {
  test('mở lab → terminal chạy lệnh → IDE tải → chấm trượt → sửa → chấm đạt → nộp → xếp hạng', async ({
    page,
    api,
  }) => {
    test.setTimeout(SANDBOX_FLOW_TIMEOUT_MS);
    const rateLimited = watchRateLimits(page);
    // Đăng ký TRƯỚC khi mở phiên: frame đầu (dấu nhắc shell) đến ngay lúc mount.
    const traffic = watchTerminalTraffic(page);

    // ── 0. Nội dung mà luồng dựa vào ────────────────────────────────────────
    const { lab } = await loadKnownLab(api);
    const task = lab.tasks.find((candidate) => candidate.id === KNOWN.taskId);
    expect(
      task,
      `Lab '${KNOWN.labId}' không còn nhiệm vụ '${KNOWN.taskId}'. Đáp án của luồng gắn với ` +
        'nhiệm vụ đó: sửa KNOWN và READ_PERM/FIX_PERM theo nội dung mới.',
    ).toBeDefined();
    const taskTitle = task?.title ?? '';
    expect(
      lab.interfaceLayout,
      `Lab '${KNOWN.labId}' không còn khai layout ide, nên vế "IDE tải được" của luồng không ` +
        'còn đo gì. Chọn một lab có IDE thay vì bỏ vế đó.',
    ).toBe('ide');

    // ── 1. Mở lab từ danh mục, qua chính link của dòng ──────────────────────
    // Dòng danh mục (`BoardRow`) là MỘT link có tên = tiêu đề lab
    // (`aria-labelledby`). Đi bằng link, không `goto`: một dòng hỏng href là lỗi
    // thật mà `goto` đi vòng qua.
    await openScreen(page, '/labs', 'user');
    await expect(
      page.getByRole('heading', { level: 1, name: t('catalog.title.labs'), exact: true }),
    ).toBeVisible();
    const row = page.getByRole('link', { name: lab.title, exact: true });
    await expect(
      row,
      `Danh mục lab không có dòng '${lab.title}'. Lab có trong API nhưng không lên danh mục ` +
        '(hoặc nằm ngoài trang đầu của danh sách).',
    ).toBeVisible();
    await row.click();
    await page.waitForURL(`**/labs/${encodeURIComponent(KNOWN.labId)}`);
    await settle(page);

    // Trang thực hành là immersive: `<h1>` duy nhất nằm trên `WorkspaceBar`.
    await expect(page.getByRole('heading', { level: 1, name: lab.title, exact: true })).toBeVisible();

    // ── 2. Tiền đề: đủ nhiệm vụ, chưa có gì để nối, nút chấm khoá ───────────
    /*
      Khẳng định THEO DANH TÍNH, không theo số đếm: mọi nhiệm vụ API trả về phải
      có dòng của nó. Một phép đếm `listitem` còn đếm luôn các `<li>` trong
      markdown của nhiệm vụ đang mở (`TaskChecklist` bung đề bài NGAY trong `<li>`
      của nó), nên nó vừa lỏng vừa sai.
    */
    const taskList = page.getByRole('list', { name: t('session.lab.checklist-legend') });
    await expect(taskList, 'Không thấy danh sách nhiệm vụ của lab.').toBeVisible();
    for (const each of lab.tasks) {
      await expect(
        taskList.getByRole('button', { name: each.title }),
        `Nhiệm vụ '${each.title}' có trong labs.get nhưng không có dòng trên trang.`,
      ).toBeVisible();
    }

    // Mỗi dòng là một `<button data-state>` (`task-checklist.tsx`); bấm nó bung đề
    // + nút chấm + kết quả của đúng nhiệm vụ đó, ngay trong `<li>` của nó.
    const target = taskList.getByRole('button', { name: taskTitle });
    const targetItem = taskList.getByRole('listitem').filter({ has: page.getByRole('button', { name: taskTitle }) });
    await target.click();
    await expect(target).toHaveAttribute('aria-current', 'true');
    await expect(target).toHaveAttribute('data-state', 'not-attempted');

    const checkButton = targetItem.getByRole('button', { name: t('session.lab.check-one'), exact: true });
    await expect(checkButton).toBeDisabled();
    await expect(targetItem.getByText(t('session.lab.blocked-no-session'))).toBeVisible();

    // Bảng điểm: `role=status` duy nhất mang thước điểm (`lab-client.tsx`).
    const scoreMeter = page.getByRole('status').getByRole('meter', { name: t('session.lab.score-label') });
    await expect(scoreMeter).toHaveAttribute('aria-valuenow', '0');

    // Đối chứng của "terminal nối được": chưa bắt đầu thì KHÔNG có khoang terminal.
    await expect(
      terminalSurface(page),
      'Chưa bấm Bắt đầu mà đã có khoang terminal: khi đó "terminal nối được" bên dưới không ' +
        'còn phân biệt được với một khung vẽ sẵn.',
    ).toHaveCount(0);
    await expect(
      workspaceTab(page, 'editor'),
      'labs.get nói lab có IDE nhưng khoang làm việc không có tab Editor.',
    ).toBeVisible();

    // ── 3. Mở phiên ─────────────────────────────────────────────────────────
    // `lab-client` đặt nhãn "Làm lại" khi trang đã có một lần thử, "Bắt đầu" khi chưa.
    const restart = t('session.controls.restart');
    const startLabel = (await page.getByRole('button', { name: restart, exact: true }).count())
      ? restart
      : t('session.controls.start');
    const { sessionId } = await startSandbox(page, 'labs.startAttempt', rateLimited, startLabel);

    // ── 4. Terminal: có byte về, và shell CHẠY lệnh ─────────────────────────
    // Bài IDE mở ở tab Editor, hàng terminal mang `hidden` cho tới khi đổi tab.
    await workspaceTab(page, 'terminal').click();
    await expectTerminalLive(page, traffic);
    await typeInTerminal(page, SHELL_MARKER_CMD);
    await expectTerminalOutput(
      traffic,
      SHELL_MARKER_OUT,
      `Gõ \`${SHELL_MARKER_CMD}\` nhưng không thấy \`${SHELL_MARKER_OUT}\` quay về. Tiếng vọng ` +
        'mang HAI DẤU NHÁY, nên chuỗi này chỉ xuất hiện khi shell THỰC SỰ chạy lệnh.',
    );

    // ── 5. IDE tải được ────────────────────────────────────────────────────
    await expectIdeLoaded(page);

    // ── 6. Chờ setup nền của lab xong ───────────────────────────────────────
    /*
      ⏱ Chờ theo mốc PHA PHIÊN, không theo trần mặc định. `lab-client` khoá nút
      chấm vì BA lý do: chưa có lần thử, lần thử đã nộp, hoặc `setupPending`
      (setup chạy NỀN từ P15/15.C). Setup lab đi đường lạnh mất 17-26s (đo ở
      P15), luôn vượt trần 15s mặc định. Nút mở = setup đã gieo file cần sửa.
    */
    await expect(
      checkButton,
      'Nút "Chấm nhiệm vụ này" còn khoá sau khi phiên đã mở VÀ setup đã có đủ thời gian. ' +
        'Hai lý do khoá đầu mâu thuẫn với việc vừa bấm Bắt đầu; còn lại là `setupPending`: ' +
        'setup chạy quá lâu hoặc đã chết, đọc băng thông báo trên trang để biết.',
    ).toBeEnabled({ timeout: SESSION_READY_TIMEOUT_MS });

    // ── 7. Trước khi sửa: trạng thái hỏng, và phép chấm TRƯỢT ───────────────
    await workspaceTab(page, 'terminal').click();
    await typeInTerminal(page, READ_PERM);
    await expectTerminalOutput(
      traffic,
      'PERM_644',
      `Setup lẽ ra gieo ${KNOWN.file} với quyền 644. Không đọc được PERM_644 nghĩa là setup ` +
        'đổi, hoặc lệnh không chạy, và vế "trượt rồi mới đạt" bên dưới mất nghĩa.',
    );

    expect(
      await runCheck(page, checkButton, targetItem, 'labs.checkTask'),
      'Chấm TRƯỚC khi sửa mà đã "Đạt". Phép chấm không phân biệt bài làm đúng với sai, nên ' +
        'lượt "Đạt" sau khi sửa sẽ không chứng minh được gì.',
    ).toBe('failed');
    await expect(target).toHaveAttribute('data-state', 'failed');
    await expect(scoreMeter).toHaveAttribute('aria-valuenow', '0');

    // ── 8. Sửa bằng terminal, đọc lại, chấm ĐẠT ─────────────────────────────
    await typeInTerminal(page, FIX_PERM);
    await typeInTerminal(page, READ_PERM);
    await expectTerminalOutput(
      traffic,
      'PERM_600',
      `Đã gõ \`${FIX_PERM}\` nhưng terminal không đọc ra PERM_600: lệnh sửa không tới shell.`,
    );

    expect(
      await runCheck(page, checkButton, targetItem, 'labs.checkTask'),
      `File đã là 600 (terminal vừa đọc PERM_600) mà phép chấm vẫn trượt. Script chấm của ` +
        `nhiệm vụ '${KNOWN.taskId}' và trạng thái thật trong pod không khớp nhau.`,
    ).toBe('passed');
    await expect(target).toHaveAttribute('data-state', 'passed');

    // Điểm tổng suy từ `results` của lần thử, tải lại sau lượt chấm.
    await expect
      .poll(async () => Number(await scoreMeter.getAttribute('aria-valuenow')), {
        timeout: 30_000,
        message: 'Nhiệm vụ đã Đạt nhưng thước điểm tổng vẫn ở 0: kết quả chấm không vào lần thử.',
      })
      .toBeGreaterThan(0);

    // ── 9. Nộp bài ──────────────────────────────────────────────────────────
    await page.getByRole('button', { name: t('session.lab.submit'), exact: true }).click();
    // Hộp xác nhận (điểm chốt, không chấm lại được): bấm nút Nộp bài TRONG hộp.
    await page.getByRole('dialog').getByRole('button', { name: t('session.lab.submit'), exact: true }).click();
    // Đã nộp ⇒ `lab-client` khoá lượt chấm và in câu lý do: dấu hiệu quan sát được của "đã nộp".
    await expect(targetItem.getByText(t('session.lab.blocked-submitted'))).toBeVisible({ timeout: 60_000 });
    await expect(checkButton).toBeDisabled();

    // ── 10. Bảng xếp hạng ───────────────────────────────────────────────────
    // Tab chỉ tồn tại khi lab bật `leaderboard`. So với API cả HAI chiều: có cờ mà
    // không có tab là lỗi, không cờ mà có tab cũng là lỗi.
    const leaderboardTab = page.getByRole('tab', { name: t('session.lab.leaderboard-tab'), exact: true });
    if (lab.leaderboard) {
      await leaderboardTab.click();
      // Bảng gồm mọi lần thử ĐÃ NỘP của lab (`labs.leaderboard`), nên lần vừa nộp
      // bảo đảm bảng có ít nhất một dòng dữ liệu, không rơi vào trạng thái rỗng.
      await expect(
        page.getByRole('columnheader', { name: t('session.lab.col-learner'), exact: true }),
        'Tab "Bảng xếp hạng" mở ra nhưng không có bảng nào, dù vừa có một lần nộp.',
      ).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('columnheader', { name: t('session.lab.col-score'), exact: true })).toBeVisible();
    } else {
      await expect(leaderboardTab, 'Lab không bật leaderboard mà trang vẫn có tab Bảng xếp hạng.').toHaveCount(0);
    }

    // ── 11. Nhả ĐÚNG phiên của mình ─────────────────────────────────────────
    await endSandbox(page, sessionId, 'session.reap');

    if (rateLimited.length > 0) {
      test.info().annotations.push({
        type: 'rate-limit',
        description: `Lượt này ăn ${String(rateLimited.length)} phản hồi 429 ở: ${rateLimited.join(', ')}.`,
      });
    }
  });
});
