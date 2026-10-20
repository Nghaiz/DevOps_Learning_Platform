import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen, resolvePath } from './fixtures/nav';
import { MIN_SCREENS, SCREENS, roleSatisfies, type Screen } from './routes';

/**
 * Bố cục đáp ứng của bản dựng lại PTIT.
 *
 * Hai hợp đồng, đo riêng:
 *
 * 1. **Header** (vỏ ứng dụng): dưới 1024px (Tailwind `lg`) điều hướng thu vào
 *    nút "Mở điều hướng"; từ 1024px nav ngang hiện trong header.
 * 2. **Màn thực hành** (`/lessons/:id`, immersive, không header): KHÔNG còn ngõ
 *    cụt "cần màn hình rộng hơn". Bản trước gỡ cả terminal lẫn IDE khi cửa sổ
 *    qua ngưỡng 1024px (đóng WebSocket); nay hai khoang luôn mount, màn hẹp chỉ
 *    xếp chồng chúng bằng CSS (`WorkspaceSplit`, `data-split-shape`).
 *
 * Và một lượt quét 390px không tràn ngang cho MỌI màn trong `SCREENS`.
 */

const NAV_COLLAPSE_BELOW_PX = 1024;
const DESKTOP_TARGET_MIN_PX = 1280;

const CATALOG: Screen = { path: '/lessons', auth: 'user' };
const LESSON: Screen = SCREENS.find((s) => s.path === '/lessons/:id') ?? {
  path: '/lessons/:id',
  auth: 'user',
  idFrom: 'lessons.list',
};

const desktopNav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
const drawerTrigger = (page: Page) => page.getByRole('button', { name: 'Mở điều hướng' });
/** Câu ngõ cụt của bản cũ. Nó KHÔNG được quay lại ở bất kỳ bề rộng nào. */
const deadEndNotice = (page: Page) => page.getByText(/Cần màn hình rộng hơn/);
const stepRoute = (page: Page) => page.getByRole('list', { name: 'Các bước của bài' });
const splitShape = (page: Page) => page.locator('[data-split-shape]');
const terminalSurface = (page: Page) => page.getByRole('application', { name: /Terminal sandbox/ });

async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function visibleTextLength(page: Page): Promise<number> {
  return page.evaluate(() => document.body.innerText.trim().length);
}

// ── Header: thu gọn dưới 1024px ─────────────────────────────────────────────

for (const width of [375, 768, NAV_COLLAPSE_BELOW_PX - 1]) {
  test(`${String(width)}px — nav thu vào ngăn kéo, không tràn ngang @responsive`, async ({ api, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openScreen(page, await resolvePath(api, CATALOG), CATALOG.auth);

    await expect(drawerTrigger(page), `Ở ${String(width)}px phải có nút mở ngăn kéo.`).toBeVisible();
    await expect(
      desktopNav(page),
      `Ở ${String(width)}px thanh nav ngang phải ẨN, nếu không hai bộ điều hướng cùng nằm trong vòng Tab.`,
    ).toBeHidden();
    expect(await horizontalOverflowPx(page), `tràn ngang ở ${String(width)}px`).toBeLessThanOrEqual(1);

    await drawerTrigger(page).click();
    await expect(page.getByRole('dialog', { name: 'Điều hướng' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Điều hướng chính (thu gọn)' }).getByRole('link').first(),
    ).toBeVisible();
  });
}

test(`${String(NAV_COLLAPSE_BELOW_PX)}px — ĐỐI CHỨNG ÂM: nav ngang trở lại @responsive`, async ({ api, page }) => {
  await page.setViewportSize({ width: NAV_COLLAPSE_BELOW_PX, height: 800 });
  await openScreen(page, await resolvePath(api, CATALOG), CATALOG.auth);

  await expect(desktopNav(page)).toBeVisible();
  await expect(drawerTrigger(page)).toBeHidden();
});

// ── Màn thực hành: không ngõ cụt, chỉ đổi hình dạng ─────────────────────────

for (const width of [390, 768, NAV_COLLAPSE_BELOW_PX - 1]) {
  test(`${String(width)}px — bài học xếp chồng nội dung trên khoang làm việc, không ngõ cụt @responsive`, async ({
    api,
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openScreen(page, await resolvePath(api, LESSON), LESSON.auth);

    await expect(
      deadEndNotice(page),
      'Câu "cần màn hình rộng hơn" đã quay lại. Màn hẹp phải xếp chồng hai khoang, không thay khoang làm việc bằng một lời từ chối.',
    ).toHaveCount(0);
    await expect(stepRoute(page), 'Tuyến các bước của bài phải đọc được ở màn hẹp.').toBeVisible();
    await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
    await expect(
      splitShape(page),
      'Khung chứa dưới ~900px phải XẾP CHỒNG. "side-by-side" ở đây nghĩa là hai khoang bị bóp còn nửa màn mỗi bên.',
    ).toHaveAttribute('data-split-shape', 'stacked');
    // Khoang làm việc có mặt (thanh khoang tối mang nhãn Terminal), không bị gỡ ở màn hẹp.
    await expect(page.getByText('Terminal', { exact: true }).first()).toBeVisible();

    expect(await visibleTextLength(page), 'nội dung bài biến mất ở khung hẹp').toBeGreaterThan(200);
    expect(await horizontalOverflowPx(page), `bài học tràn ngang ở ${String(width)}px`).toBeLessThanOrEqual(1);
  });
}

test(`${String(DESKTOP_TARGET_MIN_PX)}px — bài học immersive, hai khoang cạnh nhau @responsive`, async ({ api, page }) => {
  await page.setViewportSize({ width: DESKTOP_TARGET_MIN_PX, height: 900 });
  await openScreen(page, await resolvePath(api, LESSON), LESSON.auth);

  await expect(desktopNav(page), 'Route immersive không có header ứng dụng.').toBeHidden();
  await expect(deadEndNotice(page)).toHaveCount(0);
  await expect(splitShape(page)).toHaveAttribute('data-split-shape', 'side-by-side');
  // Khoang làm việc chưa mở máy nói đúng một câu và đặt nút Bắt đầu ngay dưới.
  await expect(page.getByRole('heading', { name: 'Máy của bạn chưa chạy', exact: true })).toBeVisible();
  // Chưa bấm Bắt đầu thì chưa có terminal nào: mọi khẳng định "terminal nối được" sau này mới có nghĩa.
  await expect(terminalSurface(page)).toHaveCount(0);
});

test(`${String(DESKTOP_TARGET_MIN_PX)}px — ĐỐI CHỨNG: route KHÔNG immersive vẫn có nav ngang @responsive`, async ({
  api,
  page,
}) => {
  await page.setViewportSize({ width: DESKTOP_TARGET_MIN_PX, height: 900 });
  await openScreen(page, await resolvePath(api, CATALOG), CATALOG.auth);
  await expect(desktopNav(page)).toBeVisible();
});

// ── 390px: không màn nào tràn ngang ─────────────────────────────────────────

const PHONE_WIDTH_PX = 390;
const OVERFLOW_TOLERANCE_PX = 1;

async function assertNoOverflowAt390(page: Page, path: string, auth: string): Promise<void> {
  await page.setViewportSize({ width: PHONE_WIDTH_PX, height: 844 });
  await openScreen(page, path, auth);

  const overflow = await horizontalOverflowPx(page);
  expect(
    overflow,
    `${path} tràn ngang ${String(overflow)}px ở khung ${String(PHONE_WIDTH_PX)}px. Thủ phạm thường gặp: một ` +
      '`min-w-*` cứng, một bảng không bọc `overflow-x`, hoặc một hàng flex không cho xuống dòng.',
  ).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
}

test.describe(`${String(PHONE_WIDTH_PX)}px — quét công khai @responsive`, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const screen of SCREENS.filter((s) => s.auth === 'anon')) {
    test(`không tràn ngang — ${screen.path}`, async ({ page }) => {
      await assertNoOverflowAt390(page, screen.path, screen.auth);
    });
  }
});

test.describe(`${String(PHONE_WIDTH_PX)}px — quét đã đăng nhập @responsive`, () => {
  for (const screen of SCREENS.filter((s) => s.auth === 'user')) {
    test(`không tràn ngang — ${screen.path}`, async ({ api, page }) => {
      await assertNoOverflowAt390(page, await resolvePath(api, screen), screen.auth);
    });
  }
});

test.describe(`${String(PHONE_WIDTH_PX)}px — quét theo vai trò @responsive`, () => {
  for (const screen of SCREENS.filter((s) => s.auth === 'author' || s.auth === 'admin')) {
    test(`không tràn ngang — ${screen.path}`, async ({ account, api, page }) => {
      test.skip(
        !roleSatisfies(account.role, screen.auth),
        `tài khoản ${account.email} có vai trò '${account.role}', cần '${screen.auth}'.`,
      );
      await assertNoOverflowAt390(page, await resolvePath(api, screen), screen.auth);
    });
  }
});

test('lượt quét 390px phủ đủ mọi màn của SCREENS', () => {
  const covered =
    SCREENS.filter((s) => s.auth === 'anon').length +
    SCREENS.filter((s) => s.auth === 'user').length +
    SCREENS.filter((s) => s.auth === 'author' || s.auth === 'admin').length;
  expect(covered, `Lượt quét 390px chỉ phủ ${String(covered)}/${String(SCREENS.length)} màn.`).toBe(SCREENS.length);
  expect(SCREENS.length).toBeGreaterThanOrEqual(MIN_SCREENS);
});
