/**
 * Luồng soạn bài CI/CD — 19.J, việc để lại của lượt đầu.
 *
 * Đường ĐẦY ĐỦ, đúng thứ tự người soạn đi: nhập JSON đề → lưu bản nháp → xuất
 * bản → mở chính bài đó ở `/games/cicd?problem=<mã>` → xoay núm → nộp → `AC`.
 *
 * ## ⛔ VÌ SAO Ô NÀY NẰM Ở SUITE `@flow`, KHÔNG Ở `e2e:ci`
 *
 * `problems.create` là `authorProcedure`, và vai trò `author` đầu tiên chỉ đặt
 * được từ NGOÀI hệ thống — `e2e/scripts/promote-role.sh` dùng `kubectl`, và
 * chính nó ghi *"KHÔNG bao giờ chạy trong CI (CI không có cụm)"*. Đặt ô này vào
 * `e2e:ci` sẽ cho một `test.skip` vĩnh viễn, và một lượt skip sạch trông y hệt
 * một lượt xanh.
 *
 * `requireRole` ở dòng đầu NÉM khi `E2E_REQUIRE_ROLES=1` — đó là cách biến lượt
 * skip đó thành đỏ ở lượt nghiệm thu thật.
 *
 * ## ✅ ĐÃ BỎ `fixme` 2026-09-18 — hai lỗi nó từng chặn, và cả hai đã đóng
 *
 * Ô này `fixme` từ 2026-09-17 vì đường nó đi có hai chỗ hỏng. Ghi lại cả hai để
 * lần sau ô đỏ thì người đọc biết nó ĐANG gác gì, chứ không đi tìm lại từ đầu.
 *
 * **(1) Ô chọn vị từ chỉ biết K8s.** Lượt chạy thật dừng ở bước LƯU với đúng một
 * ô: *"Còn 1 ô chưa lưu được — Chưa chọn vị từ kiểm tra."* Không phải lỗi nhập
 * JSON (`importProblemJson` trả `check: 'rollbackUnder'` nguyên vẹn) mà là ba
 * chỗ của trang soạn bài khoá cứng vào bảng vị từ của riêng K8s. Nên giao diện
 * **không soạn được testcase cho bất kỳ game nào khác K8s** — Git dính từ 18.D,
 * CI/CD dính từ 19.J. Đóng bằng ô `predicateArgs` trong hợp đồng
 * `GameProblemPlugin` (`core/problem-plugin.ts`) cộng bộ tra theo game
 * `app/author/problems/predicate-catalog.ts`.
 *
 * **(2) Tác giả nộp bài của chính mình thì nhận `CE`.** Lộ ra ngay sau khi (1)
 * được vá, ở đúng ô cuối: verdict về `CE — phát lại ra kết quả khác`, lệch đúng
 * MỘT field (`score` 980 vs 1000). `toAuthorProblem` đặt cứng `revealed: true`
 * cho mọi gợi ý, nên client trừ `penaltyPoints` còn máy chủ thì không. Đóng ở
 * `server/problems/solver.ts`; hợp đồng hai nghĩa của cờ đó nay ghi ở
 * `core/problem.ts` § `ProblemHintTeaser`.
 *
 * ⚠ Hai lỗi trên đều **không** đỏ ở bất kỳ ô nào khác: (1) vì không ô nào soạn
 * bài cho game khác K8s, (2) vì mọi fixture claim đều dùng bài KHÔNG gợi ý. Đó
 * là lý do ô đầu-cuối này đáng giữ dù nó cần cụm và một tài khoản `author`.
 *
 * Phần đo được của riêng đường GHI vẫn ở
 * `src/server/problems/save-cicd-problem.integration.test.ts` (body → biên ghi
 * Zod → Postgres → đọc lại → chấm) và chạy trong CI mỗi lượt.
 *
 * ## Chạy
 *
 *   ./apps/web/e2e/scripts/promote-role.sh <email> author
 *   E2E_EMAIL=<email> E2E_PASSWORD=... E2E_REQUIRE_ROLES=1 \
 *     pnpm --filter @devops-platform/web e2e --grep @flow
 */

import { CICD_PROBLEMS_SEED } from '@devops-platform/games';

import { expect, requireRole, test } from './flow-kit';
import { openScreen } from '../fixtures/nav';

/** Xuất bản chạy cổng kiểm của chính nó; rộng tay hơn mặc định một chút. */
const FLOW_TIMEOUT_MS = 4 * 60_000;

/**
 * Đề dùng cho lượt này — bài CD của bộ seed.
 *
 * Lấy TỪ `CICD_PROBLEMS_SEED` chứ không gõ tay một đề mới: bộ đó đã được
 * `problems-seed.test.ts` chứng minh là GIẢI ĐƯỢC và CHƯA giải sẵn, nên khi ô
 * này đỏ thì nguyên nhân nằm ở luồng soạn/xuất bản, không nằm ở chất lượng đề.
 *
 * Chọn bài CD (không phải CI) vì nó là đề duy nhất chở khối `cd` — tức lượt này
 * kéo cả chương CD qua trọn đường soạn → lưu → xuất bản → chấm.
 */
const SEED = CICD_PROBLEMS_SEED.find((p) => p.code === 'CICD-0002');

test.describe('luồng soạn bài CI/CD', { tag: '@flow' }, () => {
  test('nhập JSON → lưu → xuất bản → làm bài → AC', async ({ page, account }) => {
    requireRole(account, 'author');
    test.setTimeout(FLOW_TIMEOUT_MS);

    if (SEED === undefined) throw new Error('bộ seed không có CICD-0002');

    /*
     * Slug mang dấu thời gian: luồng này ĐỂ LẠI một bài thật trong DB (không có
     * API xoá bài nào an toàn để gọi giữa chừng), nên hai lượt chạy liên tiếp
     * không được đụng nhau ở ràng buộc duy nhất của `slug`.
     */
    const dauThoiGian = String(Date.now());
    const slug = `e2e-cicd-${dauThoiGian}`;

    const deJson = JSON.stringify({
      // Tên định dạng là `k8s-problem` từ thời một-game và KHÔNG đổi được: file
      // cũ đã nằm trong máy người khác. Nó chở bài của MỌI game.
      format: 'k8s-problem',
      version: 1,
      code: null,
      problem: {
        gameId: SEED.gameId,
        seedable: false,
        slug,
        title: `E2E soạn bài CI/CD ${dauThoiGian}`,
        statement: SEED.statement,
        difficulty: SEED.difficulty,
        topics: [...SEED.topics],
        tags: [...SEED.tags],
        timeLimitSec: SEED.timeLimitSec,
        initialState: SEED.initialState,
        objectives: SEED.objectives.map((o) => ({ ...o })),
        allowedResources: null,
        hints: SEED.hints.map((h) => ({ ...h })),
        parMoves: SEED.parMoves,
      },
    });

    // ── 1. Nhập đề qua tab JSON ─────────────────────────────────────────────
    /*
     * Đi đường NHẬP JSON chứ không điền từng ô, và đó là lựa chọn về độ bền chứ
     * không phải đi tắt: một `initialState` của CI/CD là bộ ba workflow +
     * workload + evaluation cộng khối `cd`, tức bốn ô `json` lồng sâu. Lái từng
     * ô là buộc ô test vào nhãn của hai chục trường, và chúng sẽ trôi. Nhập JSON
     * cũng là đường người soạn thật dùng để mang đề giữa hai môi trường.
     */
    await openScreen(page, '/author/problems/new', 'author');
    await page.getByRole('tab', { name: 'JSON' }).click();
    await page.getByLabel('JSON bài tập cần nhập').fill(deJson);
    await page.getByRole('button', { name: 'Nhập vào biểu mẫu' }).click();

    // ── 2. Lưu bản nháp ─────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await page.waitForURL(/\/author\/problems\/CICD-\d{4}$/u, { timeout: 60_000 });

    const url = new URL(page.url());
    const code = url.pathname.split('/').pop() ?? '';
    /*
     * ⛔ Mã phải thuộc dãy `CICD`, không phải `K8S`. Cột `game_id` có mặc định
     * `'k8s'` và `nextProblemCode` cấp mã THEO game — một đường ghi đánh rơi
     * `gameId` cho ra một bài CI/CD mang mã `K8S-`, và nó chỉ hỏng lúc chấm.
     */
    expect(code, 'mã bài phải thuộc dãy CICD').toMatch(/^CICD-\d{4}$/u);

    // ── 3. Xuất bản ─────────────────────────────────────────────────────────
    await page.getByRole('tab', { name: 'Xuất bản' }).click();
    /*
     * Cổng xuất bản (`publishIssues`) đòi đề ≤150 từ, ≥1 mục tiêu, id duy nhất.
     * Đề lấy từ bộ seed nên nó phải qua — và nếu KHÔNG qua thì đó là tin thật:
     * bộ seed đang chở một đề không xuất bản nổi.
     */
    await expect(page.getByText('Bài đã đủ điều kiện xuất bản')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
    await expect(page.getByText('Đã xuất bản')).toBeVisible({ timeout: 60_000 });

    // ── 4. Làm chính bài vừa xuất bản ───────────────────────────────────────
    await openScreen(page, `/games/cicd?problem=${code}`, 'user');

    const intro = page.getByTestId('cicd-axis-intro');
    if (await intro.isVisible().catch(() => false)) {
      await intro.getByRole('button', { name: 'Bỏ qua' }).click();
    }

    await expect(page.getByTestId('cicd-oj-bar')).toBeVisible({ timeout: 30_000 });

    /*
     * `CICD-0002` mở đúng một núm (`release.onBadRelease`) và chính sách khởi
     * điểm là câu trả lời SAI. Xoay sang `rollback` rồi nộp ⇒ `AC`.
     *
     * Đây là chỗ lượt này khác ô trong `e2e:ci`: bài đang chấm KHÔNG tới từ bộ
     * seed nạp sẵn mà từ một dòng vừa được SOẠN qua giao diện — nên nó đo cả
     * đường ghi lẫn đường chấm trên cùng một dữ liệu.
     */
    await page.getByTestId('cicd-cd-panel').getByRole('radio', { name: /rollback/u }).check();
    await page.getByTestId('cicd-oj-submit').click();

    await expect
      .poll(async () => (await page.getByTestId('cicd-oj-result').textContent()) ?? '', {
        timeout: 60_000,
      })
      .toMatch(/^(AC|WA|CE)\b|Chưa nộp được/u);

    const ketQua = (await page.getByTestId('cicd-oj-result').textContent()) ?? '';
    expect(ketQua, `verdict của bài vừa soạn: ${ketQua}`).toContain('AC');
  });
});
