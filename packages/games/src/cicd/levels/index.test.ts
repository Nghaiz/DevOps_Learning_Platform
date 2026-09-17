import { describe, expect, it } from 'vitest';
import { CD_LEVELS, CD_LEVELS_MUON, CD_LEVELS_SOM, CI_LEVELS, CI_LEVELS_MUON, CI_LEVELS_SOM, CICD_LEVELS } from './index.ts';

/**
 * Ô gác phép GỘP, không gác nội dung level.
 *
 * Nội dung của từng level đã có `ci-som.test.ts` và `ci-muon.test.ts` lo, và
 * chúng chạy engine thật trên cả hai lời giải. File này chỉ hỏi một câu mà hai
 * file kia KHÔNG hỏi được: **phép gộp có mất nửa nào không.**
 *
 * ## Ô này đỏ khi nào
 *
 * | Nếu hỏng thế này | Vế đỏ |
 * |---|---|
 * | Một nửa bị đè mất lúc gộp | số lượng, và `chứa đủ cả hai nửa` |
 * | Gộp nhầm thứ tự (muộn trước sớm) | `thứ tự chơi` |
 * | Một lane chép nhầm id của lane kia | `id duy nhất` |
 * | Thêm nửa thứ ba mà quên sửa ô ghim | số lượng |
 *
 * Vế cuối là chủ ý: ô ghim số lượng SẼ cản đường người thêm chương mới, và đó
 * đúng là việc của nó. Nới nó là một thao tác có ý thức, kèm một dòng giải
 * thích; quên nó thì đỏ, không phải im lặng.
 */
describe('gộp chương CI', () => {
  it('đủ 14 level, và hai nửa cộng lại đúng bằng tổng', () => {
    expect(CI_LEVELS_SOM.length).toBe(7);
    expect(CI_LEVELS_MUON.length).toBe(7);
    expect(CI_LEVELS.length).toBe(14);
    expect(CI_LEVELS.length).toBe(CI_LEVELS_SOM.length + CI_LEVELS_MUON.length);
  });

  it('chứa đủ cả hai nửa, không nửa nào bị đè mất', () => {
    for (const level of CI_LEVELS_SOM) {
      expect(CI_LEVELS, `thiếu ${level.id} của nửa đầu`).toContain(level);
    }
    for (const level of CI_LEVELS_MUON) {
      expect(CI_LEVELS, `thiếu ${level.id} của nửa sau`).toContain(level);
    }
  });

  it('id duy nhất', () => {
    const ids = CI_LEVELS.map((level) => level.id);
    expect(new Set(ids).size, `trùng id: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('thứ tự chơi: nửa đầu đứng trước nửa sau', () => {
    /*
     * Không so cả mảng id bằng một danh sách chép tay: một danh sách như vậy
     * phải sửa mỗi lần đổi tên level, và cái đáng gác ở đây là QUAN HỆ giữa hai
     * nửa chứ không phải tên từng level.
     */
    const viTriCuoiCuaSom = CI_LEVELS.indexOf(CI_LEVELS_SOM[CI_LEVELS_SOM.length - 1]!);
    const viTriDauCuaMuon = CI_LEVELS.indexOf(CI_LEVELS_MUON[0]!);
    expect(viTriCuoiCuaSom).toBeLessThan(viTriDauCuaMuon);
  });

  it('mọi level đều thuộc chương ci', () => {
    for (const level of CI_LEVELS) {
      expect(level.chapter, `${level.id} khai sai chương`).toBe('ci');
    }
  });

  it('C07 và C08 đứng cạnh nhau, đúng thứ tự', () => {
    /*
     * Hai level này là một CẶP: C07 dạy khoá quá rộng (không bao giờ trúng),
     * C08 dạy khoá quá hẹp (trúng một bản đã ôi). Tách chúng ra hay đảo thứ tự
     * là làm hỏng bài học, vì người chơi cần gặp hướng sai thứ nhất rồi mới hiểu
     * vì sao hướng sai thứ hai lại là một hướng sai KHÁC chứ không phải cùng một
     * lỗi nói lại.
     */
    const viTriC07 = CI_LEVELS.findIndex((level) => level.id.includes('c07'));
    const viTriC08 = CI_LEVELS.findIndex((level) => level.id.includes('c08'));
    expect(viTriC07).toBeGreaterThanOrEqual(0);
    expect(viTriC08).toBe(viTriC07 + 1);
  });
});

/**
 * Gộp chương CD và gộp cả game. Ô ghim SỐ LƯỢNG (7 + 7 = 14, tổng 28) được lead
 * thêm khi gộp hai lane — trước đó hai nửa còn rỗng và ô ghim sẽ đỏ vì một lý do
 * đã biết. Các vế dưới đây đúng ở mọi thời điểm.
 */
describe('gộp chương CD và cả game', () => {
  it('chứa đủ cả hai nửa CD, nửa đầu trước nửa sau', () => {
    expect(CD_LEVELS).toEqual([...CD_LEVELS_SOM, ...CD_LEVELS_MUON]);
  });

  it('cả game = CI rồi CD, id duy nhất trên toàn bộ', () => {
    expect(CICD_LEVELS).toEqual([...CI_LEVELS, ...CD_LEVELS]);
    const ids = CICD_LEVELS.map((level) => level.id);
    expect(new Set(ids).size, `trùng id: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('mọi level CD thuộc chương cd, và KHÔNG level CI nào mang khối `cd`', () => {
    for (const level of CD_LEVELS) expect(level.chapter, level.id).toBe('cd');
    for (const level of CI_LEVELS) expect(level.cd, level.id).toBeUndefined();
  });
});
