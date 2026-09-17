/**
 * P19 §19.J.4 — chế độ LÀM BÀI OJ của game CI/CD, đo bằng TRÌNH DUYỆT THẬT.
 *
 * | Ô | Đo gì |
 * |---|---|
 * | **AC-J1** | Bài CI/CD đi được từ đề tới verdict: mở, sửa, nộp, thấy `AC` |
 * | **AC-J2/J3** | Bảng núm CD đổi verdict — cùng đề, chỉ khác núm |
 * | **AC-J7** | `/games/cicd` KHÔNG có `?problem=` vẫn 0 lời gọi backend |
 *
 * ══ Vì sao ô này không thay được bằng vitest ══════════════════════════════
 *
 * `problem-oj.test.ts` gọi thẳng `gradeCicdProblem` và đã ghim cả năm ô AC ở
 * tầng bộ chấm. `cicd-replay.test.ts` ghim đường xác minh phía máy chủ. Cả hai
 * KHÔNG thừa, và cả hai vẫn xanh khi:
 *
 * - `cicd-problem.tsx` quên gửi `overrides`/`cd` vào `RunLog`,
 * - nút "Nộp bài" không nối vào `onSubmit`,
 * - `problems.byCode` trả đề mà màn hình không dựng nổi màn chơi,
 * - hoặc verdict máy chủ trả về không bao giờ tới được mắt người làm.
 *
 * Đường từ cú bấm tới dòng chữ trên màn là thứ chỉ trình duyệt đo được.
 *
 * ══ ⚠ TRẦN NHỊP LÀ 3 LƯỢT NỘP MỖI PHÚT, VÀ NÓ RẤT THẬT Ở ĐÂY ═════════════
 *
 * Một lần bấm "Nộp bài" là HAI lời gọi (`tryGrade` rồi `submit`) và cả hai tiêu
 * một suất của CÙNG bộ đếm `problems:submit:<userId>` (`submit.ts`,
 * `SUBMIT_LIMIT_PER_MIN = 6`). Cả file này dùng CHUNG một tài khoản, nên bốn
 * lượt nộp trong một phút là chắc chắn `TOO_MANY_REQUESTS`.
 *
 * Ba biện pháp, và cả ba đều cần:
 *  1. `mode: 'serial'` — hai ô chạy nối nhau, không tranh cùng bộ đếm.
 *  2. Tổng cộng đúng BA lượt nộp trong file.
 *  3. `nopBai()` nhận ra câu 429 và chờ hết cửa sổ rồi bấm lại MỘT lần.
 *
 * Thiếu (3), ô sẽ đỏ với một dòng verdict nói về nhịp nộp — và người đọc sẽ đi
 * tìm một lỗi sản phẩm không tồn tại (`memory: e2e-429-and-empty-shard`).
 *
 * ══ Đề bài tới từ đâu ═════════════════════════════════════════════════════
 *
 * `scripts/seed-content.mjs` nạp `CICD_PROBLEMS_SEED` — hai bài `published`
 * thật, và `problems-seed.test.ts` đã ghim rằng cả hai GIẢI ĐƯỢC và CHƯA giải
 * sẵn. Ô này vì thế không tự soạn đề.
 *
 * ⛔ Soạn đề qua `/author/problems` KHÔNG nằm trong file này, và đó là một giới
 * hạn của môi trường chứ không phải một chỗ bỏ sót: `problems.create` là
 * `authorProcedure`, mà vai trò đầu tiên chỉ đặt được từ NGOÀI hệ thống
 * (`e2e/scripts/promote-role.sh`, dùng `kubectl` — và chính nó ghi "KHÔNG bao
 * giờ chạy trong CI"). Một ô soạn-đề ở đây sẽ `test.skip` trong CI, và một lượt
 * skip sạch trông y hệt một lượt xanh. Đường soạn đề thuộc suite `@flow`.
 *
 * ══ Chạy ══════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ORIGIN=http://localhost:3000 \
 *   pnpm --filter @devops-platform/web e2e --grep @games-cicd-problem
 */

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { attachJson, traceRequests } from './games-harness';

const CICD_PATH = '/games/cicd';

/** Hai mã bài của `CICD_PROBLEMS_SEED`. Bài CI trước, bài CD sau. */
const BAI_CI = 'CICD-0001';
const BAI_CD = 'CICD-0002';

/** Cửa sổ trần nhịp (`RATE_LIMIT_WINDOW_MS`), cộng một chút cho lệch đồng hồ. */
const CUA_SO_NHIP_MS = 65_000;

function thanhNopBai(page: Page) {
  return page.getByTestId('cicd-oj-bar');
}

function dongKetQua(page: Page) {
  return page.getByTestId('cicd-oj-result');
}

function oSoan(page: Page) {
  return page.getByLabel(/^Workflow YAML của màn/u);
}

/**
 * Hộp thoại chuyển tiếp trục Y che KÍN sân ở lần đầu vào một màn chương CD.
 *
 * Không `waitFor`: ở màn đã xem qua thì nó KHÔNG hiện, và chờ một thứ cố ý vắng
 * mặt là tự thêm 15 giây vào mỗi ô.
 */
async function boQuaManChuyenTiep(page: Page): Promise<void> {
  const intro = page.getByTestId('cicd-axis-intro');
  if (!(await intro.isVisible().catch(() => false))) return;
  await intro.getByRole('button', { name: 'Bỏ qua' }).click();
  await expect(intro).toHaveCount(0);
}

/**
 * Bấm "Nộp bài" và chờ máy chủ trả lời.
 *
 * Nhận ra câu `TOO_MANY_REQUESTS` và chờ hết cửa sổ rồi bấm lại ĐÚNG MỘT lần —
 * xem khối trần-nhịp ở đầu file. Một vòng lặp vô hạn ở đây sẽ biến một trần nhịp
 * thật thành một ô treo tới hết ngân sách.
 */
/**
 * Dòng kết quả đã là một câu TRẢ LỜI, chưa phải trạng thái trung gian.
 *
 * ⛔ KHÔNG chờ "chữ đổi khác lúc trước". `cicd-problem.tsx` gọi `setView(null)`
 * + `setErrorMessage(null)` NGAY khi bấm nộp, nên dòng này quay về câu giữ chỗ
 * "Chưa nộp lần nào…" trong lúc hai lời gọi còn đang bay. Một phép chờ theo
 * "đã đổi" sẽ bắt đúng khoảnh khắc đó rồi trả về câu giữ chỗ — đo được
 * 2026-09-17, và triệu chứng là một ô đỏ nói `expected "AC", received "Chưa nộp
 * lần nào…"`, tức trông y hệt một verdict sai.
 */
const CAU_TRA_LOI = /^(AC|WA|CE)\b|Chưa nộp được/u;

async function nopBai(page: Page): Promise<string> {
  async function bam(): Promise<string> {
    await thanhNopBai(page).getByTestId('cicd-oj-submit').click();
    await expect
      .poll(async () => (await dongKetQua(page).textContent()) ?? '', { timeout: 60_000 })
      .toMatch(CAU_TRA_LOI);
    return (await dongKetQua(page).textContent()) ?? '';
  }

  const lan1 = await bam();
  if (!/quá nhanh|TOO_MANY_REQUESTS/u.test(lan1)) return lan1;

  await page.waitForTimeout(CUA_SO_NHIP_MS);
  return bam();
}

test.describe.configure({ mode: 'serial' });

test.describe('Chế độ làm bài CI/CD — §19.J', { tag: '@games-cicd-problem' }, () => {
  test('AC-J1 — mở đề, nộp sai, sửa, nộp lại và nhận AC', async ({ page }) => {
    await openScreen(page, `${CICD_PATH}?problem=${BAI_CI}`, 'user');
    await settle(page);
    await boQuaManChuyenTiep(page);

    /*
     * Màn làm bài phải dựng được. Trước 19.J nhánh `?problem=` trả một màn
     * "Chế độ làm bài chưa mở" — ô này là thứ đỏ nếu ai đó lùi về đó.
     */
    await expect(thanhNopBai(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nộp bài' })).toBeEnabled();

    /*
     * ⚠ LƯỢT NỘP THỨ NHẤT là ĐỐI CHỨNG, không phải một bước thừa.
     *
     * Trạng thái đầu của `CICD-0001` CHƯA giải (ba job nối tiếp), nên nó phải ra
     * `WA`. Không có lượt này, ô dưới vẫn xanh trên một hệ thống trả `AC` cho
     * MỌI lượt nộp — đúng hình dạng "một màu xanh chẳng chứng minh gì".
     */
    expect(await nopBai(page), 'trạng thái đầu phải chưa đạt').toContain('WA');

    /*
     * Lời giải: `dong-goi` thôi đợi `kiem-tra`, chỉ còn đợi `clone`. Tập job và
     * dãy bước GIỮ NGUYÊN — khuôn job (`job-shapes.ts`) từ chối chấm nếu đổi,
     * và `problems-seed.test.ts` đã chạy đúng lời giải này qua bộ chấm.
     *
     * Sửa bằng cách thay đúng một dòng `needs` trong văn bản đang có, chứ không
     * dán một bản YAML viết tay: bản viết tay sẽ trôi khỏi bộ ghi YAML ngay lần
     * đầu ai đó đổi định dạng xuất, và ô sẽ đỏ vì lý do không liên quan.
     */
    const hienTai = (await oSoan(page).inputValue()).split('\n');
    /*
     * ⚠ `needs` in ra thành một DANH SÁCH, nên tên job nằm ở dòng RIÊNG
     * (`      - kiem-tra`), KHÔNG cùng dòng với `needs:`. Bản đầu của ô này tìm
     * một dòng chứa cả hai chữ và không bao giờ khớp — đo được 2026-09-17.
     *
     * Chỉ `dong-goi` phụ thuộc `kiem-tra`, nên đúng MỘT dòng khớp. Khẳng định
     * con số đó thay vì lấy dòng đầu: ngày đề đổi và có hai dòng khớp, sửa lặng
     * dòng đầu là sửa nhầm job, và ô sẽ đỏ với một verdict khó lần.
     */
    const khop = hienTai
      .map((dong, i) => ({ dong, i }))
      .filter(({ dong }) => /^\s*-\s*kiem-tra\s*$/u.test(dong));
    expect(khop.length, 'phải có đúng một dòng `- kiem-tra` trong khối needs').toBe(1);
    const viTri = khop[0]?.i ?? -1;
    hienTai[viTri] = (hienTai[viTri] ?? '').replace('kiem-tra', 'clone');
    await oSoan(page).fill(hienTai.join('\n'));

    const ketQua = await nopBai(page);
    expect(ketQua, `verdict sau khi sửa: ${ketQua}`).toContain('AC');
  });

  test('AC-J2/J3 — bảng núm CD đi tới được bộ chấm', async ({ page }) => {
    await openScreen(page, `${CICD_PATH}?problem=${BAI_CD}`, 'user');
    await settle(page);
    await boQuaManChuyenTiep(page);

    await expect(thanhNopBai(page)).toBeVisible();

    /*
     * `CICD-0002` mở đúng một núm (`release.onBadRelease`), và chính sách khởi
     * điểm là câu trả lời SAI. Xoay núm sang `rollback` rồi nộp ⇒ `AC`.
     *
     * Đây là ô DUY NHẤT trong `e2e:ci` chạy khối `cd` của một đề qua trọn đường
     * trình duyệt → `RunLog` → bộ chấm máy chủ. Nếu `cicd-problem.tsx` quên gửi
     * `cd` trong action, máy chủ chấm bằng `cd.initial` và verdict ở đây là
     * `WA` — tức ô đỏ đúng chỗ khe 19.J.1 vừa đóng.
     *
     * ⚠ MỘT lượt nộp ở ô này, cố ý: ô trên đã tiêu bốn suất của trần nhịp.
     */
    const bang = page.getByTestId('cicd-cd-panel');
    await expect(bang).toBeVisible();
    await bang.getByRole('radio', { name: /rollback/u }).check();

    const ketQua = await nopBai(page);
    expect(ketQua, `verdict sau khi xoay núm: ${ketQua}`).toContain('AC');
  });

  test('AC-J7 — `/games/cicd` không có `?problem=` vẫn 0 lời gọi backend', async ({ page }, testInfo) => {
    /*
     * Ô CHỐNG HỒI QUY cho chính 19.J. `cicd-problem.tsx` tự cấp
     * `TrpcQueryProvider`, nên một `import` TĨNH của nó trong `cicd-game.tsx` sẽ
     * kéo tầng mạng vào bundle của MỌI người chơi level. `next/dynamic` là thứ
     * giữ điều đó khỏi xảy ra, và ô này là phép đo của nó.
     *
     * ⚠ Ô không tiêu suất trần nhịp nào — nó cố ý không nộp gì.
     *
     * ⛔ Mốc `phase` là bắt buộc: TẢI TRANG được phép gọi backend (payload RSC
     * đi qua chính origin), nên một phép đếm trên cả lượt sẽ đỏ vì một thứ hợp
     * lệ. Ô AC-2 của `games-cicd.spec.ts` đi đúng đường này.
     */
    const trace = traceRequests(page);
    await openScreen(page, CICD_PATH, 'user');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Xưởng đường ống CI/CD' })).toBeVisible();

    trace.phase('đang xem danh mục');
    await page.getByTestId('cicd-level-list').getByRole('listitem').first().hover();
    await page.waitForTimeout(500);

    const during = trace.all().filter((r) => r.phase === 'đang xem danh mục');
    const api = during.filter((r) => r.sameOrigin && r.pathname.startsWith('/api/'));
    trace.stop();

    await attachJson(testInfo, 'cicd-oj-ac-j7.json', { total: trace.all().length, during: during.length, api });

    /*
     * Đối chứng: máy thu phải ghi được ÍT NHẤT một request ở cả lượt. Không có
     * dòng này, một máy thu chết làm phép lọc dưới trả mảng rỗng và ô xanh khống.
     */
    expect(trace.all().length, 'máy thu không ghi được request nào — phép lọc dưới sẽ xanh khống').toBeGreaterThan(0);
    expect(
      api.map((r) => `${r.method} ${r.pathname}`),
      'AC-J7: trang danh mục không được mở kết nối backend nào — `cicd-problem.tsx` phải nạp động.',
    ).toEqual([]);
  });
});
