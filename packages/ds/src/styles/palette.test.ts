import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { audit, withPalette } from '../../scripts/palette.mjs';

/**
 * Cổng của `scripts/palette.mjs --check`, chạy trong suite của ds.
 *
 * Đầu theme.css viết "`--check` là cổng chống lệch", nhưng tới 2026-10-20 không workflow, không
 * script `package.json` và không test nào gọi nó: một khối @palette sửa tay sẽ trôi khỏi bảng
 * sinh mà không gì kêu. Đây là chỗ nó thật sự được gọi.
 */
// `__dirname` chứ không `new URL(…, import.meta.url)`: dưới môi trường jsdom của suite này, `URL` là
// lớp của jsdom và `readFileSync` từ chối nó ("The URL must be of scheme file").
const THEME = join(__dirname, 'theme.css');

describe('palette: theme.css khớp bảng sinh, và mọi cặp tương phản đạt', () => {
  // Checkout trên Windows (`core.autocrlf=true`) cho CRLF, còn bản sinh luôn là LF: so trên dòng LF.
  const source = readFileSync(THEME, 'utf8').replace(/\r\n/g, '\n');

  it('khối giữa hai dấu mốc @palette đúng y bản sinh', () => {
    expect(
      withPalette(source) === source,
      'theme.css lệch với palette.mjs. Sửa bảng trong script rồi chạy: node packages/ds/scripts/palette.mjs --write',
    ).toBe(true);
  });

  it('đối chứng: sửa tay một giá trị trong khối @palette thì phép so ra lệch', () => {
    const doctored = source.replace(/--canvas: oklch\([^)]*\);/, '--canvas: oklch(0.5 0 0);');
    expect(doctored, 'mẫu đối chứng không còn khớp theme.css').not.toBe(source);
    expect(withPalette(doctored) === doctored).toBe(false);
  });

  it('mọi cặp màu đạt ngưỡng tương phản và nằm trong gam sRGB', () => {
    expect(audit()).toEqual([]);
  });
});
