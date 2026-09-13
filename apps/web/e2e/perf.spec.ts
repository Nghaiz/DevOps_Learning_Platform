/**
 * 13.H — LCP của `/lessons` đo bằng `PerformanceObserver`.
 *
 * ══ Vì sao một phép đo LCP ngây thơ luôn "đạt" ═════════════════════════════
 *
 * `largest-contentful-paint` không ném, không reject, và KHÔNG có gì báo khi
 * không có entry nào. Một spec viết theo phản xạ:
 *
 *     const lcp = await page.evaluate(() => window.__lcp ?? 0);
 *     expect(lcp).toBeLessThan(2500);          // ← 0 < 2500 ⇒ XANH
 *
 * sẽ XANH ở đúng ba cảnh nó cần phải đỏ: observer đăng ký SAU khi trang đã
 * paint (entry đã bắn xong, `buffered` không được bật), trình duyệt không hỗ
 * trợ loại entry này, và trang không render gì cả. "Không đo được" đọc ra
 * thành "nhanh". Đó là hình dạng `rate over an empty denominator` của
 * `green-that-proves-nothing`: unknown không được trông giống good.
 *
 * Nên file này dựng ba lớp, và không lớp nào thay được lớp nào:
 *   1. **tiền đề** — trình duyệt CÓ hỗ trợ `largest-contentful-paint`. Không
 *      hỗ trợ ⇒ đỏ với đúng lý do đó, không im lặng trả 0.
 *   2. **đối chứng dương** — làm chậm tài liệu một khoảng ĐÃ BIẾT rồi đòi con
 *      số đo được phải tăng theo. Đây là thứ chứng minh cái đồng hồ này bám
 *      hiện thực chứ không in ra một hằng số. Không có nó, mọi con số dưới chỉ
 *      là "một số nào đó đã được đọc".
 *   3. **phép đo thật** — có entry (đỏ nếu không), ghi số ra artifact, rồi mới
 *      so với ngân sách.
 *
 * ══ ⚠ NGÂN SÁCH DƯỚI ĐÂY CHƯA ĐƯỢC ĐO TRÊN CỤM NÀY ═════════════════════════
 *
 * Đọc `LCP_BUDGET_MS` và phần chú thích của nó trước khi trích bất kỳ kết luận
 * hiệu năng nào từ file này. Ô ngân sách hiện là một cái lưới THƯA có chủ ý,
 * và nó tự khai điều đó ra report.
 */

import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen } from './fixtures/nav';

/** Màn hình được đo. Deliverable của lane H trong bảng sở hữu §3 nêu đích danh. */
const TARGET_PATH = '/lessons';

/**
 * Ngân sách LCP cho `/lessons` trên cụm lab — **đã đo 2026-09-07**.
 *
 * Sáu mẫu liên tiếp trên `dlp.192.168.94.130.sslip.io` (node 12 vCPU, load ~1.3,
 * ảnh `dlp-web:p13a`), lấy từ chính `perf-lcp-lessons.json` của ô này:
 *
 *   | lượt | LCP (ms) | TTFB (ms) |
 *   |------|---------:|----------:|
 *   | 1 (NGUỘI) | 1496 | 739 |
 *   | 2 |  800 | 134 |
 *   | 3 |  732 |  62 |
 *   | 4 |  760 |  35 |
 *   | 5 |  544 |  35 |
 *   | 6 |  648 |  37 |
 *
 * Lượt đầu là lượt NGUỘI và nó phải nằm trong ngân sách: một pod vừa rollout
 * luôn phục vụ lượt đầu tiên ở trạng thái đó, nên đặt ngưỡng theo riêng các lượt
 * ấm là dựng một cổng đỏ sau mỗi lần deploy.
 *
 * **2500ms** vì đó là con số của CHÍNH ô nghiệm thu (`phase-13.md` 13.H mục 29:
 * "LCP ≤ 2.5s trên trang danh mục ở cấu hình lab") — nên cổng này đo đúng thứ
 * bản kế hoạch hứa, không phải một ngưỡng song song do harness tự đặt. Nó cũng
 * là biên "good" của Core Web Vitals, và bằng 1.67× lượt tệ nhất quan sát được,
 * đủ biên để không đỏ vì một lượt nguội mà vẫn bắt được hồi quy thật.
 *
 * ⚠ Số này đo trên một cụm RẢNH. Sáng cùng ngày, node từng ở load 72 / PSI cpu
 * 93.5% và web pod bị liveness giết — ở trạng thái đó mọi con số dưới đây vô
 * nghĩa. Một lượt đỏ phải đọc `ttfbMs` trong artifact TRƯỚC khi kết luận là hồi
 * quy frontend.
 */
const LCP_BUDGET_MS = 2500;

/**
 * Ngưỡng dưới, để "ngân sách quá thưa" thành một thứ đọc được trong report chứ
 * không phải một điều ai đó phải tự nhận ra. Không phải assertion — một trang
 * NHANH không được làm suite đỏ.
 */
const BUDGET_DECORATION_RATIO = 0.25;

/**
 * Độ trễ tiêm vào tài liệu ở ô đối chứng dương.
 *
 * 2000ms chứ không phải 200ms: cụm lab là một VM, và LCP giữa hai lượt tải
 * chênh nhau vài trăm ms là chuyện thường. Một khoảng tiêm nhỏ hơn nhiễu thì
 * ô đối chứng sẽ chập chờn, và một ô đối chứng chập chờn còn tệ hơn không có —
 * nó sẽ bị nới cho tới khi không còn kêu được nữa.
 */
const INJECTED_DELAY_MS = 2000;

/**
 * Phần của độ trễ tiêm mà phép đo PHẢI thấy lại. 0.5 là biên rộng có chủ ý:
 * ta đang chứng minh đồng hồ *bám* hiện thực, không hiệu chuẩn nó.
 */
const DELAY_DETECTION_RATIO = 0.5;

type LcpSample = {
  startTime: number;
  size: number;
  tag: string;
  id: string;
  text: string;
  url: string;
};

type NavSample = {
  /** TTFB — byte đầu của tài liệu. Phần KHÔNG do mã frontend quyết định. */
  responseStart: number;
  domContentLoaded: number;
  loadEnd: number;
};

declare global {
  interface Window {
    __lcp?: LcpSample[];
    __lcpSupported?: boolean;
  }
}

/**
 * Cài máy thu TRƯỚC khi tài liệu có script nào chạy.
 *
 * `addInitScript` đi qua CDP `Page.addScriptToEvaluateOnNewDocument`, nên nó
 * chạy sớm hơn cả bundle của app và tự động chạy lại ở MỌI lần điều hướng —
 * điều ô đối chứng dương dựa vào (nó điều hướng hai lượt).
 *
 * `buffered: true` vẫn được bật dù đã cài sớm: hai lớp bảo vệ cho cùng một
 * chuyện, và lớp thứ hai không tốn gì.
 */
async function installLcpCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__lcp = [];
    // Đọc khả năng hỗ trợ TRƯỚC khi thử `observe()`: nếu đọc sau, một lỗi bất
    // kỳ trong khối dưới sẽ bị quy thành "trình duyệt không hỗ trợ" và ô tiền
    // đề đỏ với lý do sai.
    window.__lcpSupported =
      typeof PerformanceObserver !== 'undefined' &&
      (PerformanceObserver.supportedEntryTypes ?? []).includes('largest-contentful-paint');

    if (window.__lcpSupported !== true) return;

    const observer = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as PerformanceEntry & {
          size?: number;
          element?: Element | null;
          url?: string;
        };
        window.__lcp?.push({
          startTime: entry.startTime,
          size: entry.size ?? 0,
          tag: entry.element?.tagName.toLowerCase() ?? '',
          id: entry.element?.id ?? '',
          text: (entry.element?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
          url: entry.url ?? '',
        });
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

/**
 * Entry LCP cuối cùng — LCP THẬT.
 *
 * LCP là một giá trị *thay đổi*: trình duyệt bắn một entry mới mỗi lần có phần
 * tử vẽ ra lớn hơn, và chỉ chốt lại khi người dùng tương tác hoặc trang bị ẩn.
 * Lấy entry ĐẦU tiên là đo cái skeleton; lấy entry cuối mới là đo thứ người
 * dùng thực sự nhìn thấy. Suite này không tương tác trước khi đọc, nên entry
 * cuối là giá trị cuối cùng.
 *
 * Trả `null` khi KHÔNG có entry nào — người gọi phải xử lý tường minh. Trả 0 ở
 * đây là cách nhanh nhất để "không đo được" đi tiếp thành "nhanh".
 */
async function readLcp(page: Page): Promise<LcpSample | null> {
  const samples = await page.evaluate(() => window.__lcp ?? []);
  return samples.length === 0 ? null : (samples[samples.length - 1] as LcpSample);
}

async function readNavigation(page: Page): Promise<NavSample> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return {
      responseStart: nav?.responseStart ?? 0,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? 0,
      loadEnd: nav?.loadEventEnd ?? 0,
    };
  });
}

/**
 * Chờ LCP ổn định.
 *
 * `openScreen` đã chờ `load` + `networkidle` (có timeout), nhưng danh mục
 * `/lessons` nạp qua tRPC ở CLIENT: lúc `load` bắn, lưới còn là skeleton và
 * entry LCP lúc đó nói về một khối rỗng. Chờ thêm cho tới khi số entry không
 * tăng nữa trong một khoảng lặng — như vậy con số đọc ra là về nội dung thật,
 * không phải về trạng thái đang tải.
 *
 * Có trần lặp: nếu trang không bao giờ lặng thì đọc số hiện có và đi tiếp, còn
 * "trang có nội dung" đã được `openScreen` khẳng định riêng.
 */
async function waitForLcpSettled(page: Page): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 12; i += 1) {
    const count = await page.evaluate(() => (window.__lcp ?? []).length);
    if (count > 0 && count === previous) return;
    previous = count;
    await page.waitForTimeout(500);
  }
}

async function attachSample(
  testInfo: TestInfo,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await testInfo.attach(name, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(payload, null, 2)),
  });
}

// ═══════════════════════════════════════════════════════════════════ tiền đề

test('tiền đề: trình duyệt hỗ trợ entry largest-contentful-paint', async ({ page }) => {
  await installLcpCollector(page);
  await openScreen(page, TARGET_PATH, 'user');

  expect(
    await page.evaluate(() => window.__lcpSupported),
    'Trình duyệt của lượt chạy này KHÔNG khai `largest-contentful-paint` trong ' +
      '`PerformanceObserver.supportedEntryTypes`. Mọi con số LCP dưới đây sẽ là ' +
      '"không có entry", và một spec cẩu thả sẽ đọc điều đó thành "LCP = 0, rất nhanh".',
  ).toBe(true);
});

// ═════════════════════════════════════════════════════════ đối chứng dương

test('đối chứng dương — làm chậm tài liệu thì LCP đo được PHẢI tăng theo', async ({
  page,
}, testInfo) => {
  // Hai lượt điều hướng đầy đủ + độ trễ tiêm. Trần 60s mặc định của config là
  // ngân sách cho MỘT lượt tải nguội (đã đo 12s), không cho hai.
  test.setTimeout(180_000);

  await installLcpCollector(page);

  await openScreen(page, TARGET_PATH, 'user');
  await waitForLcpSettled(page);
  const baseline = await readLcp(page);
  expect(
    baseline,
    'Lượt nền không thu được entry LCP nào, nên không có gì để so ở lượt chậm. ' +
      'Máy thu hỏng hoặc trang không vẽ ra nội dung nào.',
  ).not.toBeNull();

  /*
    Làm chậm CHÍNH tài liệu HTML, không làm chậm một tài nguyên phụ.

    LCP tính theo `timeOrigin` = lúc điều hướng bắt đầu, tức TRƯỚC khi response
    về. Giữ response lại 2000ms thì mọi mốc sau đó dịch đi đúng 2000ms, và con
    số đo được phải phản ánh điều đó. Đây là một quan hệ nhân-quả đã biết
    trước, nên nó kiểm được cái đồng hồ mà không cần biết cụm nhanh hay chậm.

    `route.fetch()` rồi `fulfill({ response })` giữ nguyên header — nên CSP,
    nonce và cookie của trang không đổi, và ta không vô tình đo một trang khác.
  */
  await page.route(`**${TARGET_PATH}`, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, INJECTED_DELAY_MS));
    await route.fulfill({ response });
  });

  await openScreen(page, TARGET_PATH, 'user');
  await waitForLcpSettled(page);
  const delayed = await readLcp(page);
  expect(delayed, 'Lượt chậm không thu được entry LCP nào').not.toBeNull();

  const gap = (delayed as LcpSample).startTime - (baseline as LcpSample).startTime;
  await attachSample(testInfo, 'perf-positive-control.json', {
    baselineMs: Math.round((baseline as LcpSample).startTime),
    delayedMs: Math.round((delayed as LcpSample).startTime),
    injectedDelayMs: INJECTED_DELAY_MS,
    observedGapMs: Math.round(gap),
  });

  expect(
    gap,
    `Đã giữ tài liệu lại ${INJECTED_DELAY_MS}ms mà LCP đo được chỉ tăng ` +
      `${Math.round(gap)}ms. Cái đồng hồ này KHÔNG bám vào hiện thực, nên mọi ` +
      `con số nó in ra — kể cả một con số "đạt ngân sách" — không nói lên điều gì.`,
  ).toBeGreaterThan(INJECTED_DELAY_MS * DELAY_DETECTION_RATIO);
});

// ═══════════════════════════════════════════════════════════════ phép đo thật

test(`LCP ${TARGET_PATH}`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  await installLcpCollector(page);
  await openScreen(page, TARGET_PATH, 'user');
  await waitForLcpSettled(page);

  const lcp = await readLcp(page);
  const nav = await readNavigation(page);

  /*
    Ghi cả phân rã, không chỉ một con số.

    LCP là một TỔNG: TTFB (mạng + server) + tải/parse bundle + fetch danh mục +
    vẽ. Trên cụm lab một node, phần đầu có thể chiếm phần lớn — và một ô AC gác
    trên tổng thì đỏ vì hạ tầng, còn thứ nó định gác (mã frontend) thì không
    bao giờ làm nó đỏ. Đợt 3 cần con số phân rã để quyết định gác nửa nào, nên
    nó phải nằm trong artifact chứ không nằm trong trí nhớ ai.
  */
  await attachSample(testInfo, 'perf-lcp-lessons.json', {
    path: TARGET_PATH,
    lcpMs: lcp === null ? null : Math.round(lcp.startTime),
    lcpElement: lcp === null ? null : { tag: lcp.tag, id: lcp.id, text: lcp.text, size: lcp.size },
    ttfbMs: Math.round(nav.responseStart),
    domContentLoadedMs: Math.round(nav.domContentLoaded),
    loadEndMs: Math.round(nav.loadEnd),
    // Phần LCP nằm SAU byte đầu tiên — xấp xỉ phần mã frontend có tiếng nói.
    afterTtfbMs: lcp === null ? null : Math.round(lcp.startTime - nav.responseStart),
    budgetMs: LCP_BUDGET_MS,
    budgetIsProvisional: false,
    observedRatio: lcp === null ? null : Number((lcp.startTime / LCP_BUDGET_MS).toFixed(3)),
  });

  // Tiền đề của chính ô này, và là lý do file này dài hơn ba dòng: KHÔNG có
  // entry nghĩa là không đo được, và không đo được thì không được đi tiếp vào
  // một phép so số học — `0 < 4000` sẽ xanh.
  expect(
    lcp,
    `Không thu được entry LCP nào trên ${TARGET_PATH}. Đây là "không đo được", ` +
      `KHÔNG phải "LCP tốt" — trang có thể chưa vẽ ra phần tử contentful nào, ` +
      `hoặc máy thu chưa kịp cài. Đừng nới ô này thành một phép so với 0.`,
  ).not.toBeNull();

  const value = (lcp as LcpSample).startTime;

  if (value < LCP_BUDGET_MS * BUDGET_DECORATION_RATIO) {
    /*
      Không phải lỗi — một trang nhanh không được làm suite đỏ. Nhưng một
      ngưỡng mà phép đo không bao giờ tới gần là trang trí, và điều kiện kết
      thúc của cái "tạm" phải tự nói ra ở lượt chạy chứ không nằm chờ ai nhớ
      (`pinned-baseline-test-companion`).
    */
    testInfo.annotations.push({
      type: 'ngân-sách-quá-thưa',
      description:
        `LCP đo được ${Math.round(value)}ms, chỉ bằng ` +
        `${Math.round((value / LCP_BUDGET_MS) * 100)}% ngân sách ${LCP_BUDGET_MS}ms. ` +
        `Ngân sách đã đo (2026-09-07, 6 mẫu, tệ nhất 1496ms lúc nguội) và bằng ` +
        `đúng ô AC 13.H mục 29 — nên "thưa" ở đây nghĩa là trang đang nhanh hơn ` +
        `yêu cầu, KHÔNG phải ngưỡng cần siết. Chỉ siết nếu ô AC đổi.`,
    });
  }

  expect(
    value,
    `LCP ${TARGET_PATH} = ${Math.round(value)}ms, vượt ngân sách ${LCP_BUDGET_MS}ms.\n` +
      `⚠ Trước khi đổ lỗi cho mã frontend: TTFB của lượt này là ` +
      `${Math.round(nav.responseStart)}ms. Nếu TTFB đã chiếm phần lớn con số thì ` +
      `đây là cụm chậm, không phải trang chậm — đọc perf-lcp-lessons.json trong ` +
      `artifact rồi mới kết luận.\n` +
      `⚠ Ngân sách ${LCP_BUDGET_MS}ms ĐÃ đo trên chính cụm này (6 mẫu 2026-09-07, ` +
      `tệ nhất 1496ms lúc nguội) và bằng đúng ô AC 13.H mục 29. Nhưng nó đo trên ` +
      `một cụm RẢNH — kiểm load/PSI của node trước khi kết luận là hồi quy.`,
  ).toBeLessThan(LCP_BUDGET_MS);
});

// ═══════════════════════════ P16 §16.I mục 3 — ngân sách LCP cho `/` (trang chủ)

/** Trang chủ hiện dùng nội dung HTML và bản minh hoạ terminal tương tác. */
const HOME_PATH = '/';

/**
 * Ngân sách LCP cho `/` — **đã đo 2026-09-11**.
 *
 * Một lượt `npx playwright test perf.spec.ts` trên `next start` cục bộ (Windows,
 * build của nhánh `feat/p16-i-gates`, Postgres + Redis trong docker):
 *
 *   | màn | LCP (ms) | TTFB (ms) | sau TTFB (ms) | phần tử LCP |
 *   |------|---------:|----------:|--------------:|---|
 *   | `/`         | **152** | 43 | 109 | `<h1>` «Học DevOps bằng cách gõ lệnh thật» |
 *   | `/lessons`  |     360 | 22 | 338 | `<h3>` «CKAD: ConfigMap as Files…» |
 *
 * Đối chứng dương của cùng lượt: tiêm 2000ms trễ vào tài liệu ⇒ LCP 380 → 2544ms
 * (chênh 2164ms). Đồng hồ bám hiện thực, không in ra một hằng số.
 *
 * `/` nhanh hơn `/lessons` **2.4×** đúng như dự đoán: nó không có lượt fetch tRPC
 * ở client trước khi có nội dung. Tỉ số 0.42 là thứ mang nghĩa khi so hai môi
 * trường; con số tuyệt đối thì không.
 *
 * ⚠ ĐỌC TRƯỚC KHI SO VỚI `LCP_BUDGET_MS`: hai con số này KHÔNG đo trên cùng
 * một máy. `LCP_BUDGET_MS` (2500) đo trên **cụm lab** ngày 2026-09-07 với ảnh
 * `dlp-web:p13a`. Ngân sách dưới đây đo bằng `next start` **cục bộ** trên máy
 * dựng, vì bản frontend P16 (tám lane, gộp 2026-09-11) **chưa được deploy lên
 * cụm** — chạy suite lên cụm là đo một binary khác hẳn cái vừa build, và
 * `/register`, `/problems`, `/games` ở đó còn trả 404.
 *
 * Để hai con số vẫn SO ĐƯỢC với nhau, lượt đo ghi cả `/` lẫn `/lessons` trong
 * CÙNG một lượt chạy, cùng máy, cùng build. Tỉ số `/` ÷ `/lessons` là thứ mang
 * nghĩa qua các môi trường; con số tuyệt đối thì không. Report §3 ghi cả hai.
 *
 * Cả hai trang giữ ngân sách nghiệm thu 2500ms. Các mẫu 2026-09-11 ở trên chỉ
 * là lịch sử; lượt chạy hiện tại luôn ghi mẫu mới của cả hai trang vào artifact.
 *
 * ⚠ Chú thích ở đây từng ghi "cảnh 3D cũ đã được gỡ hoàn toàn" theo chỉ đạo
 * 2026-09-12. Chỉ đạo đó bị ĐẢO NGƯỢC cùng ngày 2026-09-13 và `d5bf768` đưa lại
 * một hành trình 3D cuộn toàn trang. Câu cũ vì thế SAI, và nó nguy hiểm hơn một
 * câu sai bình thường: cùng lượt sửa đó đã xoá luôn phần lý giải vì sao
 * `<canvas>` không được là phần tử LCP, để lại một khẳng định không ai còn biết
 * lý do. Phần lý giải được khôi phục ngay dưới khẳng định ấy.
 */
const HOME_LCP_BUDGET_MS = 2500;

/**
 * Cờ trung thực. `true` khi con số trên chưa có mẫu đo thật đứng sau.
 * `perf-lcp-home.json` chở nó ra artifact để một lượt chạy tự khai, thay vì để
 * người đọc phải tin chú thích.
 */
const HOME_BUDGET_IS_PROVISIONAL = false;

test.describe('LCP trang chủ', () => {
  // `/` là màn anon. Mở nó bằng storageState của một tài khoản đã đăng nhập là
  // đo một biến thể khác của trang (vỏ có nav đầy đủ, có thể có redirect), nên
  // jar cookie phải rỗng — cùng lý do `a11y.spec.ts` đã ghi.
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`LCP ${HOME_PATH} nằm trong ngân sách`, async ({ page }, testInfo) => {
    await installLcpCollector(page);
    await openScreen(page, HOME_PATH, 'anon');
    await waitForLcpSettled(page);

    const lcp = await readLcp(page);
    const nav = await readNavigation(page);

    await attachSample(testInfo, 'perf-lcp-home.json', {
      path: HOME_PATH,
      lcpMs: lcp === null ? null : Math.round(lcp.startTime),
      lcpElement:
        lcp === null ? null : { tag: lcp.tag, id: lcp.id, text: lcp.text, size: lcp.size },
      ttfbMs: Math.round(nav.responseStart),
      domContentLoadedMs: Math.round(nav.domContentLoaded),
      loadEndMs: Math.round(nav.loadEnd),
      afterTtfbMs: lcp === null ? null : Math.round(lcp.startTime - nav.responseStart),
      budgetMs: HOME_LCP_BUDGET_MS,
      budgetIsProvisional: HOME_BUDGET_IS_PROVISIONAL,
      observedRatio: lcp === null ? null : Number((lcp.startTime / HOME_LCP_BUDGET_MS).toFixed(3)),
    });

    expect(
      lcp,
      `Không thu được entry LCP nào trên ${HOME_PATH}. Đây là "không đo được", ` +
        `KHÔNG phải "LCP tốt".`,
    ).not.toBeNull();

    const sample = lcp as LcpSample;

    /*
      Nội dung đọc được phải có mặt trong lần paint đầu của landing.

      ⛔ Vì sao `<canvas>` bị loại TÊN, chứ không chỉ đo thời gian: landing nay
      CÓ một canvas WebGL phủ toàn trang (`components/marketing/experience-scene.tsx`).
      Nếu chính nó là phần tử LCP thì phép đo đang khen một khung hình GPU chứ
      không phải nội dung người học đọc được — và một trang chỉ vẽ canvas kịp
      hạn vẫn là một trang trắng chữ đối với người dùng lẫn bộ máy tìm kiếm.
      Cảnh nạp LƯỜI và đứng sau nội dung HTML, nên tên thẻ ở đây là phép kiểm
      rằng thứ tự đó còn đúng.

      Khẳng định này có TRƯỚC cảnh 3D và sống sót qua cả hai lần đổi chiều chỉ
      đạo. Đừng gỡ nó khi landing đổi hình lần nữa.
    */
    expect(
      sample.tag,
      `Phần tử LCP của ${HOME_PATH} là <${sample.tag}>; landing phải hiển thị ` +
        `nội dung HTML đọc được ngay trong lần paint đầu, không phải khung hình ` +
        `đầu của canvas 3D.`,
    ).not.toBe('canvas');

    if (sample.startTime < HOME_LCP_BUDGET_MS * BUDGET_DECORATION_RATIO) {
      testInfo.annotations.push({
        type: 'ngân-sách-quá-thưa',
        description:
          `LCP ${HOME_PATH} đo được ${Math.round(sample.startTime)}ms, bằng ` +
          `${Math.round((sample.startTime / HOME_LCP_BUDGET_MS) * 100)}% ngân sách ` +
          `${HOME_LCP_BUDGET_MS}ms. Ngân sách bằng ô AC chung (2.5s, biên "good" ` +
          `của Core Web Vitals), không phải một ngưỡng harness tự đặt — nên "thưa" ` +
          `ở đây nghĩa là trang nhanh hơn yêu cầu.`,
      });
    }

    expect(
      sample.startTime,
      `LCP ${HOME_PATH} = ${Math.round(sample.startTime)}ms, vượt ngân sách ` +
        `${HOME_LCP_BUDGET_MS}ms.\n` +
        `⚠ TTFB của lượt này là ${Math.round(nav.responseStart)}ms. Nếu TTFB chiếm ` +
        `phần lớn con số thì đây là máy chậm, không phải trang chậm.\n` +
        `⚠ Phần tử LCP: <${sample.tag}> «${sample.text}».`,
    ).toBeLessThan(HOME_LCP_BUDGET_MS);
  });
});
