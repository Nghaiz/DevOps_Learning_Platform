/**
 * Đồ dùng chung cho BA luồng phiên sandbox (`lab`, `lesson`, `playground`): đọc
 * byte terminal, gõ lệnh, chờ IDE, đọc kết quả chấm.
 *
 * Tách khỏi `flow-kit.ts` vì đây là bộ đo của MÀN THỰC HÀNH (khoang làm việc
 * `components/session/**`), còn `flow-kit.ts` lo tài khoản, vai trò, tRPC và
 * vòng đời phiên. Tên file không khớp `**\/*.spec.ts` nên Playwright không nhặt nó làm test.
 *
 * ⛔ Mọi nhãn ở đây lấy từ `packages/copy` qua `t()`/`err()`. Một chuỗi chép
 * thẳng là bản sao thứ hai của dữ liệu, và bản sao thì trôi: `lab.flow` đã đỏ vì
 * lệch ĐÚNG MỘT TỪ với câu thật (`session.lab.blocked-submitted`).
 */

import type { Locator, Page } from '@playwright/test';
import { err, t } from '@devops-platform/copy';
import { SESSION_READY_TIMEOUT_MS, expect, isMutationOf } from './flow-kit';

// ── Terminal ───────────────────────────────────────────────────────────────

/**
 * Lệnh gõ vào terminal, và chuỗi PHẢI quay về.
 *
 * Hai dấu nháy rỗng ở giữa là cả mẹo: PTY echo lại nguyên văn `echo DLP''E2E-OK`
 * (có nháy), còn shell chỉ in `DLPE2E-OK` sau khi ĐÃ chạy lệnh. Tìm chuỗi
 * không-nháy vì thế không thể khớp nhầm với tiếng vọng của chính phím ta gõ.
 * Cùng mẹo dùng cho mọi lệnh đọc trạng thái bên dưới (`PERM_%a`, `PORT_IS_`):
 * chuỗi gõ vào và chuỗi in ra KHÁC nhau.
 */
export const SHELL_MARKER_CMD = "echo DLP''E2E-OK";
export const SHELL_MARKER_OUT = 'DLPE2E-OK';

/** Byte đi VỀ từ gateway trên WebSocket của phiên (`/ws/session/<id>`). */
export interface TerminalTraffic {
  /** Tổng byte PTY (frame binary). */
  readonly ptyBytes: () => number;
  /** Byte PTY giải mã UTF-8, nối liền qua mọi frame. */
  readonly ptyText: () => string;
  /** Frame text = control JSON (contract §5). */
  readonly controlFrames: readonly string[];
}

/**
 * Nghe WebSocket terminal. GỌI TRƯỚC khi mở phiên: socket được tạo ngay khi
 * `TerminalSurface` mount, nên một listener gắn muộn bỏ lỡ đúng những frame
 * đầu tiên, trong đó có dấu nhắc shell.
 *
 * Lọc theo đường `/ws/session/` (`buildSessionWsUrl`, `packages/terminal`):
 * máy dev còn một WebSocket HMR của Next, và frame text của nó sẽ lẫn vào
 * `controlFrames` nếu nghe mọi socket.
 */
export function watchTerminalTraffic(page: Page): TerminalTraffic {
  let bytes = 0;
  let text = '';
  const control: string[] = [];
  page.on('websocket', (ws) => {
    if (!new URL(ws.url()).pathname.startsWith('/ws/session/')) return;
    ws.on('framereceived', (frame) => {
      const payload = frame.payload;
      if (typeof payload === 'string') {
        control.push(payload);
        return;
      }
      bytes += payload.length;
      text += payload.toString('utf8');
    });
  });
  return { ptyBytes: () => bytes, ptyText: () => text, controlFrames: control };
}

/** Khoang terminal (`data-testid` đặt trong `packages/terminal/src/terminal-surface.tsx`). */
export function terminalSurface(page: Page): Locator {
  return page.getByTestId('dlp-terminal');
}

/** Tab của khoang làm việc (`components/session/workspace-panel.tsx`). */
export function workspaceTab(page: Page, which: 'editor' | 'terminal'): Locator {
  const name = which === 'editor' ? t('session.workspace.tab-editor') : t('session.workspace.tab-terminal');
  return page
    .getByRole('tablist', { name: t('session.workspace.tablist') })
    .getByRole('tab', { name, exact: true });
}

/**
 * Chờ terminal THẬT SỰ nói được: có khoang, pha `ready` trong vùng sống của
 * `SessionControls`, và ít nhất một byte PTY đã về.
 *
 * ⚠ Ở bài có IDE, khoang terminal mount nhưng mang `hidden` cho tới khi bấm tab
 * Terminal (bài IDE mở ở tab Editor, `use-workspace-tabs.ts`). Hàm này không đổi
 * tab: người gọi chọn tab trước.
 */
export async function expectTerminalLive(page: Page, traffic: TerminalTraffic): Promise<void> {
  await expect(
    terminalSurface(page),
    'Có sessionId nhưng khoang terminal không bao giờ hiện ra.',
  ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });

  await expect(
    page.getByTestId('dlp-session-controls').getByText(t('session.phase.ready'), { exact: true }),
    'Badge pha không bao giờ tới "Sandbox sẵn sàng". Gateway chưa gửi control `ready` ' +
      '(contract §5), hoặc parser đã bỏ frame đó: terminal vẽ được prompt nhưng badge ' +
      'đứng ở "Đang kết nối…" mãi, không log, không lỗi.',
  ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });

  await expect
    .poll(traffic.ptyBytes, {
      timeout: 60_000,
      message:
        'WebSocket mở nhưng KHÔNG một byte PTY nào đi về. Không có dấu nhắc shell nghĩa là ' +
        'pod chưa attach: một khoang terminal đen cũng "hiện ra" và mọi phép kiểm hình thức ' +
        'vẫn xanh trên nó.',
    })
    .toBeGreaterThan(0);
}

/**
 * Gõ một dòng lệnh vào terminal như người học: focus ô nhập của xterm, gõ, Enter.
 *
 * ⛔ Khẳng định focus TRƯỚC khi gõ. `focus()` trên phần tử trong cây `hidden`
 * (tab Editor đang mở) là no-op im lặng, và `keyboard.type` khi đó gõ vào hư
 * không: lệnh không chạy, phép chờ output đỏ 60s sau với một câu nói sai chỗ.
 */
export async function typeInTerminal(page: Page, command: string): Promise<void> {
  const surface = terminalSurface(page);
  await expect(surface, 'Khoang terminal đang bị ẩn: bấm tab Terminal trước khi gõ.').toBeVisible();
  const input = surface.locator('textarea').first();
  await input.waitFor({ state: 'attached', timeout: 30_000 });
  await input.focus();
  await expect(input, 'Ô nhập của xterm không nhận focus, phím gõ sẽ không tới shell.').toBeFocused();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

/** Chờ `needle` xuất hiện trong byte PTY đi về. */
export async function expectTerminalOutput(
  traffic: TerminalTraffic,
  needle: string,
  message: string,
): Promise<void> {
  await expect.poll(traffic.ptyText, { timeout: 60_000, message }).toContain(needle);
}

// ── IDE ────────────────────────────────────────────────────────────────────

/**
 * Câu mở đầu của màn "IDE không mở được" (`IdeFailedScreen`), dựng từ chính
 * mục copy: phần trước chỗ điền `reason`.
 */
function ideFailurePrefix(): string {
  const sentinel = '\u0000';
  const what = err('session.ide.error.probe', { reason: sentinel }).what;
  return what.slice(0, what.indexOf(sentinel));
}

/**
 * IDE đã TẢI, không chỉ "khung có mặt".
 *
 * Hai mốc, vì mỗi mốc một mình chứng minh quá ít:
 *   1. iframe có mặt. `IdePane` chỉ gắn iframe sau khi chính URL `/ide/session/<id>/`
 *      trả 2xx (nó `fetch` trước, không tin `load`), nên mốc này = "máy chủ IDE
 *      đã trả lời". Đua với màn thất bại (`role=alert`) để ô đỏ nói ĐÚNG lý do
 *      máy chủ đưa ra thay vì một timeout câm.
 *   2. Theia đã dựng xong vỏ của nó BÊN TRONG iframe. 2xx của index.html không
 *      chứng minh bundle JS chạy được (CSP, đường tĩnh sai): khi đó iframe trắng
 *      mà mốc 1 vẫn xanh. `#theia-app-shell` là id mà `ApplicationShell` của
 *      `@theia/core` tự đặt cho chính nó; CHƯA đo trên cụm này. Nếu ô này đỏ
 *      trong khi mắt thấy IDE chạy, kiểm selector này trước.
 *
 * Người gọi phải đang ở tab Editor: iframe nằm trong hàng bị `hidden` ở tab kia.
 */
export async function expectIdeLoaded(page: Page): Promise<void> {
  const tab = workspaceTab(page, 'editor');
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const iframe = page.getByTitle(t('session.ide.iframe-title'), { exact: true });
  const failed = page.getByRole('alert').filter({ hasText: ideFailurePrefix() });

  // 45s là hạn thăm dò của `IdePane` (`IDE_BOOT_TIMEOUT_MS`), tính từ lúc có
  // sessionId; nhân đôi để chừa nhịp cụm bận.
  await expect(
    iframe.or(failed),
    'Sau 90s khoang Editor vẫn ở màn chờ: không gắn iframe, cũng không báo lỗi.',
  ).toBeVisible({ timeout: 90_000 });
  if (await failed.isVisible()) {
    throw new Error(`Khoang IDE báo không mở được: ${await failed.innerText()}`);
  }

  await expect(
    iframe.contentFrame().locator('#theia-app-shell'),
    'Máy chủ IDE trả 2xx nhưng Theia không dựng được vỏ trong iframe (trang trắng). ' +
      'Xem CSP/đường tĩnh của /ide, hoặc selector `#theia-app-shell` nếu Theia đổi bản.',
  ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });
}

// ── Kết quả chấm ───────────────────────────────────────────────────────────

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Đạt" của `CheckResultPanel`. */
export const VERDICT_PASSED = t('session.task.state.passed');

/**
 * "Chưa đạt (exit N)" với N bất kỳ, dựng từ mục copy: gọi với một mã giả rồi
 * thay mã đó bằng `\d+`.
 */
export const VERDICT_FAILED = new RegExp(
  `^${escapeRegExp(t('session.task.state.failed-with-exit', { code: 987654 })).replace('987654', '\\d+')}$`,
);

/**
 * Chờ một lượt chấm VỀ TỚI NƠI trong `scope` (thẻ nhiệm vụ / bước đang mở) rồi
 * trả về nhánh của nó.
 *
 * `CheckResultPanel` có BA nhánh: `passed` / `failed` là thẻ `role=status`,
 * `infra` (lượt chấm không chạy được) là băng `role=alert`. Nhánh `infra` là lỗi
 * hạ tầng chấm bài, KHÔNG phải bài làm chưa đạt, nên nó luôn ném ở đây với câu
 * riêng thay vì đọc ra thành một "Chưa đạt".
 */
export async function readVerdict(scope: Locator): Promise<'passed' | 'failed'> {
  const passed = scope.getByRole('status').getByText(VERDICT_PASSED, { exact: true });
  const failed = scope.getByRole('status').getByText(VERDICT_FAILED);
  const infra = scope.getByRole('alert').filter({ hasText: t('session.task.state.infra') });

  await expect(
    passed.or(failed).or(infra),
    'Bấm chấm nhưng không có bảng kết quả nào hiện ra.',
  ).toBeVisible({ timeout: 120_000 });

  if (await infra.isVisible()) {
    throw new Error(
      `Lượt chấm không chạy được (nhánh infra của CheckResultPanel): ${await infra.innerText()}. ` +
        'Đây là lỗi hạ tầng chấm bài, không phải "bài làm chưa đạt".',
    );
  }
  return (await passed.isVisible()) ? 'passed' : 'failed';
}

/**
 * Bấm nút chấm, chờ CHÍNH lượt gọi chấm trả về, rồi đọc nhánh kết quả.
 *
 * ⚠ Chờ phản hồi trước khi đọc DOM. Lần chấm thứ hai trên cùng nhiệm vụ/bước
 * đứng ngay dưới kết quả của lần thứ nhất: đọc DOM ngay sau cú bấm có thể bắt
 * được thẻ CŨ ("Chưa đạt" của lượt trước) và báo sai nhánh. Trang đặt kết quả về
 * `running` (thẻ biến mất) ngay lúc bấm, nên khi phản hồi đã về thì thẻ đang hiện
 * chắc chắn là của lượt mới.
 */
export async function runCheck(
  page: Page,
  button: Locator,
  scope: Locator,
  proc: 'labs.checkTask' | 'lessons.checkStep',
): Promise<'passed' | 'failed'> {
  const answered = page.waitForResponse(isMutationOf(proc), { timeout: 120_000 });
  await button.click();
  const res = await answered;
  if (res.status() === 429) {
    throw new Error(`${proc} trả 429 (rate limit hoặc hết chỗ), không phải bài làm sai: ${(await res.text()).slice(0, 300)}`);
  }
  return readVerdict(scope);
}
