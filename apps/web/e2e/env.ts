/**
 * Hợp đồng env của harness e2e (13.H / D11) — MỘT nguồn cho cả
 * `playwright.config.ts`, `global-setup.ts` và mọi spec.
 *
 * ── Vì sao tên biến là `E2E_*` và điều đó LỆCH với phần còn lại của repo ─────
 * Ba harness đã có trong repo, ba bộ tên khác nhau:
 *   - `reports/harness/2026-08-13-2d-lessons-e2e/e2e-lessons.mjs` → `BASE_URL` + `ORIGIN`
 *   - `infra/k6/*`                                               → `TARGET`
 *   - `scripts/*`                                                → `BASE`
 * D11 chốt `E2E_BASE_URL` + `E2E_ORIGIN` cho harness Playwright. Đây là một
 * LỆCH CÓ CHỦ Ý, không phải sơ suất: `BASE_URL` trần va với biến cùng tên mà
 * `next build` và vài script khác đọc, và một biến chung cho hai người tiêu thụ
 * khác nhau là đúng cách để một lượt chạy trỏ nhầm đích mà không ai thấy.
 * Ghi lại ở đây để người sau đọc được rằng nó lệch VÌ SAO, thay vì "sửa" cho
 * đồng bộ rồi phá một trong hai.
 *
 * ── `E2E_ORIGIN` KHÔNG phải `E2E_BASE_URL` ──────────────────────────────────
 * `E2E_BASE_URL` là nơi ta ĐIỀU HƯỚNG tới. `E2E_ORIGIN` là giá trị header
 * `Origin` mà Better Auth đối chiếu, và nó phải bằng `web.env.betterAuthUrl`
 * của release. Trên cụm lab hai giá trị TÌNH CỜ bằng nhau
 * (`infra/host/08-tls-entrypoint.sh` L108-109 đặt cả `corsAllowedOrigins` lẫn
 * `betterAuthUrl` = `https://$DLP_HOST:$HTTPS_NODEPORT`), nên mặc định của
 * `E2E_ORIGIN` là `E2E_BASE_URL`. Chúng TÁCH RA ngay khi ai đó chạy qua
 * `kubectl port-forward`: lúc đó base là `http://127.0.0.1:3000` còn origin
 * vẫn phải là URL công khai — đúng cảnh mà khuôn 2.D đã gặp và ghi lại.
 * Gộp hai biến làm một là mời lại lỗi 403 `MISSING_OR_NULL_ORIGIN` ở lần
 * port-forward kế tiếp.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Cụm lab (P5–P12). Cổng 30443 là NodePort HTTPS của Traefik. */
const DEFAULT_BASE_URL = 'https://dlp.192.168.94.130.sslip.io:30443';

function readUrl(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  const value = raw === undefined || raw === '' ? fallback : raw;
  try {
    // eslint-disable-next-line no-new -- chỉ để ném sớm trên chuỗi rác
    new URL(value);
  } catch {
    throw new Error(
      `${name} không phải URL hợp lệ: ${JSON.stringify(value)}. ` +
        `Ví dụ đúng: ${DEFAULT_BASE_URL}`,
    );
  }
  // Bỏ dấu `/` cuối: `new URL('/x', 'https://h/')` và `'https://h' + '/x'` cho
  // hai kết quả khác nhau ở đúng những chỗ ta nối chuỗi bằng tay.
  return value.replace(/\/+$/, '');
}

export const E2E_BASE_URL = readUrl('E2E_BASE_URL', DEFAULT_BASE_URL);
export const E2E_ORIGIN = readUrl('E2E_ORIGIN', E2E_BASE_URL);

/**
 * `.artifacts/` — trace, screenshot, storageState, kết quả JSON. Nằm TRONG
 * `apps/web/e2e/` (đường sở hữu của 13.H) và bị `apps/web/e2e/.gitignore` chặn,
 * nên không cần đụng `.gitignore` gốc của repo.
 */
export const ARTIFACTS_DIR = path.join(HERE, '.artifacts');
export const STORAGE_STATE = path.join(ARTIFACTS_DIR, 'storage-state.json');
export const ACCOUNT_FILE = path.join(ARTIFACTS_DIR, 'account.json');

/**
 * Tài khoản CÓ SẴN. Đặt cả hai biến ⇒ `global-setup` ĐĂNG NHẬP thay vì đăng ký.
 *
 * Hai lý do, cả hai đều đã đo:
 *   1. Better Auth rate-limit đăng ký theo IP (~2-3 lượt/phút). Chạy suite vài
 *      lần liên tiếp mà lượt nào cũng đăng ký mới thì lượt thứ ba nhận 429 —
 *      và 429 đọc ra y hệt "hệ thống đang quá tải", không như "harness tự đá
 *      vào chân mình".
 *   2. Vai trò `author`/`admin` KHÔNG có API để đặt. Chúng chỉ đến từ SQL
 *      (`e2e/scripts/promote-role.sh`). Một tài khoản đã promote phải sống lâu
 *      hơn một lượt chạy, nên nó phải đăng nhập lại được.
 */
export const E2E_EMAIL = process.env.E2E_EMAIL?.trim() ?? '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD?.trim() ?? '';

/** Mật khẩu của tài khoản dùng-một-lần. Không phải secret: nó chết cùng lượt chạy. */
export const THROWAWAY_PASSWORD = 'e2e-Password-123';

/**
 * Tên cookie phiên Better Auth — BA dạng, không phải một.
 *
 * ⚠ ĐO 2026-09-06 trên chính cụm lab: `curl -i` vào
 * `/api/auth/sign-up/email` trả về `__Secure-better-auth.session_token`, KHÔNG
 * phải `better-auth.session_token`. Tiền tố `__Secure-` do Better Auth tự thêm
 * khi baseURL là https (cụm), và KHÔNG có khi chạy `http://localhost:3000`
 * (CI + dev). Tức là cùng một harness gặp hai tên cookie khác nhau tuỳ đích.
 *
 * Vì sao điều này đáng một hàm riêng: khuôn 2.D đã dính đúng lớp lỗi này một
 * lần — bản đầu chỉ giữ cookie `dlp_*`, vứt mất cookie phiên, và MỌI procedure
 * trả UNAUTHORIZED. Triệu chứng trông y hệt một lỗ authz của sản phẩm. Một
 * phép so bằng `=== 'better-auth.session_token'` ở đây sẽ tái tạo chính xác
 * triệu chứng đó, nhưng CHỈ trên cụm và CHỈ trên https.
 */
export function isSessionCookie(name: string): boolean {
  return /^(?:__Secure-|__Host-)?better-auth\.session_token$/.test(name);
}
