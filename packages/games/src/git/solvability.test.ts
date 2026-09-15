/**
 * `checkSolvable` — §18.E.7.
 *
 * ⛔ Ô quan trọng nhất trong file này là ĐỐI CHỨNG DƯƠNG: một level mà lời giải
 * khai KHÔNG tới đích phải bị báo đỏ, và câu báo phải chỉ đúng mục tiêu nào
 * chưa đạt. Không có nó thì "phép kiểm chạy xanh" chỉ chứng minh rằng nó chạy,
 * chứ không chứng minh rằng nó **bắt được gì** — `rules/green-that-proves-nothing.md`.
 *
 * Gá lấy từ level ĐANG PHÁT HÀNH (`GIT_LEVELS`) ở chỗ nào có thể, vì một
 * `WorldSpec` bịa tay là thêm một chỗ có thể sai mà lỗi của nó đọc ra y hệt lỗi
 * của thứ đang đo. Hai ô cuối buộc phải bịa gá, vì **không level phát hành nào
 * dùng `target`/`graphShapeMatches`** (đo 2026-09-15) — nhánh cây đích của
 * `checkSolvable` sẽ không được ô nào chạm tới nếu chỉ dùng hàng có sẵn.
 */

import { describe, expect, it } from 'vitest';

import type { GitLevel } from './contract.ts';
import { GIT_LEVELS } from './levels/index.ts';
import { checkSolvable } from './solvability.ts';

const G01 = GIT_LEVELS[0]!;

describe('checkSolvable — lời giải đạt', () => {
  it('lời giải thật của một level phát hành thì AC', () => {
    const report = checkSolvable(G01, G01.solutionCommands);
    expect(report.accepted, report.diagnosis).toBe(true);
    expect(report.passedCount).toBe(report.totalCount);
    expect(report.unmet).toEqual([]);
  });

  it('lời giải thứ hai cũng AC — chấm theo TRẠNG THÁI, không theo lệnh đã gõ', () => {
    const report = checkSolvable(G01, G01.altSolutionCommands);
    expect(report.accepted, report.diagnosis).toBe(true);
  });
});

describe('ĐỐI CHỨNG DƯƠNG — phép kiểm phải ĐỎ được', () => {
  it('không gõ lệnh nào ⇒ không đạt, và nói ra mục tiêu nào chưa đạt', () => {
    const report = checkSolvable(G01, []);

    expect(report.accepted).toBe(false);
    expect(report.passedCount).toBeLessThan(report.totalCount);

    // Không chỉ đỏ — phải đỏ CÓ TÊN. Một báo cáo đỏ mà không chỉ được vào mục
    // tiêu nào thì người soạn không sửa được gì từ nó.
    expect(report.unmet.length).toBeGreaterThan(0);
    for (const objective of report.unmet) {
      expect(objective.id).not.toBe('');
      expect(objective.label).not.toBe('');
    }
    expect(report.diagnosis).toContain(report.unmet[0]!.id);
  });

  it('lời giải thiếu bước cuối ⇒ vẫn đỏ', () => {
    // Bỏ lệnh cuối của lời giải thật. Đây là hình dạng lỗi hay gặp nhất khi dựng
    // level bằng tay: bấm vài nút trong sandbox rồi quên rằng chuỗi lệnh khai
    // phải tự đi lại quãng đó.
    const thieuBuocCuoi = G01.solutionCommands.slice(0, -1);
    const report = checkSolvable(G01, thieuBuocCuoi);
    expect(report.accepted).toBe(false);
  });
});

describe('lệnh bị từ chối', () => {
  it('lệnh không tồn tại được ghi lại kèm mã lỗi', () => {
    const report = checkSolvable(G01, ['git khong-co-lenh-nay']);
    expect(report.rejected.length).toBeGreaterThan(0);
    expect(report.rejected[0]!.command).toBe('git khong-co-lenh-nay');
    expect(report.rejected[0]!.message).not.toBe('');
    expect(report.diagnosis).toContain('khong-co-lenh-nay');
  });

  it('lệnh bị từ chối KHÔNG tự nó làm trượt — gõ sai rồi gõ lại đúng vẫn AC', () => {
    // Đây là quyết định, không phải tình cờ: người chơi thật gõ sai rồi sửa, và
    // một phép kiểm phạt điều đó sẽ phạt đúng hành vi học tập bình thường.
    const report = checkSolvable(G01, ['git khong-co-lenh-nay', ...G01.solutionCommands]);
    expect(report.rejected.length).toBeGreaterThan(0);
    expect(report.accepted, report.diagnosis).toBe(true);
  });
});

describe('cây đích', () => {
  /**
   * Level bịa tay, vì không level phát hành nào khai `target`.
   *
   * `setup` một commit trên `main`; `target` HAI commit. Lời giải rỗng nên hình
   * dạng DAG không thể khớp — đó chính là ca "đích không với tới được" mà
   * §18.E.7 phải bắt.
   */
  const coDich: GitLevel = {
    id: 'git-tu-dung-thu-cay-dich',
    chapter: 1,
    title: 'Thử cây đích',
    mission: 'Thêm một commit nữa.',
    brief: 'Gá test, không phát hành.',
    difficulty: 'basic',
    setup: {
      commits: [{ id: 'c1', message: 'đầu tiên' }],
      branches: { main: 'c1' },
    },
    target: {
      commits: [
        { id: 'c1', message: 'đầu tiên' },
        { id: 'c2', parents: ['c1'], message: 'thứ hai' },
      ],
      branches: { main: 'c2' },
    },
    allowedCommands: null,
    objectives: [
      {
        id: 'khop-hinh-dang',
        label: 'Đồ thị khớp cây đích',
        check: 'graphShapeMatches',
        required: true,
      },
    ],
    hints: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    solutionCommands: ['git commit --allow-empty -m "thứ hai"'],
    altSolutionCommands: [],
    par: 1,
  };

  it('ĐỐI CHỨNG DƯƠNG — không làm gì thì hình dạng không khớp đích', () => {
    const report = checkSolvable(coDich, []);
    expect(report.accepted).toBe(false);
    expect(report.unmet.map((o) => o.id)).toEqual(['khop-hinh-dang']);
  });

  it('cây đích dựng bằng CÙNG seed với thế giới đầu', () => {
    // Một seed khác cho cây đích dựng ra một cây khác, và phép so thành vô
    // nghĩa. Bài học này đã phải trả giá một lần khi hai plugin điền hai hằng
    // seed khác nhau (xem `git/problem-plugin.ts` § GIT_UNSEEDED_REPLAY_SEED).
    // Hai seed khác nhau, cùng một chuỗi lệnh, cùng một kết luận:
    for (const seed of [1, 7, 99]) {
      expect(checkSolvable(coDich, [], seed).accepted, `seed ${String(seed)}`).toBe(false);
    }
  });
});
