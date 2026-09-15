/**
 * Ô gác: màn chơi Git đọc kết quả mục tiêu từ ENGINE, không tự chấm lại với một
 * cây đích `null`.
 *
 * ## Lỗi mà ô này gác
 *
 * `git-game.tsx` từng gọi `evaluateObjectives(world, null, level.objectives)`.
 * Tham số thứ hai là cây ĐÍCH, và `evaluatePredicate` trả `false` **cứng** cho
 * `graphShapeMatches` khi nó là `null` (`packages/games/src/git/predicates.ts:178`)
 * — trong khi engine chấm bằng cây đích thật dựng từ `level.target`
 * (`engine.ts:135`).
 *
 * Hệ quả: một level dùng `graphShapeMatches` hiện mục tiêu đó VĨNH VIỄN đỏ trên
 * màn, còn engine coi là đã đạt. Hai phần của mã trả lời khác nhau về cùng một
 * level, và phần người chơi nhìn thấy là phần sai.
 *
 * ## Vì sao nó chưa từng lộ ra
 *
 * Không level nào trong 32 level đang phát hành dùng `graphShapeMatches` (đo
 * 2026-09-15), nên nhánh đó là mã chết và mọi ô test đều xanh. **Level Builder
 * (§18.E) làm nó sống**: "rebase cho ra hình dạng này" là loại level mà một
 * builder trực quan dựng ra tự nhiên nhất, và nó chính là thứ vị từ đó tồn tại
 * để chấm.
 *
 * ## Vì sao ô này TĨNH chứ không render component
 *
 * Thứ cần gác là **nguồn dữ liệu** của một component, không phải một hàm thuần.
 * Tách phép suy ra thành một hàm rồi test hàm đó sẽ xanh ngay cả khi component
 * quay về tự chấm lại — đúng hình dạng `rules/wired-not-just-present.md`: hàm có
 * mặt, nhưng không ai nối vào. Ô tĩnh đọc chính file mà hậu quả rơi xuống.
 *
 * Tiền lệ trong repo: `app/(session)/problems/engine-leak.test.ts`,
 * `app/author/problems/arena-preview.test.ts` — cùng lối "mở file thật rồi đòi
 * thấy/không thấy một điều".
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const GIT_GAME = join(import.meta.dirname, 'git-game.tsx');

describe('màn chơi Git lấy kết quả mục tiêu từ engine', () => {
  const source = readFileSync(GIT_GAME, 'utf8');

  it('KHÔNG tự gọi evaluateObjectives — engine đã chấm rồi', () => {
    /*
     * Khớp lời gọi thật, không khớp chữ trong chú thích: đòi một dấu `(` ngay
     * sau tên. Khối chú thích ở `git-game.tsx` cố ý nhắc tên hàm để giải thích
     * lỗi cũ, và một ô đỏ vì nhắc tên vấn đề trong chú thích là một ô đỏ vì lý
     * do sai — đúng cái bẫy mà `phase-18.md` §18.A đã phải sửa một lần.
     */
    expect(source).not.toMatch(/evaluateObjectives\s*\(/);
  });

  it('đọc objectivesMet từ getStatus()', () => {
    expect(source).toMatch(/getStatus\(\)\.objectivesMet/);
  });
});
