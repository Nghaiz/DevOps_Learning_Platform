/**
 * Dò: cờ launch nào THẬT SỰ xoá WebGL2 khỏi Chrome?
 *
 * Sinh ra `webgl-flag-probe.txt` cạnh file này. Câu trả lời quyết định cờ của
 * project `gpu-off` trong `packages/terminal/vitest.config.ts`.
 *
 * Chạy:  cd packages/terminal && node ../../plans/devops-learning-platform/reports/harness/2026-08-13-1g5-fe-browser/probe-webgl.mjs
 *
 * ⛔ Dùng `channel: 'chrome'` (Chrome đã cài) chứ KHÔNG phải chromium bundled.
 * Lý do ghi lại vì nó đã tốn một lượt: `playwright-core` đi kèm `@playwright/mcp`
 * ghim một build chromium cụ thể (1232 lúc đo), và nếu máy chỉ có build khác thì
 * `chromium.launch()` chết ở `Executable doesn't exist` — đọc thoáng qua rất
 * giống "cờ không hoạt động" chứ không giống "thiếu binary".
 */
import { chromium } from 'playwright';

const CASES = [
  { name: 'default (đối chứng dương)', args: [] },
  { name: '--disable-gpu', args: ['--disable-gpu'] },
  {
    name: '--disable-gpu --disable-software-rasterizer',
    args: ['--disable-gpu', '--disable-software-rasterizer'],
  },
  { name: '--disable-3d-apis', args: ['--disable-3d-apis'] },
  { name: '--use-gl=disabled', args: ['--use-gl=disabled'] },
];

// Đo CẢ headless lẫn headed: GPU trong headless là một chỗ khác biệt kinh điển,
// nên "headless cho cùng kết quả" phải là số đo chứ không phải giả định — đó là
// vế cho phép cổng CI chạy headless.
for (const headless of [true, false]) {
  console.log(`\n### headless=${headless}`);
  for (const c of CASES) {
    let browser;
    try {
      browser = await chromium.launch({ channel: 'chrome', headless, args: c.args });
      const page = await browser.newPage();
      const r = await page.evaluate(() => {
        const el = document.createElement('canvas');
        const gl = el.getContext('webgl2', {
          antialias: false,
          depth: false,
          preserveDrawingBuffer: true,
        });
        if (!gl) return { webgl2: 'ABSENT' };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          webgl2: 'PRESENT',
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '(no ext)',
        };
      });
      console.log(
        `  ${c.name.padEnd(44)} → ${r.webgl2}${r.renderer ? '  [' + r.renderer + ']' : ''}`,
      );
    } catch (e) {
      console.log(`  ${c.name.padEnd(44)} → FAILED: ${e.message.split('\n')[0]}`);
    } finally {
      await browser?.close();
    }
  }
}
