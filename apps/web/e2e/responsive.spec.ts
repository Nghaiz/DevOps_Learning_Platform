/**
 * 13.B mục 8 / ô AC 13 — **responsive ≤768px**.
 *
 * Hợp đồng có BA con số khác nhau (`components/shell/breakpoints.ts`), và spec
 * này đo cả ba chứ không gộp:
 *
 * | hằng | ý nghĩa | đo ở đây |
 * |---|---|---|
 * | `NAV_COLLAPSE_MAX_PX` = 768 | ≤ đây thì nav ngang thu vào ngăn kéo | 375 · 768 · 769 |
 * | `TERMINAL_MIN_WIDTH_PX` = 1024 | < đây thì KHÔNG mở terminal | 1023 · 1024 |
 * | `DESKTOP_TARGET_MIN_PX` = 1280 | mục tiêu chính, bố cục đầy đủ | 1280 (đối chứng âm) |
 *
 * ══ Vì sao mỗi ô đều có ĐỐI CHỨNG ÂM ═════════════════════════════════════════
 *
 * "Ở 768px có cảnh báo màn-hình-hẹp" một mình KHÔNG chứng minh gì: nếu cảnh báo
 * hiện ở MỌI bề rộng thì ô vẫn xanh, và cái ta thật sự dựng lại là một trang
 * không bao giờ có terminal. Nên mỗi khẳng định-hẹp đi kèm một khẳng định-rộng
 * ở cùng route, cùng lượt chạy (`zero-violation-needs-negative-control`).
 *
 * ══ Vì sao đo ĐÚNG ở 768/769 và 1023/1024 ════════════════════════════════════
 *
 * `breakpoints.ts` ghi rõ vì sao không dùng `md:` (= `min-width:768px`, tức ở
 * đúng 768 nav vẫn mở — lệch một pixel so với câu "≤768px thu vào"). Một cặp đo
 * 375 và 1280 sẽ xanh cả với `md:`, tức không gác được chính điều mà chú thích
 * kia dựng ra để tránh. Biên là chỗ duy nhất phân biệt được hai cách cài đặt.
 *
 * ══ Cái spec này KHÔNG kiểm ══════════════════════════════════════════════════
 *
 * "Đọc nội dung được" ở đây chỉ là hai thứ đo được bằng máy: không tràn ngang,
 * và có đủ chữ. Chữ có bị đè, ảnh có vỡ, thao tác có với tới được bằng ngón tay
 * — không. Đó vẫn là mắt người.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen, resolvePath } from './fixtures/nav';
import { SCREENS, type Screen } from './routes';

const NAV_COLLAPSE_MAX_PX = 768;
const TERMINAL_MIN_WIDTH_PX = 1024;
const DESKTOP_TARGET_MIN_PX = 1280;

/**
 * ⛔ Ba hằng trên là BẢN CHÉP của `src/components/shell/breakpoints.ts`, chép
 * có chủ ý: `e2e/` có tsconfig riêng và không import mã `src/`, còn một spec
 * đọc chính hằng mà nó đang gác thì gác được đúng số 0.
 *
 * Nhưng bản chép sẽ mục nếu nguồn đổi mà không ai đổi ở đây, nên ô dưới neo
 * chúng bằng GIÁ TRỊ. Đổi hằng ở `breakpoints.ts` ⇒ ô này đỏ ⇒ phải đọc lại
 * spec này và quyết định cả hai đầu, thay vì để harness lặng lẽ đo một hợp
 * đồng cũ.
 */
test('ba điểm ngắt vẫn đúng giá trị mà spec này giả định', () => {
  expect(NAV_COLLAPSE_MAX_PX).toBe(768);
  expect(TERMINAL_MIN_WIDTH_PX).toBe(1024);
  expect(DESKTOP_TARGET_MIN_PX).toBe(1280);
  expect(NAV_COLLAPSE_MAX_PX).toBeLessThan(TERMINAL_MIN_WIDTH_PX);
});

const CATALOG: Screen = { path: '/lessons', auth: 'user' };
const LESSON: Screen = SCREENS.find((s) => s.path === '/lessons/:id') ?? {
  path: '/lessons/:id',
  auth: 'user',
  idFrom: 'lessons.list',
};

/** Thanh nav ngang đầy đủ (chỉ có khi rộng). */
const desktopNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });

/** Nút mở ngăn kéo (chỉ có khi hẹp). */
const drawerTrigger = (page: Page) =>
  page.getByRole('button', { name: 'Mở điều hướng' });

/** Tiêu đề của `NarrowScreenNotice` — thứ thay chỗ terminal khi hẹp. */
const narrowNotice = (page: Page) =>
  page.getByText(`Cần màn hình rộng hơn (≥${String(TERMINAL_MIN_WIDTH_PX)}px) để mở terminal`);

/** Bề mặt terminal thật (xterm dựng một `role="application"` có nhãn). */
const terminalSurface = (page: Page) =>
  page.getByRole('application', { name: /Terminal sandbox/ });

/**
 * Trang có tràn ngang không.
 *
 * So `documentElement.scrollWidth` với `innerWidth` — không so `body`, vì một
 * phần tử `position: fixed` rộng quá khổ vẫn đẩy `documentElement` mà không
 * đụng `body`. Dung sai 1px cho làm tròn thiết bị.
 */
async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

async function visibleTextLength(page: Page): Promise<number> {
  return page.evaluate(() => document.body.innerText.trim().length);
}

// ───────────────────────────────────────────────── nav: thu gọn ở ≤768, mở ở ≥769

for (const width of [375, NAV_COLLAPSE_MAX_PX]) {
  test(`${String(width)}px — nav thu vào ngăn kéo, không tràn ngang @responsive`, async ({
    api,
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const path = await resolvePath(api, CATALOG);
    await openScreen(page, path, CATALOG.auth);

    await expect(
      drawerTrigger(page),
      `Ở ${String(width)}px phải có nút mở ngăn kéo — hợp đồng C6 nói ≤768px nav ` +
        `thu gọn. Không thấy nút nghĩa là điểm ngắt sai hoặc vỏ chưa dựng ngăn kéo.`,
    ).toBeVisible();

    await expect(
      desktopNav(page),
      `Ở ${String(width)}px thanh nav ngang phải ẨN. Nó còn hiện nghĩa là hai bộ ` +
        `điều hướng cùng tồn tại — người dùng bàn phím Tab qua cả hai.`,
    ).toBeHidden();

    const overflow = await horizontalOverflowPx(page);
    expect(
      overflow,
      `Trang tràn ngang ${String(overflow)}px ở khung ${String(width)}px. ` +
        `"Hạ cấp có chủ ý" của 13.B mục 8 là đọc được, không phải cuộn ngang.`,
    ).toBeLessThanOrEqual(1);

    // Ngăn kéo phải MỞ ĐƯỢC — một nút hiện ra mà không mở được thì nav ở khung
    // hẹp là số 0, và ô trên vẫn xanh.
    await drawerTrigger(page).click();
    await expect(page.getByRole('dialog', { name: 'Điều hướng' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Điều hướng chính (thu gọn)' }).getByRole('link').first(),
    ).toBeVisible();
  });
}

test(`${String(NAV_COLLAPSE_MAX_PX + 1)}px — ĐỐI CHỨNG ÂM: nav ngang trở lại @responsive`, async ({
  api,
  page,
}) => {
  // Ô này là thứ phân biệt `min-[769px]:` với `md:`. Với `md:` (min-width:768)
  // thì ô 768px ở trên đã đỏ; với một cài đặt chặn quá tay (min-width:1024) thì
  // chính ô NÀY đỏ. Cần cả hai phía mới chốt được đúng một pixel.
  await page.setViewportSize({ width: NAV_COLLAPSE_MAX_PX + 1, height: 800 });
  const path = await resolvePath(api, CATALOG);
  await openScreen(page, path, CATALOG.auth);

  await expect(desktopNav(page)).toBeVisible();
  await expect(drawerTrigger(page)).toBeHidden();
});

// ──────────────────────────────────── terminal: cảnh báo dưới 1024, terminal trên

test(`${String(TERMINAL_MIN_WIDTH_PX - 1)}px — trang bài học thay terminal bằng cảnh báo @responsive`, async ({
  api,
  page,
}) => {
  await page.setViewportSize({ width: TERMINAL_MIN_WIDTH_PX - 1, height: 800 });
  const path = await resolvePath(api, LESSON);
  await openScreen(page, path, LESSON.auth);

  await expect(
    narrowNotice(page),
    `Dưới ${String(TERMINAL_MIN_WIDTH_PX)}px phải hiện cảnh báo thay cho terminal ` +
      `(13.B mục 8). Không thấy nó nghĩa là \`NarrowScreenNotice\` lại không có ` +
      `call-site — đúng tình trạng đo được ngày 2026-09-07, khi component có thật ` +
      `và test của nó xanh nhưng chưa ai từng nhìn thấy nó.`,
  ).toBeVisible();

  // Nội dung bài vẫn phải đọc được — đó là nửa còn lại của câu "hạ cấp có chủ ý".
  const textLength = await visibleTextLength(page);
  expect(
    textLength,
    `Trang bài học chỉ còn ${String(textLength)} ký tự ở khung hẹp — cảnh báo đã ` +
      `thay terminal nhưng nội dung cũng biến mất.`,
  ).toBeGreaterThan(200);

  const overflow = await horizontalOverflowPx(page);
  expect(overflow, `Trang bài học tràn ngang ${String(overflow)}px`).toBeLessThanOrEqual(1);
});

test(`${String(TERMINAL_MIN_WIDTH_PX)}px — ĐỐI CHỨNG ÂM: đúng ngưỡng thì KHÔNG còn cảnh báo @responsive`, async ({
  api,
  page,
}) => {
  // Không có ô này thì ô trên xanh kể cả với một cài đặt hiện cảnh báo ở MỌI
  // bề rộng — tức một sản phẩm không bao giờ mở được terminal.
  await page.setViewportSize({ width: TERMINAL_MIN_WIDTH_PX, height: 800 });
  const path = await resolvePath(api, LESSON);
  await openScreen(page, path, LESSON.auth);

  await expect(
    narrowNotice(page),
    `Ở đúng ${String(TERMINAL_MIN_WIDTH_PX)}px (ngưỡng là ">=") cảnh báo phải BIẾN ` +
      `MẤT. Nó còn đó nghĩa là phép so dùng ">" thay vì ">=" — lệch đúng một pixel.`,
  ).toBeHidden();
});

test(`${String(DESKTOP_TARGET_MIN_PX)}px — bố cục đầy đủ: nav ngang + khoang terminal @responsive`, async ({
  api,
  page,
}) => {
  await page.setViewportSize({ width: DESKTOP_TARGET_MIN_PX, height: 900 });
  const path = await resolvePath(api, LESSON);
  await openScreen(page, path, LESSON.auth);

  await expect(desktopNav(page)).toBeVisible();
  await expect(narrowNotice(page)).toBeHidden();

  // Chưa bấm Bắt đầu ⇒ chưa có phiên ⇒ chưa có bề mặt xterm. Thứ PHẢI có là
  // khoang terminal với lời mời bắt đầu — đó là bằng chứng nhánh rộng đang
  // dựng khoang, chứ không phải một cảnh báo khác.
  await expect(page.getByText(/để dựng sandbox và mở terminal/)).toBeVisible();
  await expect(terminalSurface(page)).toHaveCount(0);
});
