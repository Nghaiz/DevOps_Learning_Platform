/**
 * P16 §16.I mục 5 — ba ô CHUYỂN từ 16.A sang đây vì chúng chỉ đo được trong
 * một trình duyệt thật.
 *
 * ══ Vì sao ba ô này không thể sống ở `packages/motion` ══════════════════════
 *
 * `packages/motion` chạy vitest ở `environment: 'node'`, không sở hữu
 * stylesheet nào, và jsdom không phân giải `matchMedia` lẫn `@media` trong
 * cascade. Nó khẳng định được rằng `arcProgressProps` PHÁT RA chuỗi
 * `calc(1 - var(--p))`; nó không khẳng định được rằng một trình duyệt làm gì
 * với chuỗi đó. Đấy là hai câu hỏi khác nhau, và 110 ô xanh của gói đó chỉ trả
 * lời câu thứ nhất.
 *
 * ══ Hai trong ba ô hỏng IM LẶNG ════════════════════════════════════════════
 *
 * Không lỗi, không log, không cảnh báo:
 *   - **AC-7 sai** ⇒ trang TRÔNG NHƯ đã tuân thủ reduced-motion. Người bật cờ
 *     đó vẫn thấy mọi thứ trôi, và không dòng nào trong console nói ra.
 *   - **§8.3 sai** ⇒ cung NHẢY một nhịp thay vì chạy. Vẫn đúng vị trí cuối,
 *     vẫn đúng màu, vẫn đúng hình — chỉ mất chuyển động.
 *
 * Nên mỗi ô dưới đây đi kèm ĐỐI CHỨNG: một khẳng định "0.01ms" một mình không
 * phân biệt được "cổng reduced-motion đang chạy" với "phần tử này chưa bao giờ
 * có transition nào". Cả hai đọc ra `0.0001s`.
 *
 * ══ Đo trên bề mặt NÀO ═════════════════════════════════════════════════════
 *
 * Cả bốn bề mặt motif (`EmptyState`, `Spinner`, `ProgressBar`, cung góc thẻ)
 * vẽ CÙNG một hằng `ARC_PATH_D` của `packages/motion`, nên hình học đo một lần
 * là đúng cho cả bốn — miễn là không ai phủ `transform` lên phần tử cung, và ô
 * hình học dưới khẳng định đúng điều đó.
 *
 * `ProgressBar` trên `/lessons/:id` là bề mặt DUY NHẤT mang `--p` + transition,
 * nên hai ô chuyển động buộc phải đo ở đó. Nó cũng là bề mặt luôn có mặt: một
 * bài học bất kỳ đều render `role="progressbar"`, không cần phiên sandbox,
 * không cần bộ lọc rỗng, không cần mạng bị bóp.
 */

import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen, resolvePath } from './fixtures/nav';
import { SCREENS, type Screen } from './routes';

const LESSON: Screen = SCREENS.find((s) => s.path === '/lessons/:id') ?? {
  path: '/lessons/:id',
  auth: 'user',
  idFrom: 'lessons.list',
};

/**
 * §8.1 — tâm khe hở, trong toạ độ `viewBox` 100×100.
 *
 * Chép từ khối chú thích đầu `packages/motion/src/motif.ts`: khe hở nằm ở nêm
 * `60°..120°`, tâm ở `θ = 90°`, và điểm đó rơi vào `(61.24, 22.18)` — bên PHẢI
 * tâm hình và BÊN TRÊN. Đổi dấu `--arc-tilt` thì nó sang trái, tức trái §8.1.
 *
 * ⛔ Cố ý là HẰNG CHÉP TAY, không import từ `packages/motion`. `e2e/` có
 * tsconfig riêng và không import mã sản phẩm; quan trọng hơn, một spec đọc
 * chính hàm mà nó đang gác thì gác được đúng số 0 — `arcPointAt(90)` sai dấu
 * vẫn "khớp" với chính nó.
 */
const GAP_CENTER = { x: 61.24, y: 22.18 };

/**
 * Điểm đối xứng qua tâm (`θ = 270°`) — **đối chứng âm của ô hình học**.
 *
 * Nếu chỉ khẳng định "không có nét vẽ nào gần `GAP_CENTER`", ô sẽ XANH cả khi
 * `<path>` rỗng, khi `d` không phân giải được, hay khi cung bị thu về một
 * chấm. Điểm này PHẢI có nét đi qua, và hai vế cùng chạy trên một phần tử mới
 * chốt được rằng cung có thật VÀ khe hở nằm đúng chỗ.
 */
const ARC_OPPOSITE = { x: 38.76, y: 77.81 };

/**
 * Khoảng cách tối thiểu từ `GAP_CENTER` tới nét vẽ gần nhất, để gọi là "có khe
 * hở ở đó".
 *
 * Số học: hai đầu cung nằm ở `(40.26, 18.04)` và `(79.20, 33.78)`, cả hai cách
 * `GAP_CENTER` đúng **21.4** đơn vị viewBox. Ngưỡng 15 để lại biên ~30% cho
 * sai số lấy mẫu và làm tròn của `getPointAtLength`, mà vẫn đỏ dứt khoát nếu
 * khe hở thu lại còn một nửa.
 */
const GAP_CLEARANCE_MIN = 15;

/** Nét vẽ phải đi SÁT `ARC_OPPOSITE` — sai số lấy mẫu ở 720 điểm là dưới 0.3. */
const ON_STROKE_MAX = 0.5;

/** Số điểm lấy mẫu dọc cung. 720 ⇒ mỗi mẫu cách nhau dưới nửa độ. */
const ARC_SAMPLES = 720;

/** `--motion-slow` của hệ. Cung chạy trong khoảng này khi KHÔNG bật reduced-motion. */
const MOTION_SLOW_MS = 320;

/** Nhịp lấy mẫu chuyển động, xấp xỉ một khung hình 60fps. */
const SAMPLE_INTERVAL_MS = 16;

/** Tổng thời gian lấy mẫu — dài hơn `--motion-slow` để bắt được cả nhịp cuối. */
const SAMPLE_WINDOW_MS = 400;

/**
 * Số giá trị TRUNG GIAN tối thiểu để gọi là "chạy" thay vì "nhảy".
 *
 * Một transition 320ms lấy mẫu mỗi 16ms cho tới ~20 mẫu trung gian trên lý
 * thuyết. Đòi 4 là biên rộng có chủ ý: cụm/máy dựng có thể bỏ khung, và một ô
 * đối chứng chập chờn sẽ bị nới cho tới khi hết kêu được. Nhưng 4 vẫn phân biệt
 * dứt khoát với NHẢY, vốn cho đúng **0** giá trị trung gian.
 */
const MIN_INTERMEDIATE_SAMPLES = 4;

/** Hai `<path>` của `ProgressBar`: [0] là rãnh, [1] là cung tiến độ mang `--p`. */
function progressArc(page: Page): Locator {
  return page.locator('[role="progressbar"] svg path').nth(1);
}

function progressTrack(page: Page): Locator {
  return page.locator('[role="progressbar"] svg path').nth(0);
}

async function attach(
  testInfo: TestInfo,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await testInfo.attach(name, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(payload, null, 2)),
  });
}

async function openLesson(page: Page, api: Parameters<typeof resolvePath>[0]): Promise<void> {
  const path = await resolvePath(api, LESSON);
  await openScreen(page, path, LESSON.auth);
  await expect(
    page.locator('[role="progressbar"]'),
    'Trang bài học không render `role="progressbar"`. Mọi ô dưới đây đo trên cung ' +
      'của nó, nên đây là "không đo được", không phải "đo xong và đạt".',
  ).toHaveCount(1);
}

// ═══════════════════════════════════ tiền đề: hợp đồng §8.3 đúng là thứ được GỬI ĐI

test('tiền đề — cung tiến độ mang đúng dạng `calc(1 - var(--p))` của hợp đồng §8.3', async ({
  api,
  page,
}) => {
  await openLesson(page, api);

  // Đọc style ĐÃ KHAI (`element.style`), không phải computed: computed đã tính
  // xong `calc()` và không còn nói được rằng dạng gửi đi là `calc()`. Hợp đồng
  // §8.3 quy định chính DẠNG đó, và mọi kết luận của hai ô chuyển động bên dưới
  // chỉ có nghĩa nếu dạng ấy là thứ trình duyệt thật sự nhận.
  const declared = await progressArc(page).evaluate((el) => ({
    p: (el as SVGElement).style.getPropertyValue('--p').trim(),
    dashOffset: (el as SVGElement).style.getPropertyValue('stroke-dashoffset').trim(),
    transition: (el as SVGElement).style.getPropertyValue('transition').trim(),
  }));

  expect(
    declared.dashOffset,
    'Cung không còn khai `stroke-dashoffset: calc(1 - var(--p))`. Nếu ai đó đã đổi ' +
      'sang `dashOffsetAt(p)` (đường lùi ở §4.2) thì ô "chạy hay nhảy" bên dưới ' +
      'không còn đo câu hỏi mà §16.I mục 5 đặt ra — nó sẽ xanh một cách tất yếu. ' +
      'Đổi đường lùi là một quyết định phải ghi vào report, không phải một chi tiết.',
  ).toBe('calc(1 - var(--p))');

  expect(declared.p, '`--p` phải có mặt ngay trong HTML server render').not.toBe('');
  expect(Number(declared.p)).toBeGreaterThanOrEqual(0);
  expect(Number(declared.p)).toBeLessThanOrEqual(1);
  expect(declared.transition, 'thiếu transition thì cung KHÔNG THỂ chạy').toContain(
    'stroke-dashoffset',
  );
});

// ══════════════════════════════════════════ §8.1 — khe hở nằm ĐÚNG PHÍA (trên-phải)

test('§8.1 — tâm khe hở ở (61.24, 22.18), và nét vẽ có mặt ở phía đối diện', async ({
  api,
  page,
}, testInfo) => {
  await openLesson(page, api);

  /*
    Đo bằng CHÍNH bộ máy hình học của trình duyệt (`getPointAtLength` trên
    `SVGGeometryElement`), không bằng cách phân tích chuỗi `d`.

    Đó là điểm mấu chốt của ô này: cái sai mà §8.1 sợ nhất — dấu của
    `x-axis-rotation` trong lệnh `A` — nằm ở chỗ SVG đo góc THEO kim đồng hồ
    còn `--arc-tilt` khai theo quy ước toán học. Một bộ phân tích chuỗi tự viết
    sẽ tái tạo đúng cách hiểu của người viết nó, tức đồng ý với cái sai. Chỉ
    trình duyệt mới là trọng tài.
  */
  const geometry = await progressTrack(page).evaluate(
    (el, params) => {
      const path = el as unknown as SVGGeometryElement;
      const total = path.getTotalLength();
      const { samples, gap, opposite } = params;

      let minToGap = Number.POSITIVE_INFINITY;
      let minToOpposite = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= samples; i += 1) {
        const pt = path.getPointAtLength((total * i) / samples);
        const dg = Math.hypot(pt.x - gap.x, pt.y - gap.y);
        const dop = Math.hypot(pt.x - opposite.x, pt.y - opposite.y);
        if (dg < minToGap) minToGap = dg;
        if (dop < minToOpposite) minToOpposite = dop;
      }

      const start = path.getPointAtLength(0);
      const end = path.getPointAtLength(total);
      const svg = path.ownerSVGElement;
      return {
        totalLength: total,
        minToGap,
        minToOpposite,
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        viewBox: svg === null ? '' : svg.getAttribute('viewBox'),
        pathTransform: getComputedStyle(path).transform,
        svgTransform: svg === null ? 'none' : getComputedStyle(svg).transform,
      };
    },
    { samples: ARC_SAMPLES, gap: GAP_CENTER, opposite: ARC_OPPOSITE },
  );

  await attach(testInfo, 'motif-arc-geometry.json', {
    ...geometry,
    gapCenter: GAP_CENTER,
    arcOpposite: ARC_OPPOSITE,
    gapClearanceMin: GAP_CLEARANCE_MIN,
    onStrokeMax: ON_STROKE_MAX,
  });

  expect(geometry.viewBox, 'hình học chỉ có nghĩa trong viewBox 100×100').toBe('0 0 100 100');

  // Vế ĐỐI CHỨNG chạy TRƯỚC: nếu không có nét vẽ nào, vế "khe hở" bên dưới xanh
  // một cách vô nghĩa.
  expect(
    geometry.minToOpposite,
    `Không có nét vẽ nào đi qua (${String(ARC_OPPOSITE.x)}, ${String(ARC_OPPOSITE.y)}) — ` +
      `điểm đối xứng của tâm khe hở, tức chỗ cung CHẮC CHẮN phải có nét. Gần nhất ` +
      `cách ${geometry.minToOpposite.toFixed(2)} đơn vị. Cung không được vẽ ra, hoặc ` +
      `nó đã bị xoay/thu nhỏ — và nếu vậy thì vế "khe hở đúng phía" dưới đây không ` +
      `nói lên điều gì.`,
  ).toBeLessThanOrEqual(ON_STROKE_MAX);

  expect(
    geometry.minToGap,
    `Có nét vẽ cách tâm khe hở chỉ ${geometry.minToGap.toFixed(2)} đơn vị ` +
      `(cần ≥ ${String(GAP_CLEARANCE_MIN)}). Khe hở KHÔNG nằm ở trên-phải như §8.1 ` +
      `quy định. Nguyên nhân thường gặp, theo đúng thứ tự đáng nghi: dấu của ` +
      `\`x-axis-rotation\` trong lệnh \`A\` bị đổi (khe hở lật sang trái), một class ` +
      `\`rotate-*\` phủ lên phần tử cung, hoặc \`--arc-start\`/\`--arc-sweep\` bị sửa. ` +
      `Hai đầu cung đo được: (${geometry.start.x.toFixed(2)}, ${geometry.start.y.toFixed(2)}) ` +
      `và (${geometry.end.x.toFixed(2)}, ${geometry.end.y.toFixed(2)}); đúng phải là ` +
      `(40.26, 18.04) và (79.20, 33.78).`,
  ).toBeGreaterThanOrEqual(GAP_CLEARANCE_MIN);

  /*
    `motif.ts` ghi rõ vì sao KHÔNG có `transform` trên phần tử cung: nghiêng
    được nướng thẳng vào toạ độ của `d`, nên một `transform` đứng ngoài là thứ
    bất kỳ ai cũng ghi đè được bằng một tiện ích Tailwind — và khi đó hình học
    không còn là thứ gói kia bảo đảm.

    Ô trên đã đo hình học SAU khi trình duyệt áp mọi thứ, nên nó bắt được một
    `rotate-*` thật. Ô này bắt sớm hơn một bậc: nó nói ra NGUYÊN NHÂN thay vì
    triệu chứng, và nó gác cả những bề mặt không có mặt trên trang này.
  */
  expect(
    geometry.pathTransform,
    `Phần tử cung mang transform \`${geometry.pathTransform}\`. Hình học của motif ` +
      `nằm trong \`d\`; một transform bên ngoài làm nó hỏng IM LẶNG — cung vẫn vẽ, ` +
      `chỉ là khe hở nằm sai chỗ.`,
  ).toBe('none');
  expect(geometry.svgTransform).toBe('none');
});

// ══════════════════════════════ AC-7 — reduced-motion ép transition về 0.01ms

test('AC-7 — `prefers-reduced-motion: reduce` ép `transition-duration` của cung về 0.01ms', async ({
  api,
  page,
}, testInfo) => {
  // ── vế ĐỐI CHỨNG: KHÔNG bật cờ thì cung PHẢI có transition thật ───────────
  //
  // Không có vế này, "0.0001s" ở dưới không phân biệt được "cổng reduced-motion
  // đang chạy" với "phần tử này chưa bao giờ có transition". Cả hai cho cùng
  // một chuỗi, và cách đọc sai lại là cách đọc dễ chịu hơn.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openLesson(page, api);
  const normalMs = await progressArc(page).evaluate(
    (el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000,
  );

  // ── vế THẬT ──────────────────────────────────────────────────────────────
  //
  // Tải lại sau khi đổi media: khối `@media` được phân giải trong cascade lúc
  // dựng style, và ta muốn đo trạng thái mà một người dùng bật cờ SẴN sẽ gặp,
  // không phải trạng thái sau một lượt cascade lại giữa chừng.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, api);
  const reducedMs = await progressArc(page).evaluate(
    (el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000,
  );

  await attach(testInfo, 'motif-reduced-motion.json', {
    normalTransitionMs: normalMs,
    reducedTransitionMs: reducedMs,
    expectedReducedMs: 0.01,
    motionSlowMs: MOTION_SLOW_MS,
  });

  expect(
    normalMs,
    `KHÔNG bật reduced-motion mà \`transition-duration\` của cung đã là ${String(normalMs)}ms. ` +
      `Cung không có transition nào để mà tắt — nên vế dưới sẽ xanh vì một lý do ` +
      `hoàn toàn khác thứ AC-7 định gác.`,
  ).toBeGreaterThan(MOTION_SLOW_MS / 2);

  expect(
    reducedMs,
    `Bật \`prefers-reduced-motion: reduce\` mà \`transition-duration\` của cung vẫn là ` +
      `${String(reducedMs)}ms (bình thường ${String(normalMs)}ms). Khối \`@media\` trong ` +
      `\`globals.css\` KHÔNG phủ được phần tử này. Nghi phạm số một: có ai đó thêm ` +
      `\`!important\` vào khai báo transition inline — \`motif.ts\` cảnh báo đúng điều ` +
      `này, vì \`!important\` của tác giả ở một khai báo inline thắng bộ chọn phổ ` +
      `quát của khối \`@media\`. Đây là lớp lỗi hỏng IM LẶNG: trang TRÔNG NHƯ đã ` +
      `tuân thủ.`,
  ).toBeLessThan(1);
});

// ═════════════════════════ §8.3 — cung CHẠY hay NHẢY khi `--p` đổi

test('§8.3 — đổi `--p` thì `stroke-dashoffset` CHẠY qua các giá trị trung gian', async ({
  api,
  page,
}, testInfo) => {
  // Phải tắt reduced-motion tường minh. Nếu môi trường chạy suite đang bật cờ
  // đó (một số CI runner có), transition bị ép về 0.01ms và ô này sẽ báo "NHẢY"
  // — một kết luận sai về sản phẩm, sinh ra bởi cấu hình máy chạy.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openLesson(page, api);

  /*
    Đổi `--p` bằng `style.setProperty` trên CHÍNH phần tử cung.

    Đó đúng là thứ một lượt render React làm: `arcProgressProps` phát ra `--p`
    trong object `style`, và React ghi nó bằng cùng API này. Nên phép đo dưới
    đây đo đúng đường đi thật, không phải một đường tắt của harness.

    Câu hỏi mà §8.3 để ngỏ, nguyên văn: `--p` là custom property CHƯA đăng ký
    qua `@property`, nên bản thân nó nội suy kiểu `discrete`. Nhưng
    `stroke-dashoffset` — thứ MANG transition — là một thuộc tính nội suy được.
    Khi `--p` nhảy rời rạc, giá trị `calc()` tính lại tức thì; câu hỏi là trình
    duyệt có transition GIỮA hai giá trị đã tính đó không.
  */
  const samples = await progressArc(page).evaluate(
    async (el, params) => {
      const node = el as SVGElement;
      const { intervalMs, windowMs } = params;
      const read = (): number => parseFloat(getComputedStyle(node).strokeDashoffset);

      // Đặt về một mốc xa rồi để cascade ổn định, để bước nhảy sau đó đủ lớn.
      node.style.setProperty('--p', '0.05');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 400));

      const before = read();
      node.style.setProperty('--p', '0.95');

      const series: number[] = [];
      const started = performance.now();
      while (performance.now() - started < windowMs) {
        series.push(read());
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return { before, series, after: read() };
    },
    { intervalMs: SAMPLE_INTERVAL_MS, windowMs: SAMPLE_WINDOW_MS },
  );

  const lo = Math.min(samples.before, samples.after);
  const hi = Math.max(samples.before, samples.after);
  // "Trung gian" = nằm HẲN giữa hai đầu, với biên 1% để một mẫu trùng đúng mốc
  // đầu/cuối không bị đếm nhầm thành chuyển động.
  const margin = (hi - lo) * 0.01;
  const intermediate = [
    ...new Set(samples.series.filter((v) => v > lo + margin && v < hi - margin)),
  ];

  await attach(testInfo, 'motif-arc-motion.json', {
    before: samples.before,
    after: samples.after,
    sampleCount: samples.series.length,
    intervalMs: SAMPLE_INTERVAL_MS,
    windowMs: SAMPLE_WINDOW_MS,
    distinctIntermediate: intermediate.length,
    intermediateValues: intermediate.slice(0, 30),
    series: samples.series,
    verdict: intermediate.length >= MIN_INTERMEDIATE_SAMPLES ? 'CHẠY' : 'NHẢY',
  });

  // Tiền đề: `--p` có tác dụng gì đó. Nếu `before === after` thì phép đo không
  // nói gì về chạy-hay-nhảy — nó chỉ nói `calc()` không phản ứng với `--p`, và
  // đó là một hỏng hóc khác, nặng hơn.
  expect(
    hi - lo,
    `Đổi \`--p\` từ 0.05 sang 0.95 mà \`stroke-dashoffset\` không đổi ` +
      `(${String(samples.before)} → ${String(samples.after)}). \`calc(1 - var(--p))\` ` +
      `không phản ứng với custom property — cung sẽ đứng yên ở MỌI tiến độ, và đó ` +
      `là lỗi nặng hơn "nhảy".`,
  ).toBeGreaterThan(0.5);

  expect(
    intermediate.length,
    `Cung NHẢY chứ không chạy: chỉ ${String(intermediate.length)} giá trị trung gian ` +
      `trong ${String(samples.series.length)} mẫu suốt ${String(SAMPLE_WINDOW_MS)}ms ` +
      `(cần ≥ ${String(MIN_INTERMEDIATE_SAMPLES)}). Nghĩa là trình duyệt KHÔNG nội ` +
      `suy giữa hai giá trị \`calc()\` khi \`--p\` — một custom property chưa đăng ký ` +
      `— nhảy rời rạc.\n` +
      `⚠ ĐỌC KỸ TRƯỚC KHI SỬA: đường lùi ĐÃ SẴN (\`dashOffsetAt(p)\` trả số thô, đặt ` +
      `thẳng vào \`strokeDashoffset\`), nhưng hợp đồng §8.3 ghi dạng \`calc()\` là BẮT ` +
      `BUỘC. Ô đỏ này là một phát hiện phải ghi vào report và đưa lên chủ hợp đồng, ` +
      `KHÔNG phải một lời mời đổi mã sản phẩm ngay tại chỗ.`,
  ).toBeGreaterThanOrEqual(MIN_INTERMEDIATE_SAMPLES);
});
