/**
 * P19 §19.E + §19.H — màn CI/CD, đo bằng TRÌNH DUYỆT THẬT.
 *
 * | Ô | Đo gì |
 * |---|---|
 * | **AC-2 / AC-H** | 0 lời gọi backend trong suốt một lượt chơi |
 * | **AC-E4** | Ba trục điểm hiện CÙNG LÚC và KHÁC 0 sau khi chạy thử |
 * | **AC-E2** | YAML sai cú pháp ⇒ chẩn đoán có dòng và cột, đọc được bằng chữ |
 * | **AC-6** | axe 0 vi phạm, trên cả màn danh sách lẫn màn chơi |
 *
 * ══ Vì sao file này tồn tại dù đã có 39 ô vitest ═══════════════════════════
 *
 * `cicd-run.test.ts` gọi thẳng `runWorkflow` và đã khẳng định ba trục khác 0.
 * Ô đó KHÔNG thừa, nhưng nó cũng không thay được ô ở đây: nó chạy trong Node,
 * không dựng DOM, nên nó xanh kể cả khi
 *
 * - `CicdLevelScreen` quên nối nút "Chạy thử" vào `runWorkflow`,
 * - bảng kết quả render `outcome` CŨ của lượt trước,
 * - hoặc ba thẻ trục bị ẩn sau một tab.
 *
 * Đường đi từ cú bấm tới con số trên màn là thứ chỉ trình duyệt đo được — cùng
 * lý lẽ `games-git-sandbox.spec.ts` đã ghi cho AC-Q.
 *
 * ⚠ Ô "ba trục khác 0" là ô **chống-xanh-khống** của cả tầng ghép
 * (`cicd/hydrate.ts`). Bỏ tầng đó đi thì trang vẫn chạy, vẫn hiện ba con số, và
 * mọi mục tiêu về đồ thị vẫn đạt — chỉ là ba con số `0`. Xem
 * `rules/green-that-proves-nothing.md`.
 *
 * ══ Chạy ══════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ORIGIN=http://localhost:3000 \
 *   pnpm --filter @devops-platform/web e2e --grep @games-cicd
 *
 * ⚠ Thiếu `E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary
 * khác binary vừa sửa.
 */

import type { Page } from '@playwright/test';
import { CI_LEVELS, writeWorkflowYaml } from '@devops-platform/games';

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { attachJson, scanAxe, traceRequests } from './games-harness';

const CICD_PATH = '/games/cicd';

/**
 * Màn đầu của chương CI, đọc TỪ dữ liệu chứ không chép tay id.
 *
 * ⚠ `initialWorkflow` của màn này KHÔNG CÓ STAGE NÀO — hợp đồng ghi rõ "Không
 * stage nào = dựng từ số không". Nên bấm "Chạy thử" ngay khi mở màn là chạy một
 * đường ống RỖNG, và ba trục ra 0 một cách hoàn toàn đúng. Bản đầu của ô AC-E4
 * dưới đây làm đúng thế rồi đọc số 0 đó thành "tầng ghép hỏng" — một ô test đỏ
 * vì chính nó, không vì sản phẩm. Muốn đo tầng ghép thì phải GÕ một workflow
 * thật vào ô soạn trước.
 */
const LEVEL_MOT = ((): (typeof CI_LEVELS)[number] => {
  const dau = CI_LEVELS[0];
  if (dau === undefined) {
    throw new Error('CI_LEVELS rỗng — chương CI chưa có màn nào để đo.');
  }
  return dau;
})();

/** Lời giải mẫu của màn, ở đúng dạng chữ mà người chơi sẽ gõ. */
const YAML_LOI_GIAI = writeWorkflowYaml(LEVEL_MOT.solutionWorkflow).yaml;

/**
 * Rút con số dẫn đầu của một thẻ trục.
 *
 * Giá trị hiển thị mang đơn vị (`2 phút`, `20,8 commit/giờ`, `6 runner-phút`) và
 * dấu thập phân tiếng Việt là dấu PHẨY. Đọc bằng `parseFloat` thẳng sẽ cắt ở
 * dấu phẩy và biến `20,8` thành `20` — vẫn > 0, nên ô test vẫn xanh và không ai
 * biết phép đọc đã sai. Đổi phẩy thành chấm TRƯỚC khi đọc.
 */
function soDauTien(text: string): number {
  const match = /(\d+(?:[.,]\d+)?)/u.exec(text);
  if (match?.[1] === undefined) {
    return Number.NaN;
  }
  return Number.parseFloat(match[1].replace(',', '.'));
}

async function moManChoi(page: Page): Promise<void> {
  await openScreen(page, `${CICD_PATH}?level=${LEVEL_MOT.id}`, 'user');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Chạy thử' })).toBeVisible();
}

/** Ô soạn YAML của màn chơi. Nhãn mang tên màn nên khớp theo tiền tố. */
function oSoan(page: Page) {
  return page.getByLabel(/^Workflow YAML của màn/u);
}

/** Vùng kết quả — mọi phép hỏi phải THU PHẠM VI vào đây, không hỏi cả trang. */
function vungKetQua(page: Page) {
  return page.getByRole('region', { name: 'Kết quả lượt chạy' });
}

test.describe('Game CI/CD — §19.E/§19.H', { tag: '@games-cicd' }, () => {
  test('màn danh sách mở được và liệt kê đủ 14 màn của chương CI', async ({ page }) => {
    await openScreen(page, CICD_PATH, 'user');
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Xưởng đường ống CI/CD' })).toBeVisible();

    /*
     * Đối chứng dương cho chính ô này: một màn danh sách render 0 thẻ vẫn làm
     * mọi phép kiểm "không có lỗi" xanh. Con số 14 là hợp đồng của 19.F, và
     * `CI_LEVELS.length` là nguồn của nó — chép tay số 14 vào đây sẽ lỗi thời
     * im lặng đúng ngày chương CD thêm màn.
     */
    const the = page.getByTestId('cicd-level-list').getByRole('listitem');
    await expect(the).toHaveCount(CI_LEVELS.length);
    expect(CI_LEVELS.length, 'chương CI phải có đủ 14 màn').toBe(14);
  });

  test('AC-E4 — chạy thử xong, ba trục hiện CÙNG LÚC và đều KHÁC 0', async ({ page }, testInfo) => {
    await moManChoi(page);

    // Trước khi bấm: chưa có lượt nào, nên chưa có thẻ trục nào.
    await expect(page.getByTestId('cicd-axis-lead')).toHaveCount(0);

    /*
     * GÕ lời giải vào ô soạn trước khi chạy. Màn này khởi đầu KHÔNG có stage
     * nào, nên chạy ngay sẽ đo một đường ống rỗng — xem chú thích ở `LEVEL_MOT`.
     */
    await oSoan(page).fill(YAML_LOI_GIAI);
    await page.getByRole('button', { name: 'Chạy thử' }).click();

    const lead = page.getByTestId('cicd-axis-lead');
    const throughput = page.getByTestId('cicd-axis-throughput');
    const runner = page.getByTestId('cicd-axis-runner');

    // "Cùng lúc" là một phần của AC-E4, không phải văn vẻ: ba trục phải đọc
    // được trong MỘT lần nhìn, không phải lần lượt sau ba cú bấm tab.
    await expect(lead).toBeVisible();
    await expect(throughput).toBeVisible();
    await expect(runner).toBeVisible();

    const doc = {
      lead: (await lead.textContent()) ?? '',
      throughput: (await throughput.textContent()) ?? '',
      runner: (await runner.textContent()) ?? '',
    };
    await attachJson(testInfo, 'cicd-axes.json', doc);

    /*
     * ⛔ ĐÂY LÀ Ô CỦA TẦNG GHÉP.
     *
     * `readWorkflowYaml` cố ý áp mặc định trung tính cho chín trường mà YAML
     * không chở được, nên đường "đọc YAML ⇒ engine" KHÔNG qua `hydrateWorkflow`
     * cho `leadTimeSeconds: 0` và `runnerMinutes: 0` trên mọi màn. Đo được
     * 2026-09-16 trên chính `solutionWorkflow` của c01: 120s/6 thành 0/0.
     *
     * Thông lượng KHÔNG được kiểm ở đây: nó vẫn khác 0 ngay cả khi thời lượng
     * bằng 0 (hàng vẫn chảy, chỉ là chảy tức thì), nên nó không phân biệt được
     * hai trạng thái. Hai trục kia thì có.
     */
    expect(
      soDauTien(doc.lead),
      'AC-E4: lead time bằng 0 nghĩa là tầng ghép đã bị đánh rơi — xem cicd/hydrate.ts',
    ).toBeGreaterThan(0);
    expect(
      soDauTien(doc.runner),
      'AC-E4: runner-phút bằng 0 nghĩa là thời lượng bước không tới được engine',
    ).toBeGreaterThan(0);

    /*
     * Và lời giải mẫu phải THẮNG. Không có dòng này thì ô trên chỉ chứng minh
     * "có số khác 0", chứ không chứng minh đường đi từ ô soạn tới bộ chấm còn
     * đúng — một workflow sai cũng cho ba số khác 0.
     */
    await expect(vungKetQua(page).getByText('Đạt', { exact: true })).toBeVisible();
  });

  test('AC-E2 — YAML hỏng cho chẩn đoán CÓ dòng và cột, bằng chữ', async ({ page }) => {
    await moManChoi(page);

    await oSoan(page).fill('jobs:\n  a:\n    needs:\n      - khong-ton-tai\n    steps: []\n');
    await page.getByRole('button', { name: 'Chạy thử' }).click();

    /*
     * `role="alert"` chứ không phải "một dòng tô đỏ": nền màu một mình không kể
     * được gì cho người không phân biệt màu hay cho trình đọc màn hình. Ô này
     * đo đúng lớp đọc được.
     *
     * ⚠ THU PHẠM VI vào vùng kết quả. Next dựng sẵn một
     * `<div role="alert" id="__next-route-announcer__">` ở mọi trang, nên hỏi
     * `getByRole('alert')` trên cả trang là hai phần tử và chết ở strict mode —
     * một ô đỏ vì hạ tầng khung, không vì sản phẩm.
     */
    const alert = vungKetQua(page).getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('khong-ton-tai');
    await expect(alert).toContainText(/Dòng \d+, cột \d+/u);

    // Và KHÔNG được hiện ba con số 0 — đồ thị hỏng thì không có lượt nào chạy.
    await expect(page.getByTestId('cicd-axis-lead')).toHaveCount(0);
  });

  test('#8 — đường ống rỗng nói một câu, KHÔNG hiện ba con số 0', async ({ page }) => {
    await moManChoi(page);
    // c01 khởi đầu không có job nào: bấm ngay là đúng tình huống đã đo được.
    await page.getByRole('button', { name: 'Chạy thử' }).click();
    await expect(vungKetQua(page).getByTestId('cicd-empty')).toBeVisible();
    await expect(page.getByTestId('cicd-axis-lead')).toHaveCount(0);

    // Đối chứng: cùng màn, có job thì ba trục HIỆN — ô trên không xanh vì trục bị giấu vĩnh viễn.
    await oSoan(page).fill(YAML_LOI_GIAI);
    await page.getByRole('button', { name: 'Chạy thử' }).click();
    await expect(page.getByTestId('cicd-axis-lead')).toBeVisible();
    await expect(vungKetQua(page).getByTestId('cicd-empty')).toHaveCount(0);
  });

  test('#6 — mẩu chèn nằm DƯỚI dòng con trỏ, và focus quay về ô soạn', async ({ page }) => {
    await moManChoi(page);
    const o = oSoan(page);
    await o.fill('jobs:\n  clone:\n    steps: []\n');
    // Đặt con trỏ cuối dòng 2 bằng bàn phím, rồi Tab sang nút — đường của người dùng bàn phím.
    await o.focus();
    await o.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange('jobs:\n  clone:'.length, 'jobs:\n  clone:'.length);
    });
    await page.getByRole('group', { name: 'Chèn nhanh' }).getByRole('button', { name: 'Cạnh phụ thuộc' }).click();

    const van = await o.inputValue();
    expect(van.startsWith('jobs:\n  clone:\n    needs:\n')).toBe(true);
    expect(van.endsWith('    steps: []\n')).toBe(true);
    await expect(o).toBeFocused();
  });

  test('#3 — bảng tra nhanh hiện ra, và mục YAML của nó đọc được khi dán vào ô soạn', async ({ page }) => {
    await moManChoi(page);
    const bang = page.getByRole('region', { name: 'Tra nhanh' });
    await expect(bang).toBeVisible();

    const khoi = bang.locator('pre');
    // Đối chứng dương: c01 dạy cú pháp, nên phải có ít nhất một khối YAML để dán.
    expect(await khoi.count()).toBeGreaterThan(0);
    await oSoan(page).fill((await khoi.first().textContent()) ?? '');
    await page.getByRole('button', { name: 'Chạy thử' }).click();
    await expect(vungKetQua(page).getByText('Không quét được YAML')).toHaveCount(0);
  });

  test('AC-2/AC-H — 0 lời gọi backend trong suốt một lượt chơi', async ({ page }, testInfo) => {
    const trace = traceRequests(page);
    await moManChoi(page);

    // Mọi thứ trước dòng này là tải trang, và tải trang ĐƯỢC PHÉP gọi backend.
    trace.phase('đang chơi');

    // Một lượt chơi thật: sửa YAML, chèn mẩu, chạy thử hai lần.
    await oSoan(page).fill('jobs:\n  clone:\n    steps: []\n');
    await page.getByRole('button', { name: 'Chạy thử' }).click();
    await page.waitForTimeout(300);

    /*
     * ⛔ Không bọc trong `if (count > 0)`. Bản trước bọc, và vùng chèn khi đó là
     * một `<section aria-label>` — vai `region`, không phải `group` — nên
     * `count()` luôn 0 và lượt chèn KHÔNG BAO GIỜ chạy, trong khi ô vẫn xanh.
     */
    const chenNhanh = page.getByRole('group', { name: 'Chèn nhanh' });
    const truocKhiChen = await oSoan(page).inputValue();
    await chenNhanh.getByRole('button').first().click();
    await expect(oSoan(page)).not.toHaveValue(truocKhiChen);
    await page.getByRole('button', { name: 'Chạy thử' }).click();
    await page.waitForTimeout(500);

    const during = trace.all().filter((r) => r.phase === 'đang chơi');
    const api = during.filter((r) => r.sameOrigin && r.pathname.startsWith('/api/'));
    trace.stop();

    await attachJson(testInfo, 'cicd-ac2.json', {
      total: trace.all().length,
      during: during.length,
      api,
    });

    /*
     * Đối chứng dương: nếu KHÔNG request nào được thu trong pha này thì phép lọc
     * bên dưới xanh vì nó lọc trên tập rỗng, chứ không vì màn chơi sạch. Một
     * lượt chơi thật luôn kéo ít nhất vài asset.
     */
    expect(
      trace.all().length,
      'máy thu không ghi được request nào — phép lọc dưới đây sẽ xanh khống',
    ).toBeGreaterThan(0);

    expect(
      api.map((r) => `${r.method} ${r.pathname}`),
      'AC-2/AC-H: màn CI/CD phải chạy 100% trong trình duyệt. Mọi engine, level và ' +
        'bộ chấm đều nằm trong bundle; một lời gọi /api/ ở đây nghĩa là có đường ' +
        'rò ngược về máy chủ.',
    ).toEqual([]);
  });

  test('AC-6 — axe 0 vi phạm, màn danh sách và màn chơi', async ({ page }, testInfo) => {
    await openScreen(page, CICD_PATH, 'user');
    await settle(page);
    await scanAxe(page, testInfo, 'cicd-danh-sach');

    await moManChoi(page);
    await scanAxe(page, testInfo, 'cicd-man-choi');

    // Quét lại SAU khi có kết quả: bảng ba trục, danh sách mục tiêu và khối
    // `role="alert"` chỉ tồn tại ở trạng thái này, nên lượt quét trước không
    // nhìn thấy chúng.
    await page.getByRole('button', { name: 'Chạy thử' }).click();
    await expect(page.getByTestId('cicd-axis-lead')).toBeVisible();
    await scanAxe(page, testInfo, 'cicd-co-ket-qua');
  });
});
