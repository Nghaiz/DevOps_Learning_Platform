/**
 * Đồ dùng chung của SÁU luồng `@flow` (13.H mục 27 · `phase-13.md:74`).
 *
 * ⛔ Không phải một khuôn thứ hai. `fixtures/api.ts` (tài khoản + tRPC),
 * `fixtures/nav.ts` (mở màn hình và khẳng định tiền đề), `routes.ts` (D12) và
 * `global-setup.ts` (đăng nhập một lần) đã có; file này CHỈ thêm những thứ mà
 * riêng luồng cần và bốn file kia không có chỗ để đặt: mật khẩu của tài khoản
 * lượt chạy, cổng vai trò dạng ĐỎ, đọc phản hồi tRPC, và vòng đời phiên sandbox
 * (mở / nhả) lặp ở ba luồng. Bộ đo khoang làm việc (terminal, IDE, kết quả
 * chấm) nằm ở `session-kit.ts`.
 *
 * Tên file không khớp `testMatch` mặc định (`**\/*.spec.ts`) nên Playwright
 * không nhặt nó làm file test.
 */

import type { Page, Response } from '@playwright/test';
import { t } from '@devops-platform/copy';
import { expect, test } from '../fixtures/api';
import { E2E_PASSWORD, THROWAWAY_PASSWORD } from '../env';
import { roleSatisfies, type AuthLevel } from '../routes';
import type { E2EAccount } from '../global-setup';

/**
 * Mật khẩu của tài khoản mà `global-setup` đã dùng — SUY RA từ cùng một quy
 * tắc, không đoán.
 *
 * `global-setup` có đúng hai nhánh: đặt `E2E_EMAIL`+`E2E_PASSWORD` ⇒ đăng nhập
 * lại tài khoản đó; không đặt ⇒ đăng ký mới với `THROWAWAY_PASSWORD`. Nhánh
 * nào cũng cho ra biểu thức dưới đây, nên nó đúng ở cả hai — chứ không phải
 * "thường thì đúng".
 *
 * Vì sao luồng 1 cần mật khẩu: nó phải đăng nhập QUA FORM. Một luồng "đăng
 * nhập" mà thật ra chỉ nạp sẵn cookie của globalSetup thì không kiểm gì về
 * trang đăng nhập cả, và ô AC sẽ xanh kể cả khi nút Đăng nhập đã hỏng.
 */
export const ACCOUNT_PASSWORD = E2E_PASSWORD !== '' ? E2E_PASSWORD : THROWAWAY_PASSWORD;

/** Jar cookie rỗng — cho luồng phải tự đăng nhập. */
export const ANONYMOUS_STATE = { cookies: [], origins: [] };

/**
 * Dựng một sandbox mất tới ~49 giây trên cụm lab cho bài Kubernetes
 * (`components/author/publish-panel.tsx` nói đúng con số đó với người soạn), và
 * một luồng còn phải chấm sau khi dựng xong. `timeout: 60_000` mặc định của
 * `playwright.config.ts` là ngân sách cho một màn hình tĩnh, không phải cho
 * một vòng đời phiên.
 */
export const SANDBOX_FLOW_TIMEOUT_MS = 5 * 60_000;

/** Chờ pha phiên đổi. Không phải ngân sách hiệu năng — `perf.spec.ts` đo riêng. */
export const SESSION_READY_TIMEOUT_MS = 120_000;

/**
 * Cổng vai trò — ĐỎ khi `E2E_REQUIRE_ROLES=1`, skip khi không.
 *
 * §3ter ràng buộc 7: một lượt mà cả năm màn quản trị đều SKIP trông y hệt một
 * lượt chúng PASS, trong bảng tổng kết lẫn trong exit code.
 *
 * ⚠ `a11y.spec.ts` đã có một ô đối chứng cho chính chuyện này, nhưng nó KHÔNG
 * cứu được các luồng: `pnpm e2e:flow` chạy `--grep @flow`, mà ô đó không mang
 * tag `@flow` nên nó không hề chạy trong lượt luồng. Cổng phải nằm TRONG chính
 * test có tag, và đó là lý do hàm này ném chứ không chỉ báo.
 *
 * Vai trò đọc từ `/api/auth/get-session` lúc globalSetup, MỘT lần. Promote
 * bằng `e2e/scripts/promote-role.sh` phải xảy ra TRƯỚC lượt chạy.
 */
export function requireRole(account: E2EAccount, required: AuthLevel): void {
  if (roleSatisfies(account.role, required)) return;

  const how =
    `Tài khoản ${account.email} có vai trò '${account.role}', luồng này cần '${required}'. ` +
    `Chạy \`apps/web/e2e/scripts/promote-role.sh\` cho tài khoản đó TRÊN VM TRƯỚC khi ` +
    `chạy suite (global-setup đọc vai trò đúng một lần lúc bắt đầu).`;

  if (process.env.E2E_REQUIRE_ROLES === '1') {
    throw new Error(`${how} E2E_REQUIRE_ROLES=1 nên đây là LỖI, không phải skip.`);
  }
  test.skip(true, `${how} Đặt E2E_REQUIRE_ROLES=1 ở lượt nghiệm thu để biến skip này thành đỏ.`);
}

/**
 * Đăng nhập qua FORM (không phải qua API, không phải bằng storageState).
 *
 * Nhãn lấy từ copy (`auth.login.submit`, `auth.field.email`,
 * `auth.field.password`). `exact` trên nút submit vẫn giữ: header trang có một
 * LINK "Đăng nhập" (`shell.header.sign-in`), và một phép khớp chuỗi con sẽ bắt
 * nhầm ngay khi ai đó đổi link ấy thành nút.
 */
export async function signInThroughForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const submit = page.getByRole('button', { name: t('auth.login.submit'), exact: true });
  await expect(submit).toBeVisible();

  // ⚠ CHỜ HYDRATE TRƯỚC KHI BẤM — nút hiện ra KHÔNG có nghĩa là nó đã hoạt động.
  //
  // Trang đăng nhập là `<form onSubmit={…}>` + `<button type="submit">`. HTML đó
  // do server render, nên nút bấm được ngay; nhưng cho tới khi React gắn handler,
  // một cú bấm chạy đường SUBMIT NATIVE của trình duyệt: GET `/login`, trang tải
  // lại, chữ đã nhập mất, và KHÔNG có một request `sign-in` nào.
  //
  // Đo 2026-09-07: đó chính là hai lần đỏ của luồng 1, và cả hai đều nói dối về
  // nguyên nhân — lần đầu là `waitForURL` timeout 60s với log
  // `navigated to ".../login"`, lần sau là `waitForResponse` timeout 30s. Cả hai
  // đọc ra như "nút Đăng nhập hỏng", trong khi làm tay bằng trình duyệt thật thì
  // vào thẳng `/me`. Khác biệt duy nhất là NHỊP TAY.
  //
  // (Không có rò rỉ kèm theo: các `Input` không khai `name`, nên lượt submit
  // native đi tới `/login` KHÔNG mang tham số nào — mật khẩu không lên URL.)
  //
  // ⚠ SỬA 2026-09-07 — nay chờ một dấu hiệu CÔNG KHAI, không phải nội tạng React.
  //
  // `login-form.tsx` khoá nút cho tới khi `useEffect` chạy, nên `enabled` LÀ
  // định nghĩa của "đã hydrate" ở trang này. Bản trước dò khoá `__reactFiber$…`
  // trên node DOM — đúng việc, nhưng là chi tiết cài đặt của React và nó chờ
  // đúng thứ mà người dùng thật KHÔNG thấy.
  //
  // Đổi này còn làm phép chờ thành một cổng hai chiều: nếu ai đó gỡ `disabled`
  // khỏi nút, câu lệnh dưới trả về NGAY (nút luôn enabled) và ta quay lại bấm
  // sớm — nhưng khi ấy chính lỗi cũ tái xuất và các luồng đỏ lại. Còn nếu khoá
  // không bao giờ mở (hydrate hỏng), nó đỏ ở ĐÂY với một câu đọc được, thay vì
  // đỏ 30s sau ở `waitForResponse` với một câu nói dối về nguyên nhân.
  await expect(submit).toBeEnabled({ timeout: 30_000 });

  await page.getByLabel(t('auth.field.email'), { exact: true }).fill(email);
  await page.getByLabel(t('auth.field.password'), { exact: true }).fill(password);

  // ⚠ ĐỌC MÃ TRẠNG THÁI CỦA CHÍNH LƯỢT ĐĂNG NHẬP, đừng chỉ chờ điều hướng.
  //
  // Better Auth chặn đăng nhập ở **3 lượt/phút theo IP** (đo 2026-09-07:
  // 200,200,200,429,429,429 trên sáu lượt liên tiếp). Harness tiêu HAI lượt cho
  // mỗi mẻ — `global-setup` đăng nhập bằng API, rồi luồng này đăng nhập lại qua
  // form — nên một lượt chạy chia mẻ dày sẽ tự đá vào chân mình.
  //
  // Khi ấy `waitForURL('**/me')` chết bằng một timeout 60s chỉ nói
  // "navigated to /login", và không có gì trên trang để đọc ra nguyên nhân:
  // form nhận `authError` nhưng lượt đo tiếp theo lại thấy trang sạch. Hai lượt
  // 09-07 đỏ đúng như vậy và đọc ra như "nút Đăng nhập hỏng" — trong khi đăng
  // nhập bằng chính bộ thông tin đó, làm tay, đi thẳng vào `/me`.
  //
  // Bắt response ngay tại nguồn thì 429 nói ra tên của nó.
  const signIn = page.waitForResponse(
    (res) => res.url().includes('/api/auth/sign-in/email') && res.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await submit.click();
  const res = await signIn;

  if (res.status() === 429) {
    throw new Error(
      'Đăng nhập qua form trả 429 — RATE LIMIT của Better Auth (3 lượt/phút theo IP), ' +
        'KHÔNG phải form hỏng. Harness tiêu 2 lượt mỗi mẻ (global-setup dùng API, luồng ' +
        'này dùng form). Giãn nhịp thưa hơn: `paced-run.sh flows --batch 1 --sleep 120`.',
    );
  }
  if (!res.ok()) {
    throw new Error(
      `Đăng nhập qua form trả HTTP ${String(res.status())}: ${(await res.text()).slice(0, 200)}`,
    );
  }

  // `login-form.tsx` đẩy sang `/me` sau khi Better Auth trả phiên. Chờ ĐÍCH,
  // không chờ một khoảng thời gian: cụm rảnh và cụm bận cho hai con số khác
  // nhau, và một `waitForTimeout` chọn cho cụm rảnh đã làm đỏ oan ở P12.
  await page.waitForURL('**/me', { timeout: 60_000 });
}

// ── tRPC ───────────────────────────────────────────────────────────────────

/** Các procedure trong một URL tRPC (`/api/trpc/a,b?batch=1`). */
function proceduresOf(url: string): readonly string[] {
  const { pathname } = new URL(url);
  if (!pathname.startsWith('/api/trpc/')) return [];
  return decodeURIComponent(pathname.slice('/api/trpc/'.length)).split(',');
}

/**
 * Lời gọi tRPC POST (mutation) tới `proc`, kể cả khi nó đi chung một mẻ batch
 * với procedure khác: phép so `url.includes('/api/trpc/<proc>')` trượt mất ca đó.
 */
export function isMutationOf(proc: string): (res: Response) => boolean {
  return (res) => res.request().method() === 'POST' && proceduresOf(res.url()).includes(proc);
}

type TrpcEnvelope = {
  readonly error?: { readonly message?: string };
  readonly result?: { readonly data?: unknown };
};

/**
 * Bóc `data` của ĐÚNG `proc` khỏi phản hồi tRPC.
 *
 * `httpBatchLink` (`lib/trpc-react.tsx`) gói phản hồi trong MỘT MẢNG kể cả khi chỉ
 * có một lời gọi, xếp theo thứ tự procedure trên URL. Đọc thẳng `body.result`
 * ra `undefined`, im lặng, và mọi khẳng định phía sau đo trên một id rỗng.
 */
export async function trpcData(res: Response, proc: string): Promise<unknown> {
  const parsed: unknown = JSON.parse(await res.text());
  const index = Math.max(proceduresOf(res.url()).indexOf(proc), 0);
  const entry = (Array.isArray(parsed) ? parsed[index] : parsed) as TrpcEnvelope | undefined;
  if (entry?.error !== undefined) {
    throw new Error(`${proc} trả lỗi tRPC: ${entry.error.message ?? JSON.stringify(entry.error)}`);
  }
  return entry?.result?.data;
}

/** Gom mọi phản hồi 429 của lượt chạy để thông báo lỗi nói ra được nhịp chạy. */
export function watchRateLimits(page: Page): string[] {
  const hits: string[] = [];
  page.on('response', (res) => {
    if (res.status() === 429) hits.push(new URL(res.url()).pathname);
  });
  return hits;
}

// ── Vòng đời phiên ─────────────────────────────────────────────────────────

/** Ba trình học mở phiên bằng ba procedure khác nhau. */
export type StartProc = 'labs.startAttempt' | 'lessons.startSession' | 'playgrounds.start';

export interface StartedSandbox {
  readonly sessionId: string;
  /** `data` của procedure mở phiên (vd. `attemptId` của lab). */
  readonly data: Readonly<Record<string, unknown>>;
}

function sessionIdOf(data: Readonly<Record<string, unknown>>): string {
  // Lab + sân chơi trả `{ sessionId }`. Bài học trả `{ session: CreatedSession }`,
  // và id nằm ở `session.id` (`packages/terminal/src/session-machine.ts`).
  const direct = data.sessionId;
  if (typeof direct === 'string') return direct;
  const nested = (data.session as { id?: unknown } | null | undefined)?.id;
  return typeof nested === 'string' ? nested : '';
}

/**
 * Bấm nút mở phiên, ĐỌC MÃ TRẠNG THÁI của chính lượt gọi, rồi chờ phiên THẬT SỰ
 * có `sessionId` trên UI.
 *
 * Vì sao đọc mã trạng thái chứ không đọc DOM: cụm dùng chung có hai thứ trả 429
 * trông y hệt lỗi ứng dụng, rate-limit Traefik (`ratelimit-web` 120/1m burst 60,
 * theo IP nguồn) và trần sandbox đồng thời của orchestrator. Câu lỗi tách hai ca
 * để lượt sau không ghi nhịp chạy thành lỗi sản phẩm.
 *
 * Dấu hiệu "có phiên" là nút "Kết thúc phiên": `SessionControls` chỉ vẽ nó khi
 * `state.sessionId !== null` (C5). Badge pha mong manh hơn, nó đổi vài lần trong
 * một lượt dựng.
 *
 * Nhãn nút mở: `session.controls.start`; riêng lab đã có lần thử thì
 * `session.controls.restart` (`lab-client.tsx`).
 */
export async function startSandbox(
  page: Page,
  proc: StartProc,
  rateLimited: readonly string[],
  startLabel: string = t('session.controls.start'),
): Promise<StartedSandbox> {
  const response = page.waitForResponse(isMutationOf(proc), { timeout: 90_000 });
  await page.getByRole('button', { name: startLabel, exact: true }).click();
  const res = await response;

  if (res.status() === 429) {
    const body = (await res.text()).slice(0, 400);
    // Câu 'trần số sandbox đồng thời' là chữ của máy chủ, không thuộc packages/copy.
    throw new Error(
      body.includes('trần số sandbox đồng thời')
        ? `${proc} trả 429 vì CỤM HẾT CHỖ (trần sandbox đồng thời), không phải sản phẩm hỏng. ` +
          `Món nợ ĐÃ GHI ở phase-13.md:96-98 ("còn N chỗ" đếm theo profile mặc định). Thân: ${body}`
        : `${proc} trả 429 vì RATE LIMIT (Traefik, theo IP nguồn), không phải sản phẩm hỏng. ` +
          `Giãn nhịp: \`e2e/scripts/paced-run.sh <spec> --batch 1\`. Thân: ${body}`,
    );
  }
  if (!res.ok()) {
    throw new Error(
      `${proc} trả HTTP ${String(res.status())}: ${(await res.text()).slice(0, 300)}` +
        (rateLimited.length > 0 ? `. Trong lượt này đã có 429 ở: ${rateLimited.join(', ')}` : ''),
    );
  }

  const data = ((await trpcData(res, proc)) ?? {}) as Readonly<Record<string, unknown>>;
  const sessionId = sessionIdOf(data);
  expect(
    sessionId,
    `${proc} trả 200 nhưng body không có sessionId. Không có nó thì bước kết thúc không ` +
      'chứng minh được là ta nhả ĐÚNG phiên của mình.',
  ).not.toBe('');

  await expect(
    page.getByRole('button', { name: t('session.controls.end'), exact: true }),
    'Phiên đã được cấp ở server nhưng UI không bao giờ vào trạng thái có phiên.',
  ).toBeVisible({ timeout: SESSION_READY_TIMEOUT_MS });

  return { sessionId, data };
}

/** Procedure nhả phiên: bài học có router riêng, lab + sân chơi dùng `session.reap`. */
export type EndProc = 'lessons.endSession' | 'session.reap';

/**
 * Kết thúc phiên, chứng minh ta nhả ĐÚNG phiên của mình, và khẳng định nó ĐÃ
 * biến mất khỏi UI.
 *
 * Không phải phép dọn dẹp lịch sự: một phiên còn sống giữ một khe trong trần
 * ~20 pod của cụm lab (P12), nên một luồng quên nhả sẽ làm luồng CHẠY SAU nó đỏ
 * vì hết chỗ, và lỗi hiện ra ở nhầm luồng. Nút "Kết thúc phiên" bấm được ở mọi
 * pha có sessionId, nên một trang giữ nhầm phiên khác vẫn cho ra một cú bấm
 * "thành công"; vế so `sessionId` trong body request chặn đúng ca đó.
 */
export async function endSandbox(page: Page, sessionId: string, proc: EndProc): Promise<void> {
  const end = page.getByRole('button', { name: t('session.controls.end'), exact: true });
  const sent = page.waitForRequest(
    (req) => req.method() === 'POST' && proceduresOf(req.url()).includes(proc),
    { timeout: 60_000 },
  );
  const answered = page.waitForResponse(isMutationOf(proc), { timeout: 60_000 });
  await end.click();

  expect(
    (await sent).postData() ?? '',
    `Lượt \`${proc}\` KHÔNG mang sessionId '${sessionId}' mà chính luồng này vừa tạo.`,
  ).toContain(sessionId);
  const res = await answered;
  expect(res.ok(), `${proc} trả HTTP ${String(res.status())}; phiên có thể còn giữ một khe quota.`).toBe(
    true,
  );

  await expect(end, 'Bấm Kết thúc nhưng nút vẫn còn: máy trạng thái chưa nhận `ENDED`.').toBeHidden({
    timeout: 60_000,
  });
}

/**
 * Lưới dọn phiên cho `afterEach`/`finally` khi luồng đỏ giữa chừng.
 *
 * KHÔNG phải phép đo, và nuốt lỗi có chủ ý: khối này chạy CẢ khi test đã đỏ, và
 * một ngoại lệ ở đây sẽ thay lý do đỏ thật bằng một lý do dọn dẹp. Chỉ bấm đúng
 * nút của trang này (tức đúng phiên của luồng); không `kubectl delete pod`, vì
 * xoá pod bằng tay làm lệch warm pool. Reaper là lưới cuối.
 *
 * Trả `true` khi nó THẬT SỰ phải nhả một phiên (luồng đã đỏ khi phiên còn sống).
 */
export async function releaseSandboxQuietly(page: Page): Promise<boolean> {
  const end = page.getByRole('button', { name: t('session.controls.end'), exact: true });
  try {
    if ((await end.count()) === 0) return false;
    await end.click({ timeout: 15_000 });
    await end.waitFor({ state: 'hidden', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

export { expect, test };
