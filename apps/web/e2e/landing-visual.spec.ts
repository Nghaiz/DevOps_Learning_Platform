/**
 * Trang chủ — bốn tổ hợp viewport × theme, có tương tác thật và có đổi theme.
 *
 * ⚠ VIẾT LẠI 2026-09-16. Bản cũ đo `landing-lab-preview` — khối xem trước tương
 * tác (Docker / Linux / Kubernetes) của trang marketing. Commit `4f6d3ba` đổi
 * `app/page.tsx` sang render `<GamesHub />`, nên khối đó KHÔNG CÒN trên `/`, và
 * bốn ô này treo 15s ở `scrollIntoViewIfNeeded` rồi đỏ.
 *
 * Việc đúng không phải xoá spec — ba trong bốn thứ nó gác vẫn còn nguyên giá
 * trị: trang dựng được ở 1440/390 trên cả hai theme, KHÔNG tràn ngang, và nút
 * đổi theme còn hoạt động. Chỉ phần khẳng định về lab preview là đo một tính
 * năng đã bị gỡ. Nên phần đó được thay bằng bề mặt tương tác THẬT của trang
 * chủ hôm nay: lọc theo chủ đề, tìm kiếm, và trạng thái rỗng.
 *
 * ⛔ `components/marketing/` (hero, lab-preview, curriculum, value-props,
 * getting-started, scroll-experience, catalog-stats, experience-scene) hiện
 * KHÔNG còn nơi gọi nào trong mã sản phẩm — đo bằng grep import ngày
 * 2026-09-16. Test đơn vị của chúng vẫn xanh vì chúng render component trực
 * tiếp, nên suite xanh không nói lên rằng trang marketing còn sống. Giữ hay xoá
 * cây đó là quyết định của chủ dự án, không phải của spec này; ghi lại ở đây để
 * người sau không đọc "landing-visual xanh" thành "trang marketing vẫn chạy".
 */

import { t } from '@devops-platform/copy';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen } from './fixtures/nav';

test.use({ storageState: { cookies: [], origins: [] } });

async function returnToTop(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`landing — ${width}px ${theme}, lọc game và đổi theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.emulateMedia({
        colorScheme: theme,
        reducedMotion: width === 390 ? 'reduce' : 'no-preference',
      });
      await page.addInitScript((value) => localStorage.setItem('dlp.theme', value), theme);
      await openScreen(page, '/', 'anon');
      await returnToTop(page);
      await page.screenshot({ path: testInfo.outputPath(`home-${width}-${theme}-hero.png`) });

      const library = page.getByRole('region', { name: 'Games' });
      await expect(library).toBeVisible();
      await library.scrollIntoViewIfNeeded();

      /*
       * Trạng thái đầu: "Tất cả" đang được chọn, và CẢ HAI game chơi được đều
       * có mặt. Khẳng định cả hai chứ không chỉ một — một lưới rỗng cũng "không
       * chứa k8s", nên chỉ kiểm vắng mặt thì lọc hỏng hoàn toàn vẫn xanh.
       */
      const allTopic = library.getByRole('button', { name: 'Tất cả', exact: true });
      await expect(allTopic).toHaveAttribute('aria-pressed', 'true');
      const gitCard = library.getByRole('link', { name: /Git Odyssey/ });
      // Tên lấy từ `games-catalog.ts` (`title: 'Kubernetes Game'`), không phải
      // từ nhãn tranh `CLUSTER OPERATIONS` — nhãn tranh là chữ trang trí và đổi
      // được mà không ai coi đó là đổi hợp đồng.
      const k8sCard = library.getByRole('link', { name: /Kubernetes Game/ });
      await expect(gitCard).toBeVisible();
      await expect(k8sCard).toBeVisible();

      // Lọc theo chủ đề: Git giữ lại thẻ Git, loại thẻ còn lại.
      const gitTopic = library.getByRole('button', { name: 'Git', exact: true });
      await gitTopic.click();
      await expect(gitTopic).toHaveAttribute('aria-pressed', 'true');
      await expect(allTopic).toHaveAttribute('aria-pressed', 'false');
      await expect(gitCard).toBeVisible();
      await expect(k8sCard).toHaveCount(0);

      await page.screenshot({ path: testInfo.outputPath(`home-${width}-${theme}-filtered.png`) });

      /*
       * Tìm kiếm một chuỗi chắc chắn không khớp gì, để ép trạng thái rỗng hiện
       * ra. Đây là đường mà người dùng gõ nhầm rơi vào, và nó phải có lối thoát
       * chứ không phải một lưới trắng không giải thích gì.
       */
      const search = library.getByRole('searchbox', { name: 'Tìm game' });
      await search.fill('zzzkhongcogamenao');
      // Lấy chữ từ bản đồ, không gõ lại: `games-hub.tsx` nay gọi đúng khoá này,
      // nên một lượt đổi chữ sẽ đổi cả hai đầu và spec không lạc lần nữa.
      await expect(library.getByText(t('catalog.empty.games.title'))).toBeVisible();
      await expect(gitCard).toHaveCount(0);

      // Lối thoát phải đưa về ĐÚNG trạng thái đầu, cả ô tìm lẫn bộ lọc chủ đề.
      await library.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(allTopic).toHaveAttribute('aria-pressed', 'true');
      await expect(gitCard).toBeVisible();
      await expect(k8sCard).toBeVisible();

      await returnToTop(page);
      await page.screenshot({
        path: testInfo.outputPath(`home-${width}-${theme}-full.png`),
        fullPage: true,
      });

      /*
       * Không tràn ngang. Giữ nguyên từ bản cũ — memory dự án ghi một lỗi THẬT
       * đúng hình dạng này (nhãn `sr-only` thoát khỏi `overflow-x-auto` kéo
       * trang trôi 308px), nên đây không phải khẳng định trang trí.
       */
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );

      const nextTheme = theme === 'light' ? 'dark' : 'light';
      await page.getByRole('button', { name: t('shell.theme.label'), exact: true }).click();
      await page
        .getByRole('menuitem', { name: t(`shell.theme.choice.${nextTheme}`), exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
        .toBe(nextTheme === 'dark');
      await library.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`home-${width}-${theme}-to-${nextTheme}.png`),
      });
    });
  }
}
