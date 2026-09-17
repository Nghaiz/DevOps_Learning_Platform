/**
 * AC-J5 ở môi trường `node` — nửa của bộ đôi. Nửa kia: `.jsdom.test.ts`.
 *
 * Thân phép đo nằm ở `problem-oj-determinism.ts` để hai môi trường không thể
 * chạy hai bộ kỳ vọng khác nhau. Đọc khối đầu file đó về lý do.
 */

import { describe, it } from 'vitest';

import { chayOKhopMocSo, chayOTatDinh } from './problem-oj-determinism.ts';

describe('AC-J5 — tất định (node)', () => {
  it('200 lượt cùng đầu vào cho cùng `GradeResult`', () => {
    chayOTatDinh('node');
  });

  it('khớp mốc số đã ghim', () => {
    chayOKhopMocSo('node');
  });
});
