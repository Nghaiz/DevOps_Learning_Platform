import { describe, expect, it } from 'vitest';

import { buildEntries } from './command-palette';
import type { Viewer, ViewerRole } from './nav';

const viewer = (role: ViewerRole): Viewer => ({ name: 'Trần Minh Khoa', email: 'khoa@stu.ptit.edu.vn', role });

describe('buildEntries', () => {
  // `href` là `key` React của từng dòng: trùng thì danh sách nhân đôi hay rơi dòng.
  it.each(['user', 'author', 'admin'] as const)('mỗi đích xuất hiện đúng một lần (%s)', (role) => {
    const hrefs = buildEntries(viewer(role)).map((entry) => entry.href);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href, index) => hrefs.indexOf(href) !== index)).toEqual([]);
  });

  it('khách chỉ có nhóm trang', () => {
    const hrefs = buildEntries(null).map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
