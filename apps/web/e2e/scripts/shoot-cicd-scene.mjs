/**
 * Chụp cảnh CI/CD ra ảnh để NGƯỜI xem — hai theme × hai chế độ vẽ.
 *
 * ## Vì sao cần, dù đã có axe và cổng token
 *
 * §2.2 của `phase-19-d-exec.md` ghi: *"Theme sáng không phải theme tối đảo
 * ngược… Phải tự kiểm cả hai theme."* Không cổng tự động nào bắt được "nhìn
 * không ra": axe đo tương phản của CHỮ, không đo một khối wireframe chìm vào
 * nền; `tokens:check` đo việc màu đến từ token, không đo màu đó có đọc được.
 *
 * ## Vì sao là script CLI, không phải một spec
 *
 * Nó không gác gì cả — nó sinh ra ảnh cho người nhìn. Một spec không nằm trong
 * `e2e:ci` là rác; một spec nằm trong đó mà chỉ chụp ảnh thì làm chậm cổng và
 * không bao giờ đỏ. Nên: script, chạy tay, khi cần nhìn.
 *
 * ⚠ `mcp__playwright__browser_navigate` treo tới hết idle timeout trong dự án
 * này (đã cắn hai lần ngày 2026-09-17). Playwright qua CLI thì bình thường —
 * đó là lý do file này dùng API trực tiếp.
 *
 * ## Chạy
 *
 *   cd apps/web && pnpm start &                     # phục vụ .next ĐÃ build
 *   node e2e/scripts/shoot-cicd-scene.mjs <thư-mục-ra>
 *
 * `/games/cicd` không gác auth (game chạy trọn trong trình duyệt), nên script
 * vào thẳng, không cần đăng nhập.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE = process.env.SHOOT_BASE_URL ?? 'http://localhost:3000';
const LEVEL = process.env.SHOOT_LEVEL ?? 'cicd-c13-gom-ket-qua-nhieu-nhanh';
const OUT = process.argv[2] ?? 'e2e/.artifacts/scene-shots';

async function doiCheDo(page, che) {
  await page.getByRole('group', { name: 'Chế độ vẽ' }).getByRole('button', { name: che }).click();
  await page.waitForTimeout(1200);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/games/cicd/${LEVEL}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="cicd-field"]', { timeout: 30_000 });
    await page.waitForTimeout(800);

    const coDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (coDark !== (theme === 'dark')) {
      // Đối chứng cho chính phép đổi theme: thiếu nó thì hai ảnh "sáng" và "tối"
      // có thể là cùng một theme, và người xem so hai bản giống hệt nhau.
      throw new Error(`theme ${theme}: <html> ${coDark ? 'CÓ' : 'KHÔNG có'} class dark — sai`);
    }

    for (const che of ['2D', '3D']) {
      if (che === '3D') await doiCheDo(page, '3D');
      const canh = page.locator(`[data-testid="cicd-scene-${che.toLowerCase()}"]`);
      await canh.waitFor({ timeout: 30_000 });
      await page.waitForTimeout(che === '3D' ? 2500 : 600);

      const ten = path.join(OUT, `cicd-${che.toLowerCase()}-${theme}.png`);
      await page.screenshot({ path: ten });
      const dem = await canh.getAttribute('data-cicd-node-count');
      console.log(`${ten}  · node=${dem ?? '?'}`);
    }

    await context.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
