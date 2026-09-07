/**
 * Đồ dùng chung của SÁU luồng `@flow` (13.H mục 27 · `phase-13.md:74`).
 *
 * ⛔ Không phải một khuôn thứ hai. `fixtures/api.ts` (tài khoản + tRPC),
 * `fixtures/nav.ts` (mở màn hình và khẳng định tiền đề), `routes.ts` (D12) và
 * `global-setup.ts` (đăng nhập một lần) đã có; file này CHỈ thêm những thứ mà
 * riêng luồng cần và bốn file kia không có chỗ để đặt: mật khẩu của tài khoản
 * lượt chạy, cổng vai trò dạng ĐỎ, và hai thao tác phiên sandbox lặp ở nhiều
 * luồng.
 *
 * Tên file không khớp `testMatch` mặc định (`**\/*.spec.ts`) nên Playwright
 * không nhặt nó làm file test.
 */

import type { Page } from '@playwright/test';
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
 * `name: 'Đăng nhập'` + `exact` là bắt buộc: cùng form còn một nút link
 * "Đã có tài khoản? Đăng nhập" — chỉ nút submit khớp CHÍNH XÁC chuỗi đó.
 */
export async function signInThroughForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const submit = page.getByRole('button', { name: 'Đăng nhập', exact: true });
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
  // Dấu hiệu hydrate: React 18+ gắn khoá `__reactFiber$…` lên node DOM mà nó đã
  // nhận. Đây là chi tiết cài đặt, và dùng nó ở đây là có chủ ý: lựa chọn còn
  // lại là `waitForTimeout` — một con số chọn cho máy nhanh, tức đúng loại
  // "timeout chọn cho cụm rảnh" mà P12 đã trả giá. Nếu React đổi cách gắn, phép
  // chờ này hết hạn và ĐỎ, chứ không âm thầm quay lại bấm sớm.
  await page.waitForFunction(
    () => {
      const form = document.querySelector('form');
      return form !== null && Object.keys(form).some((k) => k.startsWith('__reactFiber$'));
    },
    { timeout: 30_000 },
  );

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);

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

/**
 * Bấm "Bắt đầu" và chờ phiên THẬT SỰ có `sessionId`.
 *
 * Dấu hiệu quan sát được là nút "Kết thúc phiên" xuất hiện — `SessionControls`
 * chỉ vẽ nó khi `state.sessionId !== null` (C5). Chờ badge pha thì mong manh
 * hơn: nhãn pha đổi vài lần trong một lượt dựng.
 */
export async function startSandbox(page: Page, startLabel = 'Bắt đầu'): Promise<void> {
  await page.getByRole('button', { name: startLabel, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kết thúc phiên' })).toBeVisible({
    timeout: SESSION_READY_TIMEOUT_MS,
  });
}

/**
 * Kết thúc phiên và khẳng định nó ĐÃ biến mất.
 *
 * Không phải phép dọn dẹp lịch sự: một phiên còn sống giữ một khe trong trần
 * ~20 pod của cụm lab (P12), nên một luồng quên nhả sẽ làm luồng CHẠY SAU nó
 * đỏ vì hết chỗ — và lỗi hiện ra ở nhầm luồng.
 */
export async function endSandbox(page: Page): Promise<void> {
  const end = page.getByRole('button', { name: 'Kết thúc phiên' });
  await end.click();
  await expect(end).toBeHidden({ timeout: 60_000 });
}

export { expect, test };
