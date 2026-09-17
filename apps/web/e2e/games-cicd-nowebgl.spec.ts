/**
 * P19 §19.D — AC-D3 ĐỦ: đường 2D trên máy KHÔNG cấp được WebGL2.
 *
 * ## Vì sao là một file riêng
 *
 * `launchOptions` ép Playwright dựng một worker MỚI, nên nó không đặt được bên
 * trong một `describe` — chỉ ở đầu file hoặc trong config. Đây là toàn bộ lý do
 * ô này không nằm chung với `games-cicd-scene.spec.ts`.
 *
 * ## Vì sao `--disable-gpu` KHÔNG đủ
 *
 * Chromium headless vẫn cấp WebGL2 qua **SwiftShader** (rasterize bằng CPU) khi
 * chỉ tắt GPU, nên mọi phép kiểm "máy này có WebGL không" đều xanh và nhánh dự
 * phòng không bao giờ chạy. `--disable-3d-apis` mới thật sự gỡ nó — và ô dưới
 * đây tự khẳng định điều đó trước khi đo bất cứ thứ gì khác.
 *
 * ⛔ Phải có tên trong `e2e:ci` của `apps/web/package.json`.
 */

import type { Page } from '@playwright/test';
import { CI_LEVELS } from '@devops-platform/games';

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';

test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

function manQuatRa() {
  const level = CI_LEVELS.find((l) => l.id.startsWith('cicd-c13-'));
  if (level === undefined) throw new Error('không tìm thấy C13');
  return level;
}

function duongDanMan(levelId: string): string {
  return `/games/cicd/${levelId}`;
}

async function doiCheDo(page: Page, che: '2D' | '3D'): Promise<void> {
  await page.getByRole('group', { name: 'Chế độ vẽ' }).getByRole('button', { name: che }).click();
  await settle(page);
}

  /*
   * ⚠ `--disable-gpu` KHÔNG đủ: Chromium headless vẫn cấp WebGL2 qua SwiftShader
   * (rasterize bằng CPU), nên mọi phép kiểm "có WebGL không" đều xanh và nhánh
   * dự phòng không bao giờ chạy. `--disable-3d-apis` mới thật sự gỡ nó.
   */
  test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

  test('chọn 3D trên máy đã đo là không có WebGL2 thì RƠI VỀ 2D @games-cicd-scene', async ({
    page,
  }) => {
    const level = manQuatRa();
    await openScreen(page, duongDanMan(level.id), 'user');
    await settle(page);

    /*
     * ⛔ ĐỐI CHỨNG CỦA CHÍNH CỜ KHỞI ĐỘNG. Không có vế này thì cả ô bên dưới vô
     * nghĩa: nếu `--disable-3d-apis` không ăn (đổi tên cờ, Chromium đổi hành vi,
     * `launchOptions` bị một project khác ghi đè), trình duyệt vẫn có WebGL2,
     * nhánh "rơi về 2D" không bao giờ chạy, và ô này xanh vì một lý do hoàn
     * toàn khác lý do nó tồn tại.
     */
    const coWebgl2 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      try {
        return canvas.getContext('webgl2') !== null;
      } catch {
        return false;
      }
    });
    expect(coWebgl2, 'cờ --disable-3d-apis phải thật sự gỡ WebGL2').toBe(false);

    // 2D vẫn dùng được và vẫn vẽ đủ node — đây là điều kiện sống của AC-5.
    const canh2d = page.getByTestId('cicd-scene-2d');
    await expect(canh2d).toBeVisible();
    const soNode = Number(await canh2d.getAttribute('data-cicd-node-count'));
    expect(soNode, 'cảnh 2D phải vẽ thật, không rỗng').toBeGreaterThan(0);

    /*
     * Bấm 3D. Luật của `renderer-mode.ts`: lựa chọn TAY thắng kết quả dò, TRỪ
     * chiều này — chọn 3D trên máy ĐÃ ĐO được là không có WebGL2 thì rơi về 2D,
     * vì ở đó 3D không hiện được gì và một canvas trắng tệ hơn một lựa chọn bị
     * bỏ qua.
     */
    await doiCheDo(page, '3D');

    await expect(page.getByTestId('cicd-scene-2d')).toBeVisible();
    await expect(page.getByTestId('cicd-scene-3d')).toHaveCount(0);
    // Và không mất node nào trong lúc rơi về.
    await expect(page.getByTestId('cicd-scene-2d')).toHaveAttribute(
      'data-cicd-node-count',
      String(soNode),
    );
});
