/**
 * @vitest-environment jsdom
 *
 * AC-J5 ở môi trường `jsdom` — nửa còn lại của bộ đôi.
 *
 * ⚠ Đây là bất biến sống còn của chế độ làm bài, không phải một ô cho đủ bộ:
 * người làm chơi trong TRÌNH DUYỆT, máy chủ chấm lại bằng NODE, và §18.C so hai
 * verdict. Lệch nghĩa là mọi lượt nộp HỢP LỆ đều bị từ chối — và triệu chứng
 * đọc ra như một hệ thống từ chối người chơi ngẫu nhiên, không như một lỗi.
 *
 * ⛔ Môi trường khai bằng docblock ở dòng ĐẦU. `environmentMatchGlobs` trong
 * `vitest.config` đã bị gỡ ở vitest 4: nó lọt typecheck rồi im lặng không làm
 * gì, nên file này sẽ chạy ở `node` và ô đo hai môi trường sẽ đo một môi trường
 * hai lần.
 */

import { describe, expect, it } from 'vitest';

import { chayOKhopMocSo, chayOTatDinh } from './problem-oj-determinism.ts';

describe('AC-J5 — tất định (jsdom)', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG cho chính docblock ở đầu file, và nó phải đứng đây chứ
   * không nằm trong đầu ai.
   *
   * Một docblock gõ sai (`@vitest-env`, thiếu dòng trắng, đặt sau `import`) làm
   * file chạy ở `node` — và khi đó cả hai ô dưới vẫn XANH, vì chúng đo lại đúng
   * thứ bản `node` vừa đo. Ô này là thứ duy nhất phân biệt "đã chạy ở jsdom" với
   * "tưởng là đã chạy ở jsdom".
   */
  it('thật sự đang chạy trong jsdom', () => {
    expect(typeof globalThis.window).toBe('object');
    expect(typeof globalThis.document).toBe('object');
  });

  it('200 lượt cùng đầu vào cho cùng `GradeResult`', () => {
    chayOTatDinh('jsdom');
  });

  /*
   * Mốc SỐ, cùng con số mà bản `node` ghim. Đây là chỗ hai môi trường thật sự
   * gặp nhau: hai lượt trong cùng một tiến trình chỉ chứng minh hàm thuần TRONG
   * tiến trình đó, còn một danh sách `passed` ghim cứng thì `node` và `jsdom`
   * phải cùng đồng ý.
   */
  it('khớp mốc số đã ghim — cùng con số bản node ghim', () => {
    chayOKhopMocSo('jsdom');
  });
});
