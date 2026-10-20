/**
 * Luồng 1 — bài học: đăng nhập qua form → vào danh mục qua mega menu "Học" → mở
 * bài → mở phiên → terminal CHẠY lệnh → IDE tải → chấm bước 1 TRƯỢT → sửa →
 * chấm lại ĐẠT → sang bước kế → nhả phiên (`phase-13.md:74`, 13.H mục 27).
 *
 * ── Vì sao luồng này KHÔNG dùng storageState của globalSetup ────────────────
 * Đây là luồng duy nhất có chữ "đăng nhập" trong tên. Chạy với cookie nạp sẵn
 * thì bước đăng nhập biến thành một `goto`: trang `/login` không bao giờ được
 * điền, và ô AC vẫn xanh kể cả khi form đăng nhập đã hỏng hoàn toàn.
 *
 * ── Vì sao bài được CỐ ĐỊNH ─────────────────────────────────────────────────
 * Bản trước lấy thẻ đầu danh mục và chỉ khẳng định "lượt chấm chạy tới nơi"
 * (Đạt HOẶC Chưa đạt đều xanh), nên không bao giờ chứng minh được rằng người
 * học qua được một bước. Muốn thấy "Đạt" thì harness phải biết đáp án, và đáp án
 * nằm ngay trong repo:
 *
 *   `content/scenarios/dlp-ide-config-edit/intro/background.sh` gieo
 *   `/root/lab/app.conf` với `port=0`, và `step1/verify.sh` chỉ đạt khi dòng đó
 *   là `port=8080` VÀ hai dòng còn lại còn nguyên.
 *
 * Bài này còn là bài khai `interface.layout: ide` đầu tiên của repo, nên luồng
 * đo được cả khoang IDE của trang bài học. Bản deploy thiếu bài này ⇒ ĐỎ, không
 * lùi sang bài khác (một bài không biết đáp án chỉ cho phép khẳng định điều yếu cũ).
 *
 * ── Đối chứng cùng lượt ─────────────────────────────────────────────────────
 * Trước khi sửa: terminal đọc `PORT_IS_0` và phép chấm TRƯỢT. Sau khi sửa:
 * terminal đọc `PORT_IS_8080` và phép chấm ĐẠT. Một phép chấm luôn trả đạt sẽ
 * đỏ ở vế trượt thay vì lặng lẽ làm vế đạt xanh.
 */

import type { APIRequestContext, Response } from '@playwright/test';
import { t } from '@devops-platform/copy';
import {
  ACCOUNT_PASSWORD,
  ANONYMOUS_STATE,
  SANDBOX_FLOW_TIMEOUT_MS,
  SESSION_READY_TIMEOUT_MS,
  endSandbox,
  expect,
  isMutationOf,
  releaseSandboxQuietly,
  signInThroughForm,
  startSandbox,
  test,
  trpcData,
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
import { settle } from '../fixtures/nav';

/** Bài và file mà harness biết đáp án. Xem khối chú thích đầu file. */
const KNOWN = {
  scenarioId: 'dlp-ide-config-edit',
  file: '/root/lab/app.conf',
} as const;

/**
 * In `PORT_IS_0` / `PORT_IS_8080`; tiếng vọng của lệnh gõ vào mang
 * `s/^port=/PORT_IS_/p`, nên tìm `PORT_IS_8080` chỉ khớp KẾT QUẢ.
 */
const READ_PORT = `sed -n 's/^port=/PORT_IS_/p' ${KNOWN.file}`;
/** Sửa đúng một dòng: `verify.sh` trượt nếu `name=`/`log_level=` biến mất. */
const FIX_PORT = `sed -i 's/^port=0$/port=8080/' ${KNOWN.file}`;

interface LessonDetail {
  readonly scenario: {
    readonly id: string;
    readonly title: string;
    readonly interfaceLayout: string | null;
    readonly steps: readonly { readonly index: number; readonly title: string | null }[];
  };
}

async function loadKnownLesson(api: APIRequestContext): Promise<LessonDetail> {
  try {
    return await trpcQuery<LessonDetail>(api, 'lessons.get', { scenarioId: KNOWN.scenarioId });
  } catch (cause) {
    throw new Error(
      `Bản deploy không có bài '${KNOWN.scenarioId}', là bài DUY NHẤT luồng này biết đáp án. ` +
        'Nội dung nạp từ image: kiểm content/scenarios trong image đang chạy.',
      { cause },
    );
  }
}

test.afterEach(async ({ page }) => {
  if (await releaseSandboxQuietly(page)) {
    test.info().annotations.push({
      type: 'don-dep',
      description: 'Luồng đỏ khi phiên còn sống; afterEach đã bấm "Kết thúc phiên" để nhả khe quota.',
    });
  }
});

test.describe('luồng 1 — bài học', { tag: '@flow' }, () => {
  test.use({ storageState: ANONYMOUS_STATE });

  test('đăng nhập → mega menu → mở bài → terminal + IDE → chấm trượt → sửa → chấm đạt → kết thúc', async ({
    page,
    api,
    account,
  }) => {
    test.setTimeout(SANDBOX_FLOW_TIMEOUT_MS);
    const rateLimited = watchRateLimits(page);
    const traffic = watchTerminalTraffic(page);

    // `runSetup` của phase đầu chạy SAU khi terminal nối (`lesson-client.tsx`) và
    // chỉ trả về khi script `background` đã chạy xong (`lessons.runSetup` await
    // `runScriptInSession`). Gom từ đầu: nó có thể về trước khi bước 5 kịp nghe.
    const setupResponses: Response[] = [];
    page.on('response', (res) => {
      if (isMutationOf('lessons.runSetup')(res)) setupResponses.push(res);
    });

    // ── 0. Nội dung mà luồng dựa vào ────────────────────────────────────────
    // `api` mang storageState của globalSetup, độc lập với jar RỖNG của trang.
    const { scenario } = await loadKnownLesson(api);
    const firstStepTitle = scenario.steps[0]?.title ?? null;
    const nextStepTitle = scenario.steps[1]?.title ?? null;
    expect(
      firstStepTitle,
      `Bài '${KNOWN.scenarioId}' không còn bước 1 có tiêu đề. Đáp án của luồng gắn với bước đó.`,
    ).not.toBeNull();
    expect(
      scenario.interfaceLayout,
      `Bài '${KNOWN.scenarioId}' không còn khai layout ide, nên vế "IDE tải được" không còn đo gì.`,
    ).toBe('ide');

    // ── 1. Đăng nhập qua form ────────────────────────────────────────────────
    await signInThroughForm(page, account.email, ACCOUNT_PASSWORD);

    // ── 2. Vào danh mục bằng mega menu của header ──────────────────────────
    /*
      Đi bằng điều hướng của vỏ, không `goto('/lessons')`: một link nav hỏng là
      lỗi thật mà `goto` đi vòng qua. Từ bản dựng lại 2026-10, mục "Học" trên thanh
      trên cùng trỏ tới trang tổng quan `/learn`, và các trang con nằm trên thanh mục
      con ngay dưới (`components/shell/section-bar.tsx`).
    */
    const mainNav = page.getByRole('navigation', { name: t('shell.nav.aria'), exact: true });
    await mainNav.getByRole('link', { name: t('shell.section.learn'), exact: true }).click();
    await page.waitForURL('**/learn');
    const learnBar = page.getByRole('navigation', {
      name: t('shell.subnav.aria', { section: t('shell.section.learn') }),
      exact: true,
    });
    await learnBar.getByRole('link', { name: t('shell.nav.lessons'), exact: true }).click();
    await page.waitForURL('**/lessons');
    await expect(
      page.getByRole('heading', { level: 1, name: t('catalog.title.lessons'), exact: true }),
    ).toBeVisible();

    // ── 3. Mở bài qua chính link của dòng danh mục ─────────────────────────
    // `BoardRow` là MỘT link, tên = tiêu đề bài (`aria-labelledby`).
    const row = page.getByRole('link', { name: scenario.title, exact: true });
    await expect(
      row,
      `Danh mục bài học không có dòng '${scenario.title}' (hoặc bài nằm ngoài trang đầu).`,
    ).toBeVisible();
    await row.click();
    await page.waitForURL(`**/lessons/${encodeURIComponent(KNOWN.scenarioId)}`);
    await settle(page);

    // Trang bài là immersive: `<h1>` duy nhất nằm trên `WorkspaceBar`. Khung chờ
    // ("Đang tải bài học…") và "Không tìm thấy bài học này." đều KHÔNG có h1.
    await expect(page.getByText(t('session.lesson.not-found'))).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: scenario.title, exact: true })).toBeVisible();

    // ── 4. Chọn bước 1 từ tuyến các bước, kiểm tiền đề ──────────────────────
    /*
      Bài mở lại ĐÚNG chỗ đang dở của tài khoản (`progress.stepIndex`), nên không
      giả định nó mở ở bước 1: bấm thẳng ga của bước 1 trên `StepNav`. Tên nút =
      tiêu đề bước + trạng thái (chữ ẩn), nên khớp chuỗi con theo tiêu đề.
    */
    const stepList = page.getByRole('list', { name: t('session.steps.list'), exact: true });
    const firstStep = stepList.getByRole('button', { name: firstStepTitle ?? '' });
    await firstStep.click();
    await expect(firstStep).toHaveAttribute('aria-current', 'step');
    // Từ bản dựng lại 2026-10, dải bước chỉ còn nút chọn bước; nút Kiểm tra, lý do khoá và kết
    // quả chấm nằm cuối khoang đọc (`<article>` của bước đang xem).
    const lessonPane = page.getByRole('article');

    const check = lessonPane.getByRole('button', { name: t('session.lesson.check'), exact: true });
    await expect(check, 'Bước 1 có script chấm nhưng không có nút "Kiểm tra".').toBeVisible();
    await expect(check).toBeDisabled();
    await expect(lessonPane.getByText(t('session.check.blocked-no-session'))).toBeVisible();

    await expect(
      terminalSurface(page),
      'Chưa bấm Bắt đầu mà đã có khoang terminal: "terminal nối được" bên dưới khi đó không ' +
        'phân biệt được với một khung vẽ sẵn.',
    ).toHaveCount(0);
    await expect(
      workspaceTab(page, 'editor'),
      'lessons.get nói bài có IDE nhưng khoang làm việc không có tab Editor.',
    ).toBeVisible();

    // ── 5. Mở phiên, terminal chạy lệnh ─────────────────────────────────────
    const { sessionId } = await startSandbox(page, 'lessons.startSession', rateLimited);

    // Có phiên thì bài IDE về tab Editor; hàng terminal mang `hidden` cho tới khi đổi tab.
    await workspaceTab(page, 'terminal').click();
    await expectTerminalLive(page, traffic);
    await typeInTerminal(page, SHELL_MARKER_CMD);
    await expectTerminalOutput(
      traffic,
      SHELL_MARKER_OUT,
      `Gõ \`${SHELL_MARKER_CMD}\` nhưng không thấy \`${SHELL_MARKER_OUT}\` quay về: shell chưa chạy lệnh.`,
    );

    // ── 6. IDE tải được ────────────────────────────────────────────────────
    await expectIdeLoaded(page);

    // ── 7. Setup của bài đã chạy xong ───────────────────────────────────────
    await expect
      .poll(() => setupResponses.length, {
        timeout: SESSION_READY_TIMEOUT_MS,
        message: 'Terminal đã nối mà trang không gọi `lessons.runSetup`: file cần sửa không được gieo.',
      })
      .toBeGreaterThan(0);
    const setupRes = setupResponses[0];
    expect(setupRes?.ok(), `lessons.runSetup trả HTTP ${String(setupRes?.status())}.`).toBe(true);
    const setup = (setupRes === undefined ? null : await trpcData(setupRes, 'lessons.runSetup')) as {
      ran?: boolean;
    } | null;
    expect(setup?.ran, '`lessons.runSetup` trả về nhưng script background của bài KHÔNG chạy.').toBe(true);

    // ── 8. Trước khi sửa: trạng thái hỏng, và phép chấm TRƯỢT ───────────────
    await workspaceTab(page, 'terminal').click();
    await typeInTerminal(page, READ_PORT);
    await expectTerminalOutput(
      traffic,
      'PORT_IS_0',
      `Setup lẽ ra gieo ${KNOWN.file} với port=0. Không đọc được PORT_IS_0 nghĩa là setup đổi, ` +
        'hoặc lệnh không chạy, và vế "trượt rồi mới đạt" mất nghĩa.',
    );

    // Nút Kiểm tra chỉ mở ở pha ready (M6): chờ theo mốc pha phiên.
    await expect(check).toBeEnabled({ timeout: SESSION_READY_TIMEOUT_MS });
    expect(
      await runCheck(page, check, lessonPane, 'lessons.checkStep'),
      'Chấm TRƯỚC khi sửa mà đã "Đạt": phép chấm không phân biệt đúng sai, nên lượt "Đạt" ' +
        'sau khi sửa sẽ không chứng minh được gì.',
    ).toBe('failed');

    // ── 9. Sửa, đọc lại, chấm ĐẠT ──────────────────────────────────────────
    await typeInTerminal(page, FIX_PORT);
    await typeInTerminal(page, READ_PORT);
    await expectTerminalOutput(
      traffic,
      'PORT_IS_8080',
      `Đã gõ \`${FIX_PORT}\` nhưng terminal không đọc ra PORT_IS_8080: lệnh sửa không tới shell.`,
    );
    expect(
      await runCheck(page, check, lessonPane, 'lessons.checkStep'),
      'File đã có port=8080 (terminal vừa đọc ra) mà phép chấm bước 1 vẫn trượt.',
    ).toBe('passed');

    // Thước tiến độ trên thanh trên đếm bước ĐÃ ĐẠT trong lượt xem này
    // (`progress.ts`), hoặc đầy nếu bài đã xong từ trước: sau một lượt Đạt, ≥ 1.
    const progressMeter = page.getByRole('meter', { name: t('session.lesson.progress-label'), exact: true });
    await expect
      .poll(async () => Number(await progressMeter.getAttribute('aria-valuenow')), {
        timeout: 30_000,
        message: 'Bước 1 đã Đạt nhưng thước tiến độ vẫn ở 0.',
      })
      .toBeGreaterThanOrEqual(1);

    // ── 10. Sang bước kế bằng nút "Tiếp" ────────────────────────────────────
    if (nextStepTitle !== null) {
      await page.getByRole('button', { name: t('session.steps.next'), exact: true }).click();
      await expect(stepList.getByRole('button', { name: nextStepTitle })).toHaveAttribute('aria-current', 'step');
    }

    // ── 11. Nhả ĐÚNG phiên của mình ─────────────────────────────────────────
    await endSandbox(page, sessionId, 'lessons.endSession');

    if (rateLimited.length > 0) {
      test.info().annotations.push({
        type: 'rate-limit',
        description: `Lượt này ăn ${String(rateLimited.length)} phản hồi 429 ở: ${rateLimited.join(', ')}.`,
      });
    }
  });
});
