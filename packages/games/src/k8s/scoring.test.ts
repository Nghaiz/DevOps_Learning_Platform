import { describe, expect, it } from 'vitest';
import type { ScoreInput } from './scoring.ts';
import { MAX_SCORE, computeScore, scoreCeiling } from './scoring.ts';

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    objectivesMet: 2,
    objectivesTotal: 2,
    movesUsed: 3,
    parMoves: 3,
    hintsUsed: 0,
    hintsAvailable: 3,
    ...overrides,
  };
}

describe('computeScore', () => {
  it('chơi hoàn hảo ăn trọn 1000', () => {
    expect(computeScore(input())).toBe(MAX_SCORE);
  });

  it('ít nước hơn mốc chuẩn vẫn chỉ ăn trọn, không thưởng thêm', () => {
    expect(computeScore(input({ movesUsed: 1 }))).toBe(MAX_SCORE);
  });

  it('mở hết gợi ý mất trọn phần tự lực, giữ nguyên hai phần kia', () => {
    expect(computeScore(input({ hintsUsed: 3 }))).toBe(900);
  });

  it('điểm không bao giờ vượt trần hay xuống dưới 0', () => {
    expect(computeScore(input({ objectivesMet: 99 }))).toBeLessThanOrEqual(MAX_SCORE);
    expect(computeScore(input({ hintsUsed: -5 }))).toBeLessThanOrEqual(MAX_SCORE);
    expect(computeScore(input({ objectivesMet: -3, objectivesTotal: 2 }))).toBeGreaterThanOrEqual(0);
  });

  /**
   * Ô quan trọng nhất của file. Không có ràng buộc "phải đạt hết mục tiêu mới
   * cộng hai phần mức độ" thì bỏ ngang ở nước đi đầu tiên — 0 mục tiêu, 0 nước
   * đi, 0 gợi ý — vẫn ăn 300 cho "hiệu quả tuyệt đối và hoàn toàn tự lực". Đó là
   * đường gian lận rẻ nhất còn lại sau khi đã có xác minh phát lại.
   */
  it('bỏ ngang KHÔNG ăn điểm hiệu quả hay tự lực', () => {
    expect(
      computeScore({
        objectivesMet: 0,
        objectivesTotal: 3,
        movesUsed: 0,
        parMoves: 5,
        hintsUsed: 0,
        hintsAvailable: 3,
      }),
    ).toBe(0);
  });

  it('đạt một phần mục tiêu chỉ ăn phần mục tiêu', () => {
    const score = computeScore(input({ objectivesMet: 1, objectivesTotal: 2, movesUsed: 1 }));
    expect(score).toBe(350);
  });

  it('vượt mốc chuẩn giảm theo TỈ LỆ, không về 0', () => {
    // par = 3. Gấp đôi số nước ⇒ hiệu quả 200 × 3/6 = 100, cộng 700 mục tiêu và
    // 100 tự lực = 900. Gấp mười ⇒ 200 × 3/30 = 20, tổng 820.
    const twice = computeScore(input({ movesUsed: 6 }));
    const tenTimes = computeScore(input({ movesUsed: 30 }));
    expect(twice).toBe(900);
    expect(tenTimes).toBe(820);
    // Tiệm cận 800 (= 700 + 100 tự lực) mà không bao giờ chạm — vẫn xếp hạng
    // được giữa "hơi vòng" và "mò mẫm hoàn toàn".
    expect(computeScore(input({ movesUsed: 3000 }))).toBeGreaterThan(800);
  });

  /**
   * Cả hai nhánh chia-cho-0. `NaN` lọt vào `score` sẽ đi qua `localStorage`,
   * thành `null` sau `JSON.stringify`, rồi bị `parseRun` loại cả bản ghi — mất
   * nguyên một lượt chơi vì một phép chia, và chỉ lộ ra sau bốn tầng.
   */
  it('level không có gợi ý hoặc không đặt parMoves vẫn ra số hữu hạn', () => {
    const noHints = computeScore(input({ hintsAvailable: 0, hintsUsed: 0 }));
    expect(Number.isFinite(noHints)).toBe(true);
    expect(noHints).toBe(MAX_SCORE);
    const noPar = computeScore(input({ parMoves: 0, movesUsed: 99 }));
    expect(Number.isFinite(noPar)).toBe(true);
    expect(noPar).toBe(MAX_SCORE);
  });

  it('level không có mục tiêu ra 0, không ném', () => {
    expect(computeScore(input({ objectivesMet: 0, objectivesTotal: 0 }))).toBe(0);
  });

  it('luôn là số nguyên — điểm lẻ đi vào localStorage rồi hiện ra giao diện', () => {
    for (const moves of [4, 7, 11, 13, 17]) {
      const score = computeScore(input({ movesUsed: moves }));
      expect(Number.isInteger(score)).toBe(true);
    }
  });
});

describe('scoreCeiling', () => {
  it('trần là MAX_SCORE khi level có mục tiêu', () => {
    expect(scoreCeiling(3)).toBe(MAX_SCORE);
  });

  it('trần là 0 khi level không có mục tiêu nào', () => {
    expect(scoreCeiling(0)).toBe(0);
  });
});
