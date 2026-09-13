/**
 * 32 level của game **Phòng thí nghiệm Git**, theo THỨ TỰ CHƠI.
 *
 * ⛔ Thứ tự chơi là thứ tự của mảng `GIT_LEVELS` dưới đây, **không** phải thứ tự
 * con số trong `id`. Con số trong id là ĐỊNH DANH: đánh số lại một level là mồ
 * côi toàn bộ tiến độ đã lưu của mọi người đang chơi (`RunResult.levelId` nằm
 * trong `localStorage`, không có bảng tra nào dịch ngược được). Chèn level mới
 * thì đặt nó ở cuối dãy số (`git-33-…`) rồi chèn vào đúng chỗ trong mảng.
 *
 * Chia file theo chương để ba lane nội dung chạy song song không đụng nhau —
 * `rules/parallel-teammate-git-index-race.md`: hai người ghi một file trong cây
 * dùng chung thì người sau ĐÈ người trước, không conflict marker, không lỗi
 * staging, thường không cả lỗi biên dịch.
 */

import type { GitLevel } from '../contract.ts';
import { GIT_LEVEL_IDS } from '../level-ids.ts';

import { G01, G02, G03, G04, G05, G06 } from './c1-01-06.ts';
import { G07, G08, G09, G10, G11, G12 } from './c1-07-12.ts';
import {
  G13,
  G14,
  G15,
  G16,
  G17,
  G18,
  G19,
  G20,
  G21,
  G22,
  G23,
  G24,
} from './c2.ts';
import { G25, G26, G27, G28, G29, G30, G31, G32 } from './c3.ts';

export const GIT_LEVELS: readonly GitLevel[] = [
  G01, G02, G03, G04, G05, G06, G07, G08, G09, G10, G11, G12,
  G13, G14, G15, G16, G17, G18, G19, G20, G21, G22, G23, G24,
  G25, G26, G27, G28, G29, G30, G31, G32,
];

/**
 * Tra một level theo id. `null` khi không có — KHÔNG ném.
 *
 * Không ném vì chỗ gọi chính là một route động (`/games/git/[levelId]`), và một
 * id gõ sai trên thanh địa chỉ phải ra trang 404 chứ không phải một trang lỗi
 * 500. Ném ở đây sẽ biến một URL sai thành một sự cố máy chủ.
 */
export function findGitLevel(id: string): GitLevel | null {
  return GIT_LEVELS.find((level) => level.id === id) ?? null;
}

/** Level của một chương, giữ nguyên thứ tự chơi. */
export function gitLevelsOfChapter(chapter: 1 | 2 | 3): readonly GitLevel[] {
  return GIT_LEVELS.filter((level) => level.chapter === chapter);
}

/**
 * Kiểm tra lúc **nạp module** rằng mảng khớp hợp đồng `level-ids.ts`.
 *
 * ⚠ Đây KHÔNG phải thay cho test — `levels.test.ts` vẫn kiểm đủ. Nó tồn tại vì
 * một lệch giữa hai file này là loại lỗi **im lặng**: một level thiếu chỉ làm
 * danh sách ngắn đi một dòng, và không ai để ý cho tới khi có người chơi tới
 * cuối chương và thấy hụt.
 *
 * Ném ngay lúc import thì lỗi nổ ở chỗ dễ chẩn đoán nhất: `next build` đỏ, hoặc
 * test đầu tiên chạm vào module này đỏ, kèm câu nói ra chính xác id nào lệch.
 */
function assertLevelsMatchContract(): void {
  const actual = GIT_LEVELS.map((l) => l.id);
  const expected = [...GIT_LEVEL_IDS];

  if (actual.length !== expected.length) {
    throw new Error(
      `GIT_LEVELS có ${actual.length} level nhưng level-ids.ts khai ${expected.length}. ` +
        `Hai file phải khớp cả số lượng lẫn thứ tự.`,
    );
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `GIT_LEVELS[${i}] là '${actual[i] ?? '<thiếu>'}' nhưng level-ids.ts khai ` +
          `'${expected[i] ?? '<thiếu>'}'. Sửa mảng, đừng sửa level-ids.ts — id là hợp đồng đóng băng.`,
      );
    }
  }
}

assertLevelsMatchContract();
