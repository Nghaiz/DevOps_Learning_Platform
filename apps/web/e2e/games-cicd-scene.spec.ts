/**
 * P19 §19.D — tầng hình ảnh game CI/CD, đo bằng TRÌNH DUYỆT THẬT.
 *
 * | Ô | Đo gì |
 * |---|---|
 * | **AC-D1** | Số node vẽ ra = số THỰC THỂ (không phải số stage), trên một màn có `fanOut` |
 * | **AC-D3** | Đường 2D dùng được, có đối chứng dương là nhánh 3D |
 * | **AC-D4** | Số lệnh vẽ < 100, ghim theo TỪNG bậc chất lượng |
 * | **AC-D6** | 0 lời gọi `/api/` trong lúc chơi, KỂ CẢ khi bật 3D |
 * | **AC-D7** | Sân chơi toàn màn hình sau khi thu hết lớp phủ |
 * | **AC-D10** | `prefers-reduced-motion: reduce` ⇒ không còn chuyển động lặp vô hạn |
 *
 * ══ Vì sao tách khỏi `games-cicd.spec.ts` ═════════════════════════════════
 *
 * File kia đo *luật chơi* qua giao diện (ba trục, chẩn đoán YAML, bảng núm CD).
 * File này đo *tầng vẽ*, và hai nhóm hỏng vì những lý do khác hẳn nhau — gộp lại
 * thì một lượt đỏ không nói được là luật chơi sai hay cảnh sai.
 *
 * ⛔ Cả hai file phải có tên trong `e2e:ci` của `apps/web/package.json`, nếu
 * không nó không gác gì cả.
 *
 * ══ Chạy ══════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ORIGIN=http://localhost:3000 \
 *   npx playwright test games-cicd-scene.spec.ts
 *
 * ⚠ Thiếu `E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary
 * khác binary vừa sửa. Và `pnpm start` phục vụ `.next` ĐÃ BUILD — sửa mã xong
 * phải build lại, nếu không lượt chạy này đo bản cũ mà vẫn báo cáo như bản mới.
 */

import type { Page } from '@playwright/test';
import { CI_LEVELS, buildGraphView } from '@devops-platform/games';

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { THREE_MARKERS, findMarkers, scanAxe, traceRequests, traceScripts } from './games-harness';

/**
 * C13, không phải C12.
 *
 * Trực giác chọn C12 vì tên nó là "ma trận quạt ra", nhưng `initialWorkflow` của
 * C12 **không có `fanOut`** — người chơi phải tự gõ vào, đó chính là bài học của
 * màn. Chỉ `solutionWorkflow` mới quạt. Chạy AC-D1 ở đó thì đồ thị không quạt ra,
 * và ô này KHÔNG phủ được con bug gộp node mà nó tồn tại để bắt — nó vẫn xanh.
 */
function manQuatRa() {
  const level = CI_LEVELS.find((l) => l.id.startsWith('cicd-c13-'));
  if (level === undefined) throw new Error('không tìm thấy C13');
  return level;
}

function duongDanMan(levelId: string): string {
  return `/games/cicd/${levelId}`;
}

/** Thu hết lớp phủ. Phím `0` là đường bàn phím; bấm vào sân trước để rời ô soạn. */
async function thuHetLopPhu(page: Page): Promise<void> {
  await page.getByTestId('cicd-field').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('0');
  await settle(page);
}

const THEMES = ['light', 'dark'] as const;

async function datTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

/**
 * Đối chứng cho chính phép đổi theme: thiếu nó thì một app lờ đi media query sẽ
 * làm lượt "theme tối" quét lại đúng theme sáng mà vẫn xanh.
 */
async function khangDinhTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  const coDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(coDark, `<html> phải ${theme === 'dark' ? 'CÓ' : 'KHÔNG có'} class dark`).toBe(
    theme === 'dark',
  );
}

async function doiCheDo(page: Page, che: '2D' | '3D'): Promise<void> {
  await page.getByRole('group', { name: 'Chế độ vẽ' }).getByRole('button', { name: che }).click();
  await settle(page);
}

test.describe('Game CI/CD — §19.D tầng hình ảnh', () => {
  test('AC-D1 — số node vẽ ra bằng số THỰC THỂ, trên một màn có fanOut @games-cicd-scene', async ({
    page,
  }) => {
    const level = manQuatRa();

    /*
     * Số kỳ vọng đọc TỪ DỮ LIỆU LEVEL qua chính hàm mà cảnh dùng, không chép tay
     * một con số: chép tay thì ô này đỏ mỗi lần ai đó sửa màn, vì một lý do không
     * liên quan tới thứ nó đo.
     */
    const view = buildGraphView({ workflow: level.initialWorkflow, run: null, yAxis: 'ci' });
    const soThucThe = view.nodes.length;
    const soStage = new Set(view.nodes.map((n) => n.stageId)).size;

    /*
     * ⛔ ĐỐI CHỨNG của chính ô này: hai con số phải KHÁC nhau, nếu không màn được
     * chọn không quạt ra và phép so bên dưới không phân biệt được "đếm theo thực
     * thể" với "đếm theo stage" — tức ô này xanh mà chứng minh đúng zero điều gì.
     */
    expect(soThucThe).toBeGreaterThan(soStage);

    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);

    const canh = page.getByTestId('cicd-scene-2d');
    await expect(canh).toBeVisible();
    await expect(canh).toHaveAttribute('data-cicd-node-count', String(soThucThe));

    /*
     * Ở 2D mỗi node là một phần tử DOM thật, nên bộ đếm trên gốc cảnh phải khớp
     * với số phần tử đếm được. Hai nguồn độc lập cho cùng một sự thật: bộ đếm sai
     * mà DOM đúng (hoặc ngược lại) đều đỏ ở đây.
     */
    await expect(page.locator('[data-cicd-node]')).toHaveCount(soThucThe);
  });

  test('AC-D3 — đường 2D dùng được, và 3D là đối chứng dương @games-cicd-scene', async ({ page }) => {
    const level = manQuatRa();
    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);

    // 2D là chế độ MẶC ĐỊNH, không phải bản dự phòng (§19.D.2).
    await expect(page.getByTestId('cicd-scene-2d')).toBeVisible();
    await expect(page.getByTestId('cicd-scene-3d')).toHaveCount(0);

    /*
     * Đối chứng dương. Không có vế này thì ô trên xanh kể cả khi nút 3D hỏng hoàn
     * toàn — "luôn thấy 2D" và "2D dùng được" đọc ra giống hệt nhau.
     */
    await doiCheDo(page, '3D');
    await expect(page.getByTestId('cicd-scene-3d')).toBeVisible();
    await expect(page.getByTestId('cicd-scene-2d')).toHaveCount(0);

    // Và quay lại được — lựa chọn tay thắng kết quả dò, cả hai chiều.
    await doiCheDo(page, '2D');
    await expect(page.getByTestId('cicd-scene-2d')).toBeVisible();
  });

  test('AC-D4 — số lệnh vẽ < 100, ghim theo bậc chất lượng @games-cicd-scene', async ({ page }) => {
    const level = manQuatRa();
    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);
    await doiCheDo(page, '3D');

    const canh = page.getByTestId('cicd-scene-3d');
    await expect(canh).toBeVisible();

    const stats = await page.waitForFunction(
      () => {
        const doc = globalThis as unknown as { __dlpCicdScene?: () => unknown };
        const read = doc.__dlpCicdScene;
        if (typeof read !== 'function') return null;
        const value = read() as { frames?: number } | null;
        return value !== null && (value.frames ?? 0) > 0 ? value : null;
      },
      undefined,
      { timeout: 20_000 },
    );
    const doc = (await stats.jsonValue()) as {
      readonly calls: number;
      readonly tier: string;
      readonly nodes: number;
    };

    /*
     * ⛔ Bậc chất lượng ghi CÙNG con số. Một ô khẳng định "< 100" mà không nói nó
     * đo ở bậc nào thì chứng minh đúng zero điều gì: bậc thấp tắt bóng mềm và hậu
     * kỳ, nên nó gần như luôn đạt kể cả khi bậc cao vỡ trần.
     */
    expect(doc.tier, 'bậc chất lượng phải có mặt cùng số lệnh vẽ').toBeTruthy();
    expect(doc.nodes, 'cảnh phải thật sự dựng node, không phải đếm trên một cảnh rỗng').toBeGreaterThan(0);
    expect(doc.calls, `số lệnh vẽ ở bậc ${doc.tier}`).toBeLessThan(100);
  });

  test('AC-D6 — 0 lời gọi backend trong lúc chơi, kể cả khi bật 3D @games-cicd-scene', async ({
    page,
  }, testInfo) => {
    const level = manQuatRa();
    const trace = traceRequests(page);

    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);

    trace.phase('đang chơi');
    await doiCheDo(page, '3D');
    await doiCheDo(page, '2D');
    await thuHetLopPhu(page);

    const goi = trace.apiCalls().filter((r) => r.phase === 'đang chơi');
    if (goi.length > 0) {
      await testInfo.attach('loi-goi-backend', {
        body: JSON.stringify(goi, null, 2),
        contentType: 'application/json',
      });
    }
    expect(goi, 'engine chạy trong bộ nhớ trình duyệt — không đường nào chạm backend').toEqual([]);
  });

  test('AC-D7 — sân chơi toàn màn hình sau khi thu hết lớp phủ @games-cicd-scene', async ({
    page,
  }) => {
    const level = manQuatRa();
    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);
    await thuHetLopPhu(page);

    const san = page.getByTestId('cicd-field');
    const hop = await san.boundingBox();
    const khung = page.viewportSize();
    if (hop === null || khung === null) throw new Error('không đo được sân hoặc khung nhìn');

    /*
     * Đây là ô mà bố cục cũ (`grid lg:grid-cols-2`) làm ĐỎ, và nó đỏ vì hai lý do
     * độc lập: sân chỉ chiếm nửa bề ngang, và route không immersive nên vỏ ứng
     * dụng chừa 224px sidebar (~82.5% ở 1280px). Cả hai đã sửa ở 19.D.
     */
    expect(hop.width / khung.width, 'chiều rộng sân / khung nhìn').toBeGreaterThan(0.95);
    expect(hop.height / khung.height, 'chiều cao sân / khung nhìn').toBeGreaterThan(0.8);
  });

  for (const theme of THEMES) {
    test(`AC-D5 — axe 0 vi phạm ở CHẾ ĐỘ 3D (theme ${theme}) @games-cicd-scene`, async ({
      page,
    }, testInfo) => {
      /*
       * Ô axe của `games-cicd.spec.ts` chỉ quét chế độ 2D. Cảnh 3D có một cây DOM
       * KHÁC HẲN — canvas, lớp nhãn, nút xoay camera, vùng `aria-live` — nên nó
       * không được quét lần nào cho tới ô này.
       */
      const level = manQuatRa();
      await datTheme(page, theme);
      await openScreen(page, duongDanMan(level.id), 'user');
      await settle(page);
      await khangDinhTheme(page, theme);

      await doiCheDo(page, '3D');
      await expect(page.getByTestId('cicd-scene-3d')).toBeVisible();

      await scanAxe(page, testInfo, `cicd-canh-3d-${theme}`);
    });
  }

  test('AC-D9 — route không-3D KHÔNG kéo three, bật 3D thì CÓ @games-cicd-scene', async ({
    page,
  }, testInfo) => {
    const level = manQuatRa();

    const scripts = traceScripts(page);
    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);
    await expect(page.getByTestId('cicd-scene-2d')).toBeVisible();

    const truoc = [...scripts.urls()];
    const oDuong2d = await findMarkers(page, truoc, THREE_MARKERS);
    await testInfo.attach('scripts-che-do-2d', {
      body: JSON.stringify({ scanned: oDuong2d.scanned, bytes: oDuong2d.bytes, hits: oDuong2d.hits }, null, 2),
      contentType: 'application/json',
    });

    expect(
      oDuong2d.hits,
      'chế độ 2D không được kéo ~631KB engine 3D — P17 đã một lần rò qua đúng một barrel (44f8e39)',
    ).toEqual([]);
    expect(oDuong2d.scanned, 'phải có script để quét, nếu không phép đo rỗng').toBeGreaterThan(0);

    /*
     * ⛔ ĐỐI CHỨNG DƯƠNG. Không có vế này thì ô trên xanh kể cả khi phép dò dấu
     * hỏng hoàn toàn (sai dấu, sai đường tải, `next/dynamic` không bao giờ nạp) —
     * "không tìm thấy three" và "không tìm được gì cả" đọc ra giống hệt nhau.
     */
    await doiCheDo(page, '3D');
    await expect(page.getByTestId('cicd-scene-3d')).toBeVisible();

    const them = scripts.urls().filter((u) => !truoc.includes(u));
    expect(them, 'bật 3D phải nạp thêm chunk mới').not.toEqual([]);
    const oDuong3d = await findMarkers(page, them, THREE_MARKERS);
    expect(
      oDuong3d.hits.length,
      'bật 3D thì three PHẢI xuất hiện — nếu không, phép dò ở trên không chứng minh gì',
    ).toBeGreaterThan(0);

    scripts.stop();
  });

  test.describe('AC-D10 — giảm chuyển động', () => {
    test.use({ reducedMotion: 'reduce' });

    test('không còn chuyển động LẶP VÔ HẠN nào trong cảnh @games-cicd-scene', async ({ page }) => {
      const level = manQuatRa();
      await openScreen(page, duongDanMan(level.id), 'user');
      await settle(page);

      const canh = page.getByTestId('cicd-scene-2d');
      await expect(canh).toBeVisible();

      /*
       * Quét `getComputedStyle` của MỌI phần tử trong cảnh thay vì tin vào một cờ
       * React: thứ người dùng chịu là CSS đã phân giải, và một nhánh
       * `prefers-reduced-motion` viết sai vẫn để `animation-iteration-count`
       * nguyên `infinite` trong khi mã đọc ra như đã tắt.
       *
       * `<animate>` của SMIL cũng đếm — nó không đi qua `getComputedStyle`, nên
       * một cảnh SVG dùng SMIL sẽ lọt nếu chỉ quét CSS.
       */
      const lapVoHan = await canh.evaluate((goc) => {
        const ten: string[] = [];
        for (const el of [goc, ...Array.from(goc.querySelectorAll('*'))]) {
          const style = globalThis.getComputedStyle(el);
          const soLan = style.animationIterationCount;
          if (soLan.split(',').some((v) => v.trim() === 'infinite')) {
            ten.push(`${el.nodeName.toLowerCase()}:${style.animationName}`);
          }
        }
        for (const smil of Array.from(goc.querySelectorAll('animate, animateTransform, animateMotion'))) {
          const lap = smil.getAttribute('repeatCount');
          if (lap === 'indefinite') ten.push(`smil:${smil.nodeName.toLowerCase()}`);
        }
        return ten;
      });

      expect(lapVoHan, 'reduce ⇒ không chuyển động nào được lặp vô hạn').toEqual([]);
    });
  });
});
