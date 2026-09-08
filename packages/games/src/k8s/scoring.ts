/**
 * Chấm điểm 0..1000.
 *
 * ## Ba thành phần, và vì sao trọng số là như vậy
 *
 * | Thành phần | Tối đa | Đo cái gì |
 * |---|---|---|
 * | Mục tiêu | 700 | Có giải được không |
 * | Hiệu quả | 200 | Có hiểu mình đang làm gì không |
 * | Tự lực | 100 | Có tự nghĩ ra không |
 *
 * Mục tiêu chiếm 70% vì giải được bài mới là việc chính; hai phần kia là mức độ.
 * Một người giải xong bằng đường vòng và mở hết gợi ý vẫn được 700 — đủ để thấy
 * mình đã qua, và vẫn thấy rõ khoảng trống để chơi lại.
 *
 * ⛔ KHÔNG chấm theo thời gian. Nghiên cứu upstream đo được rằng đường cong XP
 * của họ cần hơn 80% tổng điểm tới từ việc cày, và nó thưởng thời gian ngồi máy
 * chứ không thưởng năng lực. Thêm một thành phần "nhanh" ở đây sẽ phạt đúng
 * người đọc kỹ `describe` trước khi sửa — mà đó chính là hành vi cả trò chơi này
 * sinh ra để dạy.
 *
 * ⚠ Hàm ở đây THUẦN và chỉ nhận số. Nó không đọc `ClusterState`, không đọc
 * `Level`. Lý do là xác minh: lane G chấm lại điểm từ `RunLog` đã phát lại, và
 * một hàm chấm điểm phụ thuộc trạng thái lúc chạy sẽ cho hai kết quả khác nhau ở
 * hai lần chạy hợp lệ.
 */

export const MAX_SCORE = 1000;

const OBJECTIVE_WEIGHT = 700;
const EFFICIENCY_WEIGHT = 200;
const SELF_RELIANCE_WEIGHT = 100;

export interface ScoreInput {
  /** Số mục tiêu đã đạt (id KHÁC NHAU — bên gọi tự khử trùng). */
  readonly objectivesMet: number;
  readonly objectivesTotal: number;
  /** Số nước đi đã dùng, đếm theo `COMMAND_KINDS` của `reducer.ts`. */
  readonly movesUsed: number;
  readonly parMoves: number;
  readonly hintsUsed: number;
  readonly hintsAvailable: number;
}

/**
 * Phần hiệu quả: đi đúng hoặc ít hơn mốc chuẩn thì ăn trọn; đi nhiều hơn thì
 * giảm theo tỉ lệ `par / moves`.
 *
 * Giảm theo TỈ LỆ chứ không trừ tuyến tính: trừ tuyến tính sẽ về 0 sau vài nước
 * thừa và mọi lượt chơi vụng đều bằng nhau — lúc đó thành phần này không còn
 * phân biệt được "hơi vòng" với "mò mẫm hoàn toàn". Tỉ lệ thì tiệm cận 0 mà
 * không bao giờ chạm, nên vẫn xếp hạng được.
 *
 * ⚠ `parMoves <= 0` (level quên đặt) ⇒ ăn trọn phần này. Chấm 0 sẽ phạt người
 * chơi vì một lỗi dữ liệu mà họ không nhìn thấy và không sửa được.
 */
function efficiencyScore(input: ScoreInput): number {
  if (input.parMoves <= 0) {
    return EFFICIENCY_WEIGHT;
  }
  if (input.movesUsed <= input.parMoves) {
    return EFFICIENCY_WEIGHT;
  }
  // `ceil`, KHÔNG phải `round`. Với `round` thì tỉ lệ dưới 0,5 điểm làm tròn về
  // 0 và phần này CHẠM đáy — hai người chơi ở 3000 và 30000 nước đi ăn cùng một
  // số điểm, tức là thang đo chết ở đúng chỗ nó đáng phân biệt nhất. `ceil` giữ
  // tối thiểu 1 điểm chừng nào `parMoves > 0`, nên đường cong tiệm cận mà không
  // bao giờ chạm — đúng như đoạn chú thích ở trên nói.
  return Math.ceil(EFFICIENCY_WEIGHT * (input.parMoves / input.movesUsed));
}

/**
 * Phần tự lực: mở gợi ý nào thì mất phần tương ứng.
 *
 * ⚠ Level KHÔNG có gợi ý (`hintsAvailable === 0`) ⇒ ăn trọn. Chia cho 0 ở đây sẽ
 * ra `NaN`, và một `NaN` lọt vào `score` sẽ đi thẳng vào `localStorage`, rồi
 * `JSON.stringify` biến nó thành `null`, rồi `parseRun` loại cả bản ghi — mất
 * nguyên một lượt chơi vì một phép chia. Đó là dạng hỏng đi qua bốn tầng mới lộ.
 */
function selfRelianceScore(input: ScoreInput): number {
  if (input.hintsAvailable <= 0) {
    return SELF_RELIANCE_WEIGHT;
  }
  const used = Math.min(Math.max(0, input.hintsUsed), input.hintsAvailable);
  return Math.round(SELF_RELIANCE_WEIGHT * (1 - used / input.hintsAvailable));
}

function objectiveScore(input: ScoreInput): number {
  if (input.objectivesTotal <= 0) {
    return 0;
  }
  const met = Math.min(Math.max(0, input.objectivesMet), input.objectivesTotal);
  return Math.round(OBJECTIVE_WEIGHT * (met / input.objectivesTotal));
}

/**
 * ⚠ Hai phần "mức độ" chỉ được cộng khi đã đạt HẾT mục tiêu.
 *
 * Không có ràng buộc này thì một người chơi bỏ ngang ở nước đi đầu tiên — 0 mục
 * tiêu, 0 nước đi, 0 gợi ý — vẫn ăn 300 điểm cho "hiệu quả tuyệt đối và hoàn
 * toàn tự lực". Đó là điểm cao nhất của bảng dành cho việc không làm gì cả, và
 * là đường gian lận rẻ nhất còn lại sau khi đã có xác minh phát lại.
 */
export function computeScore(input: ScoreInput): number {
  const objectives = objectiveScore(input);
  const complete = input.objectivesTotal > 0 && input.objectivesMet >= input.objectivesTotal;
  const total = complete ? objectives + efficiencyScore(input) + selfRelianceScore(input) : objectives;
  return Math.min(MAX_SCORE, Math.max(0, Math.round(total)));
}

/**
 * Trần điểm của một level. Lane G dùng nó cho phép kiểm tính hợp lý §8.4.2 —
 * một `score` vượt trần là bằng chứng bản lưu đã bị sửa tay.
 *
 * Trần luôn là `MAX_SCORE` với mọi level có mục tiêu: chơi hoàn hảo thì ăn trọn
 * cả ba phần. Hàm này tồn tại để lane G không phải GIẢ ĐỊNH điều đó — nếu sau
 * này có level tính điểm khác, chỗ sửa là đây và phép kiểm kia tự đúng theo.
 */
export function scoreCeiling(objectivesTotal: number): number {
  return objectivesTotal > 0 ? MAX_SCORE : 0;
}
