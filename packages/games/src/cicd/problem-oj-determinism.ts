/**
 * Thân của ô tất định AC-J5, dùng chung cho `node` và `jsdom`.
 *
 * ## Vì sao thân test nằm ngoài file test
 *
 * AC-J5 đòi **cùng `(spec, actions, seed)` cho cùng `GradeResult` ở cả hai môi
 * trường**. Một bộ kỳ vọng chép tay sang hai file chỉ chứng minh được điều đó
 * chừng nào hai bản còn giống nhau — và không có gì gác chuyện đó. Cùng một hàm
 * gọi từ hai file thì hai môi trường không thể chạy hai phép đo khác nhau.
 *
 * `vitest` chọn môi trường bằng docblock `@vitest-environment` ở ĐẦU từng file
 * test (`environmentMatchGlobs` đã bị gỡ ở vitest 4 — nó lọt typecheck rồi im
 * lặng không làm gì). Nên hai vỏ mỏng, một thân.
 */

import { expect } from 'vitest';

import type { Testcase } from '../core/problem.ts';
import { CD_LUI, OJ_WORKFLOW, baiCanary, ojNop } from './problem-oj-fixture.ts';
import { gradeCicdProblem } from './problem-plugin.ts';

/**
 * Số lượt phát lại. Kế hoạch 19.J.1.5 chốt 200.
 *
 * ⚠ Con số này đo một thứ mà một lượt không đo được: bộ mô phỏng phát hành rút
 * ngẫu nhiên qua khoá, nên một hiện thực rò rỉ trạng thái giữa các lượt gọi sẽ
 * đúng ở lượt đầu và trôi dần. Hai lượt bắt được kiểu rò rỉ tức thì; hai trăm
 * lượt bắt được kiểu tích luỹ.
 */
export const SO_LUOT_PHAT_LAI = 200;

const TESTCASES: readonly Testcase[] = [
  { id: 'lui-nhanh', label: 'lui-nhanh', check: 'rollbackUnder', args: { seconds: 120 }, visible: true },
  { id: 'co-clone', label: 'co-clone', check: 'stageExists', args: { stage: 'clone' }, visible: true },
  { id: 'khong-vong', label: 'khong-vong', check: 'graphAcyclic', args: {}, visible: true },
];

/**
 * Chạy AC-J5 ở môi trường hiện hành.
 *
 * `tenMoiTruong` chỉ đi vào thông điệp lỗi, và nó đáng giá đúng lúc ô này đỏ:
 * hai file cho ra hai kết quả khác nhau thì câu hỏi đầu tiên là "bên nào lệch",
 * và một thông điệp không nói ra môi trường bắt người đọc tự dò.
 */
export function chayOTatDinh(tenMoiTruong: string): void {
  const bai = baiCanary();
  const actions = [ojNop(OJ_WORKFLOW, { cd: CD_LUI })];
  const dauVao = { initialState: bai, actions, testcases: TESTCASES, seed: 1 };

  const moc = gradeCicdProblem(dauVao);

  /*
   * Ô này phải khẳng định lượt chấm CHẠY TỚI NƠI trước khi nói nó lặp lại được.
   * Một `CE` cũng tất định — nó lặp lại hoàn hảo 200 lượt — nên thiếu dòng dưới,
   * ô sẽ xanh rực rỡ trên một bộ chấm hỏng hoàn toàn. Đây đúng là hình dạng
   * "một màu xanh chẳng chứng minh gì" mà `rules/green-that-proves-nothing.md`
   * gọi tên.
   */
  expect(moc.verdict, `${tenMoiTruong}: lượt chấm mốc phải chạy tới nơi`).toBe('AC');
  expect(moc.passed.length, `${tenMoiTruong}: phải qua đủ testcase`).toBe(TESTCASES.length);

  for (let lan = 1; lan < SO_LUOT_PHAT_LAI; lan += 1) {
    expect(gradeCicdProblem(dauVao), `${tenMoiTruong}: lượt ${String(lan)} lệch khỏi mốc`).toEqual(
      moc,
    );
  }
}

/**
 * Giá trị mà CẢ HAI môi trường phải thấy, ghim thành số thay vì chỉ so hai lượt
 * với nhau.
 *
 * Hai lượt trong cùng một tiến trình so với nhau chỉ chứng minh hàm thuần TRONG
 * tiến trình đó. Ghim danh sách `passed` là thứ làm `node` và `jsdom` phải đồng ý
 * về cùng một sự thật — không có nó, hai môi trường có thể tất định riêng lẻ mà
 * vẫn cho hai kết quả khác nhau, và đó đúng là ca AC-J5 tồn tại để chặn.
 */
export function chayOKhopMocSo(tenMoiTruong: string): void {
  const ket = gradeCicdProblem({
    initialState: baiCanary(),
    actions: [ojNop(OJ_WORKFLOW, { cd: CD_LUI })],
    testcases: TESTCASES,
    seed: 1,
  });
  expect(ket.passed, tenMoiTruong).toEqual(['lui-nhanh', 'co-clone', 'khong-vong']);
  expect(ket.total, tenMoiTruong).toBe(3);
  expect(ket.verdict, tenMoiTruong).toBe('AC');
}
