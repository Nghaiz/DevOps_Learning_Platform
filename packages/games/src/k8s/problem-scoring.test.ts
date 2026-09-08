import { describe, expect, it } from 'vitest';
import type { ProblemHint } from './problem.ts';
import type { ProblemScoreInput } from './problem-scoring.ts';
import { scoreProblemRun } from './problem-scoring.ts';
import { MAX_SCORE, computeScore } from './scoring.ts';

/**
 * Cổng gác cho hàm chấm điểm dùng chung giữa arena và máy chủ.
 *
 * Bối cảnh của mọi test dưới đây: máy chủ phát lại nhật ký hành động rồi chỉ ghi
 * nhận điểm khi con số nó tính KHỚP con số client khai. Nên mỗi lệch lạc nhỏ ở
 * đây không biểu hiện thành "điểm sai vài chục" — nó biểu hiện thành "lượt nộp
 * hợp lệ bị từ chối", và người chơi không có cách nào biết tại sao.
 */

const HINTS: readonly ProblemHint[] = [
  { id: 'h1', text: 'gợi ý một', penaltyPoints: 50 },
  { id: 'h2', text: 'gợi ý hai', penaltyPoints: 120 },
  { id: 'h3', text: 'gợi ý ba miễn phí', penaltyPoints: 0 },
];

function input(overrides: Partial<ProblemScoreInput> = {}): ProblemScoreInput {
  return {
    objectivesMet: 3,
    objectivesTotal: 3,
    movesUsed: 5,
    parMoves: 5,
    hints: HINTS,
    revealedHintIds: [],
    ...overrides,
  };
}

describe('lượt chơi hoàn hảo', () => {
  it('không mở gợi ý nào thì ăn trọn điểm', () => {
    expect(scoreProblemRun(input())).toBe(MAX_SCORE);
  });

  it('bài không đặt mốc nước đi vẫn ăn trọn, dù đi bao nhiêu nước', () => {
    /*
     * `parMoves: null` là đường đi BÌNH THƯỜNG của bài OJ, không phải lối thoát
     * hiểm. Nếu `null` bị đổi thành 0 rồi 0 được hiểu là "mốc chuẩn là không
     * nước nào", mọi bài không đặt mốc sẽ phạt người chơi ngay từ nước đi đầu.
     */
    expect(scoreProblemRun(input({ parMoves: null, movesUsed: 40 }))).toBe(MAX_SCORE);
  });
});

describe('trừ điểm gợi ý', () => {
  it('trừ đúng giá của gợi ý đã mở', () => {
    expect(scoreProblemRun(input({ revealedHintIds: ['h1'] }))).toBe(MAX_SCORE - 50);
    expect(scoreProblemRun(input({ revealedHintIds: ['h1', 'h2'] }))).toBe(MAX_SCORE - 170);
  });

  it('gợi ý miễn phí không trừ gì', () => {
    expect(scoreProblemRun(input({ revealedHintIds: ['h3'] }))).toBe(MAX_SCORE);
  });

  it('cùng một gợi ý kể hai lần chỉ trừ một lần', () => {
    /*
     * Danh sách id là HỢP của hai nguồn — nhật ký lượt chơi và bảng lưu phía máy
     * chủ — và hai nguồn đó chồng lấn ở mọi gợi ý mở trong lúc chơi. Không khử
     * trùng thì đúng những người mở gợi ý theo cách thông thường nhất lại bị trừ
     * gấp đôi.
     */
    expect(scoreProblemRun(input({ revealedHintIds: ['h1', 'h1', 'h1'] }))).toBe(MAX_SCORE - 50);
  });

  it('bỏ qua id không khớp gợi ý nào, không ném', () => {
    /*
     * Xảy ra thật khi bài được sửa đề trong lúc có người đang làm dở: gợi ý cũ
     * biến mất, nhật ký cũ vẫn nhắc tới id của nó. Ném ở đây sẽ huỷ cả lượt nộp
     * vì một thay đổi mà người chơi không gây ra.
     */
    expect(scoreProblemRun(input({ revealedHintIds: ['khong-ton-tai'] }))).toBe(MAX_SCORE);
  });

  it('không cho điểm âm khi tổng phạt vượt điểm gốc', () => {
    const hintDat: readonly ProblemHint[] = [
      { id: 'x1', text: 'đắt', penaltyPoints: 900 },
      { id: 'x2', text: 'đắt nữa', penaltyPoints: 900 },
    ];
    const score = scoreProblemRun(
      input({ hints: hintDat, revealedHintIds: ['x1', 'x2'] }),
    );
    expect(score).toBe(0);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('gợi ý chỉ bị phạt MỘT lần', () => {
  /**
   * `computeScore` có sẵn một phần điểm "tự lực" giảm theo tỉ lệ gợi ý đã dùng.
   * Bài OJ không dùng cơ chế đó vì gợi ý ở đây đã có giá riêng. Nếu ai đó "sửa"
   * `scoreProblemRun` để truyền số gợi ý thật vào `computeScore`, người chơi bị
   * trừ hai lần cho một lần mở — và test này là chỗ duy nhất nói ra điều đó.
   */
  it('mở một gợi ý chỉ mất đúng penaltyPoints, không mất thêm phần tự lực', () => {
    const khongMoGoiY = scoreProblemRun(input({ revealedHintIds: [] }));
    const moMotGoiY = scoreProblemRun(input({ revealedHintIds: ['h1'] }));
    expect(khongMoGoiY - moMotGoiY).toBe(50);
  });

  it('phạt hai lần sẽ cho ra con số KHÁC — đối chứng âm', () => {
    /*
     * Đối chứng âm: dựng lại đúng cách tính sai (truyền gợi ý vào `computeScore`
     * rồi vẫn trừ `penaltyPoints`) và khẳng định nó KHÁC kết quả thật. Không có
     * ô này thì bốn test trên vẫn xanh y hệt kể cả khi hàm phạt hai lần, miễn là
     * chúng chỉ so với chính nó.
     */
    const phatHaiLan =
      computeScore({
        objectivesMet: 3,
        objectivesTotal: 3,
        movesUsed: 5,
        parMoves: 5,
        hintsUsed: 1,
        hintsAvailable: 3,
      }) - 50;
    expect(scoreProblemRun(input({ revealedHintIds: ['h1'] }))).not.toBe(phatHaiLan);
  });
});

describe('lượt chơi chưa xong', () => {
  it('chưa đạt hết mục tiêu thì không được phần hiệu quả lẫn phần tự lực', () => {
    // Ràng buộc này thuộc `computeScore`; khẳng định lại ở đây vì hệ OJ dựa vào
    // nó để chặn đường gian lận "bỏ ngang ngay nước đầu vẫn ăn 300 điểm".
    const doDang = scoreProblemRun(input({ objectivesMet: 0, movesUsed: 0 }));
    expect(doDang).toBeLessThan(MAX_SCORE);
    expect(doDang).toBe(0);
  });
});
