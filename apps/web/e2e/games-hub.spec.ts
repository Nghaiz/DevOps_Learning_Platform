/**
 * `/games`: trang chọn game của đợt dựng lại PTIT (2026-10-03).
 *
 * Bốn lời hứa của trang, mỗi lời một ô:
 *  1. Ba game chơi được, mỗi game một dải, nhãn và số màn LẤY TỪ DỮ LIỆU (bản cũ
 *     dán chữ của K8s lên thẻ CI/CD và in "Từ cơ bản" trên mọi thẻ).
 *  2. Lọc theo chủ đề và ô tìm thật sự đổi thứ hiện ra, và "Bỏ lọc" trả lại hết.
 *  3. Liên kết dẫn đúng chỗ: "Chơi" vào thẳng màn đầu, "Xem các màn" về campaign.
 *  4. Không tràn ngang ở 390px, ở cả hai theme, và nút đổi theme còn chạy.
 *
 * Trang không gọi backend: game chạy trong trình duyệt, tiến độ ở `localStorage`.
 */
import { t } from '@devops-platform/copy';
import { GIT_LEVELS } from '@devops-platform/games';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen } from './fixtures/nav';

const PATH = '/games';

function playable(page: Page) {
  return page.getByRole('list', { name: t('games.hub.playable-label') });
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'trang /games tràn ngang').toBeLessThanOrEqual(1);
}

test.describe('/games, trang chọn game', () => {
  test('ba dải game với tên riêng và số màn của chính game đó', async ({ page }) => {
    await openScreen(page, PATH, 'anon');
    const list = playable(page);
    await expect(list.getByRole('listitem')).toHaveCount(3);

    for (const [id, name] of [
      ['k8s', t('games.k8s.name')],
      ['git', t('games.git.name')],
      ['cicd', t('games.cicd.name')],
    ] as const) {
      const band = list.locator(`[data-game="${id}"]`);
      await expect(band.getByRole('heading', { level: 2, name })).toBeVisible();
    }

    // Số màn khác nhau theo game: nếu trang lại dùng chung một câu cho cả ba,
    // ba dòng này sẽ trùng nhau.
    await expect(list.locator('[data-game="k8s"]')).toContainText(t('games.band.facts', { levels: 36, chapters: 6 }));
    await expect(list.locator('[data-game="git"]')).toContainText(t('games.band.facts', { levels: 32, chapters: 3 }));
    await expect(list.locator('[data-game="cicd"]')).toContainText(t('games.band.facts', { levels: 28, chapters: 2 }));

    // Hai game chưa chơi được nằm ở danh sách "đang dựng", không bấm được.
    const soon = page.getByRole('list', { name: t('games.soon.title') });
    await expect(soon.getByRole('listitem')).toHaveCount(2);
    await expect(soon.getByRole('link')).toHaveCount(0);
  });

  test('lọc chủ đề, ô tìm và Bỏ lọc', async ({ page }) => {
    await openScreen(page, PATH, 'anon');
    const list = playable(page);

    const gitChip = page.getByRole('button', { name: t('games.topic.git'), exact: true });
    await gitChip.click();
    await expect(gitChip).toHaveAttribute('aria-pressed', 'true');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.locator('[data-game="git"]')).toBeVisible();

    // "Mạng" chỉ có game đang dựng: không có dải nào, có câu nói ra điều đó.
    await page.getByRole('button', { name: t('games.topic.network'), exact: true }).click();
    await expect(playable(page)).toHaveCount(0);
    await expect(page.getByText(t('games.hub.none-playable', { topic: t('games.topic.network') }))).toBeVisible();

    await page.getByRole('button', { name: t('games.hub.filter.all'), exact: true }).click();
    const search = page.getByRole('searchbox', { name: t('games.hub.search.label') });
    await search.fill('zzzkhongcogamenao');
    await expect(page.getByText(t('games.hub.empty.title'))).toBeVisible();

    await page.getByRole('button', { name: t('games.hub.clear'), exact: true }).first().click();
    await expect(search).toHaveValue('');
    await expect(playable(page).getByRole('listitem')).toHaveCount(3);
  });

  test('liên kết: Chơi vào thẳng màn đầu, Xem các màn về campaign, Luyện đề sang Bài tập và Kỳ thi', async ({
    page,
  }) => {
    await openScreen(page, PATH, 'anon');
    const git = playable(page).locator('[data-game="git"]');
    await expect(git.getByRole('link', { name: new RegExp(`^${t('games.band.cta.play')}: `, 'u') })).toHaveAttribute(
      'href',
      /^\/games\/git\?level=/u,
    );
    await expect(git.getByRole('link', { name: t('games.band.cta.levels') })).toHaveAttribute('href', '/games/git');

    const cicd = playable(page).locator('[data-game="cicd"]');
    await expect(cicd.getByRole('link', { name: new RegExp(`^${t('games.band.cta.play')}: `, 'u') })).toHaveAttribute(
      'href',
      /^\/games\/cicd\/cicd-c01/u,
    );

    const practice = page.getByRole('list', { name: t('games.practice.title') });
    await expect(practice.getByRole('link', { name: new RegExp(t('games.practice.problems.title'), 'u') })).toHaveAttribute(
      'href',
      '/problems',
    );
    await expect(practice.getByRole('link', { name: new RegExp(t('games.practice.exams.title'), 'u') })).toHaveAttribute(
      'href',
      '/exams',
    );
  });

  /*
   * Xưởng soạn hiện theo vai trò của phiên (lấy từ server lúc render), nên ô này
   * đọc vai trò thật của tài khoản lượt chạy rồi khẳng định theo cả hai chiều.
   * Bản trước khẳng định "khách không thấy" trong khi trang mở bằng phiên của
   * tài khoản e2e: xanh với tài khoản thường, đỏ với admin của lượt nghiệm thu.
   */
  test('Xưởng soạn chỉ hiện cho tác giả và quản trị', async ({ page, account }) => {
    await openScreen(page, PATH, account.role);
    await expect(page.getByRole('list', { name: t('games.practice.title') })).toBeVisible();
    const studio = page.getByRole('list', { name: t('games.studio.title') });
    if (account.role !== 'author' && account.role !== 'admin') {
      await expect(studio).toHaveCount(0);
      return;
    }
    for (const [title, href] of [
      [t('games.studio.problem.title'), '/author/problems/new'],
      [t('games.studio.builder.title'), '/games/git?mode=builder'],
      [t('games.studio.lesson.title'), '/author/new'],
    ] as const) {
      await expect(studio.getByRole('link', { name: new RegExp(title, 'u') })).toHaveAttribute('href', href);
    }
  });

  test.describe('khách chưa đăng nhập', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('không thấy Xưởng soạn', async ({ page }) => {
      await openScreen(page, PATH, 'anon');
      await expect(page.getByRole('list', { name: t('games.practice.title') })).toBeVisible();
      await expect(page.getByRole('list', { name: t('games.studio.title') })).toHaveCount(0);
    });
  });

  test('tiến độ đã lưu đổi nút thành Chơi tiếp và trỏ vào màn chưa qua', async ({ page }) => {
    const [first, second] = GIT_LEVELS;
    if (first === undefined || second === undefined) throw new Error('Git cần ít nhất hai màn cho ô này');
    await page.addInitScript((id) => {
      window.localStorage.setItem('git-odyssey-progress-v1', JSON.stringify({ [id]: { completed: true, moves: 3 } }));
    }, first.id);
    await openScreen(page, PATH, 'anon');
    const git = playable(page).locator('[data-game="git"]');
    const cta = git.getByRole('link', { name: `${t('games.band.cta.continue')}: ${t('games.git.name')}` });
    await expect(cta).toHaveAttribute('href', `/games/git?level=${encodeURIComponent(second.id)}`);
    await expect(git).toContainText(t('games.band.progress.some', { done: 1, total: GIT_LEVELS.length }));
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`không tràn ngang ở 390px, theme ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((value) => {
        window.localStorage.setItem('dlp.theme', value);
      }, theme);
      await openScreen(page, PATH, 'anon');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/u : /^(?!.*\bdark\b)/u);
      await noHorizontalOverflow(page);
    });
  }

  test('nút đổi theme trên thanh đầu trang vẫn đổi được theme của /games', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem('dlp.theme', 'light');
    });
    await openScreen(page, PATH, 'anon');
    await page.getByRole('button', { name: t('shell.theme.label'), exact: true }).click();
    // Ba lựa chọn theme là MỘT nhóm chọn-một (`MenuRadioItem`), nên vai trò là `menuitemradio`,
    // không phải `menuitem`: trình đọc màn hình đọc được lựa chọn nào đang bật.
    await page.getByRole('menuitemradio', { name: t('shell.theme.choice.dark'), exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/u);
    await noHorizontalOverflow(page);
  });
});
