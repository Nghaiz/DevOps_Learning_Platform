/**
 * globalSetup — MỘT tài khoản dùng-một-lần cho CẢ lượt chạy (D11).
 *
 * ⛔ KHÔNG đăng ký một tài khoản cho mỗi virtual user / mỗi spec. Better Auth
 * rate-limit đăng ký theo IP ở mức ~2-3 lượt/phút, và cái 429 sinh ra đọc
 * CHÍNH XÁC như "hệ thống bị bóp vì tải" — một harness tự gây ra triệu chứng
 * mà nó sinh ra để đo là cách nhanh nhất để đọc sai một phép đo. Khuôn 2.D
 * (`reports/harness/2026-08-13-2d-lessons-e2e/e2e-lessons.mjs`) đăng ký đúng
 * một lần; ta giữ nguyên quy ước đó.
 *
 * ── Vì sao file này TOÀN assertion chứ không phải "cố hết sức" ───────────────
 * Nếu setup thất bại trong im lặng, `storageState` là một jar cookie RỖNG.
 * Suite vẫn chạy: mọi route được gác sẽ 307 về `/login`, axe quét trang đăng
 * nhập, và mọi ô a11y XANH — trong khi không route nào trong danh sách thực sự
 * được quét. Đó là một cái xanh chứng minh KHÔNG GÌ CẢ
 * (`green-that-proves-nothing`). Nên mỗi tiền đề ở đây phải NÉM, không phải
 * cảnh báo: server sống, đăng nhập được, cookie phiên có thật, và phiên đó
 * THẬT SỰ mở được `/api/auth/get-session`.
 */

import { request, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  ACCOUNT_FILE,
  ARTIFACTS_DIR,
  E2E_BASE_URL,
  E2E_EMAIL,
  E2E_ORIGIN,
  E2E_PASSWORD,
  STORAGE_STATE,
  THROWAWAY_PASSWORD,
  isSessionCookie,
} from './env';
import { cleanSandboxNamespace } from './sandbox-namespace';

export type E2EAccount = {
  email: string;
  /** `user` | `author` | `admin` — ĐỌC TỪ SERVER, không phải điều ta mong. */
  role: string;
  /** true = tài khoản vừa tạo trong lượt này; false = đăng nhập lại account có sẵn. */
  fresh: boolean;
};

export default async function globalSetup(_config: FullConfig): Promise<void> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // Lượt dọn TỰ LÀNH, chạy trước mọi thứ khác. globalTeardown lo ca kết thúc
  // bình thường; ca thật sự nguy hiểm là lượt trước bị GIẾT giữa chừng, vì khi
  // đó teardown của nó không bao giờ chạy và pod rơi lại chiếm trọn
  // ResourceQuota (`pods: 1`) của namespace. Lượt chạy này sẽ chết bằng
  // ResourceExhausted — một triệu chứng trỏ đi truy capacity thay vì truy rác.
  await cleanSandboxNamespace('setup');

  const api = await request.newContext({
    baseURL: E2E_BASE_URL,
    ignoreHTTPSErrors: true,
    // ⚠ `Origin` là BẮT BUỘC trên mọi request không đến từ trình duyệt.
    // Better Auth trả 403 `MISSING_OR_NULL_ORIGIN` khi thiếu, và undici của
    // Node KHÔNG tự đặt nó (trong khi `curl` cùng request thì đi qua — hai công
    // cụ, hai kết quả, đúng chỗ dễ kết luận "server hỏng").
    extraHTTPHeaders: { origin: E2E_ORIGIN },
  });

  // ── Tiền đề 0: server có thật và đang phục vụ ─────────────────────────────
  // Tách khỏi bước đăng nhập để một cụm đang chết KHÔNG bị báo cáo thành "auth
  // hỏng". Hai nguyên nhân, hai thông báo.
  let reach: Awaited<ReturnType<typeof api.get>>;
  try {
    reach = await api.get('/login', { maxRedirects: 0 });
  } catch (cause) {
    throw new Error(
      `Không kết nối được E2E_BASE_URL=${E2E_BASE_URL}. Không phải lỗi auth: ` +
        `chưa có TCP/TLS nào thành công. Kiểm cụm (kubectl get pods) hoặc đặt ` +
        `E2E_BASE_URL=http://127.0.0.1:3000 và chạy \`next start\` cục bộ.`,
      { cause },
    );
  }
  if (reach.status() >= 500) {
    throw new Error(
      `${E2E_BASE_URL}/login trả HTTP ${reach.status()}. Server sống nhưng đang lỗi — ` +
        `dừng ở đây thay vì để mọi spec đỏ với lý do khác nhau.`,
    );
  }

  // ── Tiền đề 1: có phiên đăng nhập ─────────────────────────────────────────
  const reuse = E2E_EMAIL !== '' && E2E_PASSWORD !== '';
  const email = reuse
    ? E2E_EMAIL
    : `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@dlp.local`;
  const password = reuse ? E2E_PASSWORD : THROWAWAY_PASSWORD;
  const endpoint = reuse ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email';

  const auth = await api.post(endpoint, {
    data: reuse ? { email, password } : { email, password, name: 'E2E harness' },
  });

  if (auth.status() === 429) {
    throw new Error(
      `${endpoint} trả 429. ĐÂY LÀ RATE LIMIT ĐĂNG KÝ CỦA BETTER AUTH (~2-3/phút ` +
        `theo IP), KHÔNG phải hệ thống quá tải. Chờ một phút, hoặc đặt E2E_EMAIL/` +
        `E2E_PASSWORD để đăng nhập lại một tài khoản đã có.`,
    );
  }
  if (auth.status() === 403) {
    throw new Error(
      `${endpoint} trả 403. Gần như chắc chắn là MISSING_OR_NULL_ORIGIN: ` +
        `E2E_ORIGIN hiện là ${E2E_ORIGIN} và nó PHẢI bằng web.env.betterAuthUrl ` +
        `của release đang chạy. Thân: ${(await auth.text()).slice(0, 200)}`,
    );
  }
  if (auth.status() >= 400) {
    throw new Error(`${endpoint} trả HTTP ${auth.status()}: ${(await auth.text()).slice(0, 300)}`);
  }

  // ── Tiền đề 2: cookie phiên CÓ TRONG jar ──────────────────────────────────
  // Không lọc theo tiền tố `dlp_`. Cookie phiên tên là
  // `better-auth.session_token`, và trên https nó mang thêm tiền tố
  // `__Secure-` (đo trên cụm). Xem `isSessionCookie` trong env.ts.
  const state = await api.storageState();
  const sessionCookie = state.cookies.find((c) => isSessionCookie(c.name));
  if (sessionCookie === undefined) {
    throw new Error(
      `Không có cookie phiên sau ${endpoint} (HTTP ${auth.status()}). ` +
        `Cookie nhận được: ${state.cookies.map((c) => c.name).join(', ') || '(rỗng)'}. ` +
        `Nếu danh sách trên KHÔNG rỗng mà vẫn thiếu, tên cookie đã đổi — sửa ` +
        `isSessionCookie() trong e2e/env.ts, đừng nới lỏng spec.`,
    );
  }

  // ── Tiền đề 3: phiên đó DÙNG ĐƯỢC ─────────────────────────────────────────
  // Có cookie ≠ đăng nhập được. Đây là bước biến "harness nghĩ nó đã đăng nhập"
  // thành một sự kiện quan sát được từ phía server.
  const session = await api.get('/api/auth/get-session');
  const body: unknown = session.status() < 400 ? await session.json() : null;
  const user =
    body !== null && typeof body === 'object' && 'user' in body
      ? (body as { user: { role?: string } | null }).user
      : null;
  if (user === null) {
    throw new Error(
      `/api/auth/get-session không trả user dù cookie ${sessionCookie.name} đã có ` +
        `(HTTP ${session.status()}). Phiên không dùng được — dừng trước khi mọi ` +
        `spec đỏ vì lý do sai.`,
    );
  }

  const account: E2EAccount = {
    email,
    role: typeof user.role === 'string' ? user.role : 'user',
    fresh: !reuse,
  };

  await api.storageState({ path: STORAGE_STATE });
  writeFileSync(ACCOUNT_FILE, `${JSON.stringify(account, null, 2)}\n`, 'utf8');
  await api.dispose();

  // Banner ra stderr qua console.warn: no-console chỉ cho warn/error, và một
  // dòng chẩn đoán của harness KHÔNG nên trộn vào stdout mà reporter đang ghi.
  console.warn(
    `[e2e] base=${E2E_BASE_URL} origin=${E2E_ORIGIN} account=${email} ` +
      `role=${account.role} (${account.fresh ? 'mới đăng ký' : 'đăng nhập lại'})`,
  );
}
