/**
 * Ba trục điểm của game **Đường ống CI/CD**, và phân bố nằm dưới ba con số đó.
 *
 * ⛔ `ScoreAxes` (§6 của `contract.ts`) là **kiểu TRẢ VỀ của hàm trong file
 * này**, không phải ba trường được lưu ở đâu cả. Quy ước "No Derived Fields"
 * của repo áp thẳng vào đây, và nó có một hệ quả cụ thể chứ không chỉ là gu
 * thiết kế: nếu ba con số được ghi vào một struct thì test AC-9 bên dưới sẽ so
 * ba TRƯỜNG ĐÃ GHI SẴN thay vì ba phép tính, và một bộ sinh bản ghi ghi cả ba
 * bằng cùng một công thức vẫn làm test đó xanh. Ba trục "độc lập" khi ấy là một
 * lời khai, không phải một phép đo.
 *
 * ## Vì sao p50 cho ① và ②, mà TRUNG BÌNH cho ③
 *
 * ① lead time và ② thông lượng là **độ đo trải nghiệm**: câu hỏi người chơi
 * phải trả lời được là *"một lượt chạy bình thường mất bao lâu"*. Phân bố của
 * hai đại lượng đó là hai đỉnh — lượt không dính đỏ giả, và lượt phải thử lại —
 * nên trung bình rơi vào đúng thung lũng giữa hai đỉnh và mô tả một lượt chạy
 * **chưa từng xảy ra**. Đó là con số tệ nhất có thể đem đi chấm, và nó tệ theo
 * hướng phạt người chơi: một đường ống dưới ngân sách ở 17/20 lượt vẫn trượt vì
 * ba lượt đuôi kéo trung bình lên (xem ô "p50 chứ không trung bình" ở
 * `score.test.ts` — 300 giây so với 480 giây trên cùng một bản ghi).
 *
 * Đuôi KHÔNG bị giấu: `AxisDistribution` trả về cả `p90`, `max` và toàn bộ mẫu
 * để 19.E.4 vẽ. Bài C09 dạy đọc PHÂN BỐ; gộp đuôi vào một con số trung bình là
 * cách chắc chắn nhất để người chơi không bao giờ nhìn thấy nó.
 *
 * ③ runner-phút thì ngược lại, và nó ngược vì bản chất đại lượng: đó là **tài
 * nguyên cộng dồn**, không phải trải nghiệm. Một lượt thử lại nhiều đốt máy
 * thật, và phần đốt thêm đó phải được tính vào — bỏ nó đi bằng p50 là báo cáo
 * mức tiêu tốn thấp hơn mức tiêu tốn thật. Nên ③ lấy trung bình mỗi lượt, đúng
 * như `ScoreAxes.runnerMinutes` khai.
 *
 * ## p50 theo hạng gần nhất, KHÔNG nội suy
 *
 * Với số mẫu chẵn, quy ước phổ biến kia lấy trung bình hai giá trị giữa. Ở đây
 * không dùng, vì hai lý do cùng chiều: (1) con số đem chấm luôn là một giá trị
 * ĐÃ XẢY RA ở một lượt cụ thể, nên người chơi bấm vào biểu đồ là tìm được lượt
 * đó; (2) với phân bố hai đỉnh, trung bình hai giá trị giữa lại rơi vào thung
 * lũng — đúng cái bẫy đoạn trên vừa mô tả, chỉ ở quy mô nhỏ hơn.
 *
 * ## Vì sao hàm nhận thêm `WorkflowSpec`
 *
 * `greenRate` cần biết stage nào `blocking`, và `blocking` là dữ liệu của
 * workflow chứ không có trong bản ghi (`StageInstanceRecord` chỉ mang `stageId`).
 * Suy ngược từ bản ghi là KHÔNG làm được: một stage `blocking` nằm ở cuối đồ thị
 * mà đỏ thì không để lại dấu `upstream-failed` nào, nên nó trông y hệt một stage
 * `blocking: false` đỏ. Nhận thêm workflow là cách duy nhất đúng; đoán là cách
 * sai trong im lặng.
 *
 * ## Vì sao trả `null` chứ không trả ba số 0
 *
 * `EvaluationRecord.error !== null` ⇒ `passes` rỗng ⇒ không có gì để chấm. Trả
 * `{ leadTimeSeconds: 0, throughputPerHour: 0, runnerMinutes: 0 }` thì hai
 * trong ba vị từ chấm (`leadTimeUnder`, `runnerMinutesUnder`) ĐẠT — một
 * workflow có chu trình sẽ chấm ra đường ống nhanh nhất và rẻ nhất có thể. Đó
 * là dạng fallback im lặng mà `development-principles.md` cấm.
 *
 * ## Nhân số trước, chia sau
 *
 * Mọi phép quy đổi đơn vị ở đây nhân tử số trước rồi mới chia. `(3 / 30) * 360`
 * và `(3 * 3600) / (30 * 10)` khác nhau ở bit cuối, và cái sau đúng bằng 36.
 * Test so số bằng `toBe`, nên sai khác một ulp là một ô đỏ không ai đọc ra
 * nguyên nhân.
 */

import { SECONDS_PER_TICK } from './contract.ts';
import type {
  EvaluationRecord,
  PassRecord,
  RunRecord,
  ScoreAxes,
  StageId,
  WorkflowSpec,
} from './contract.ts';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

/**
 * Số commit tối thiểu mỗi lượt để ② còn là một trục **độc lập** với ①.
 *
 * ⛔ Đây không phải một hằng cân bằng độ khó. Với đúng một commit tới ở tick 0
 * thì `throughputPerHour = 3600 / leadTimeSeconds` — một đẳng thức, không phải
 * một quan sát. Ba trục tụt xuống còn hai, và mọi test "ba trục độc lập" chạy
 * trên bản ghi như vậy chỉ chứng minh được một phép chia (xem ô một-commit ở
 * `score.test.ts`, và §6 của `contract.ts`).
 */
export const MIN_COMMITS_FOR_INDEPENDENT_THROUGHPUT = 3;

/**
 * Phân bố của MỘT trục. `p50` là con số đem đi chấm; phần còn lại là thứ
 * 19.E.4 vẽ, và là thứ làm bài C09 nhìn thấy được.
 *
 * Trả cả `samples` chứ không chỉ vài mốc: biểu đồ cần dựng được histogram và
 * CDF, mà từ năm con số thì không dựng được cái nào.
 */
export interface AxisDistribution {
  readonly p50: number;
  readonly p10: number;
  readonly p90: number;
  readonly min: number;
  readonly max: number;
  /** Chỉ ③ dùng số này để chấm. Với ① và ② nó có mặt để so sánh, không để chấm. */
  readonly mean: number;
  readonly count: number;
  /** Mọi mẫu, ĐÃ sắp tăng dần — nên so trong test không phụ thuộc thứ tự lượt. */
  readonly samples: readonly number[];
}

/**
 * Ba trục kèm phân bố đằng sau, cộng hai số thô của `greenRate`.
 *
 * `greenPasses`/`totalPasses` có mặt vì giao diện phải nói được *"17/20 lượt
 * xanh"*. Một tỷ lệ 0,85 không cho biết mẫu lớn bao nhiêu, và 5/6 cũng ra 0,83
 * — hai câu chuyện rất khác nhau về độ tin cậy của con số.
 */
export interface EvaluationSummary {
  readonly axes: ScoreAxes;
  /** Một mẫu mỗi `RunRecord` của mỗi lượt — độ trễ là chuyện của từng commit. */
  readonly leadTimeSeconds: AxisDistribution;
  /** Một mẫu mỗi lượt — thông lượng là chuyện của cả hệ trong một lượt. */
  readonly throughputPerHour: AxisDistribution;
  /** Một mẫu mỗi lượt. */
  readonly runnerMinutes: AxisDistribution;
  readonly greenPasses: number;
  readonly totalPasses: number;
}

function sortedAscending(values: readonly number[]): readonly number[] {
  return [...values].sort((a, b) => a - b);
}

/** `sorted` phải đã sắp tăng dần và không rỗng. */
function percentileOfSorted(sorted: readonly number[], q: number): number {
  const rank = Math.ceil(q * sorted.length);
  const value = sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
  if (value === undefined) {
    // Không tới được: chỉ số đã kẹp trong `[0, length - 1]` và dãy không rỗng.
    // Nhánh này tồn tại vì `noUncheckedIndexedAccess`, và ném chứ không trả 0 —
    // một số 0 lọt vào đây sẽ đi thẳng vào điểm của người chơi.
    throw new Error('percentileOfSorted: chỉ số ngoài dãy — dãy phải không rỗng');
  }
  return value;
}

/**
 * Phân vị theo **hạng gần nhất**: trả về một giá trị CÓ THẬT trong dãy, không
 * nội suy giữa hai mẫu. Lý do ở đầu file.
 *
 * Ném khi dãy rỗng thay vì trả `null` hay `0`: bên gọi nào tới đây với dãy rỗng
 * là đang có lỗi, và một giá trị mặc định sẽ biến lỗi đó thành một con số điểm
 * trông hợp lệ.
 */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) {
    throw new Error('percentile: dãy rỗng — không có phân vị nào để đọc');
  }
  if (!Number.isFinite(q) || q < 0 || q > 1) {
    throw new Error(`percentile: q phải nằm trong [0, 1], nhận ${String(q)}`);
  }
  return percentileOfSorted(sortedAscending(values), q);
}

function describeSamples(values: readonly number[]): AxisDistribution {
  const samples = sortedAscending(values);
  let sum = 0;
  for (const value of samples) {
    sum += value;
  }
  return {
    p50: percentileOfSorted(samples, 0.5),
    p10: percentileOfSorted(samples, 0.1),
    p90: percentileOfSorted(samples, 0.9),
    min: percentileOfSorted(samples, 0),
    max: percentileOfSorted(samples, 1),
    mean: sum / samples.length,
    count: samples.length,
    samples,
  };
}

/**
 * Lead time từng commit, giây.
 *
 * ⚠ KHÔNG kẹp giá trị âm về 0. `finishedTick < arrivalTick` là một lỗi của
 * engine, và kẹp nó sẽ làm một engine hỏng trông như một đường ống nhanh.
 */
function leadTimeSecondSamples(record: EvaluationRecord): readonly number[] {
  const out: number[] = [];
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      out.push((run.finishedTick - run.arrivalTick) * SECONDS_PER_TICK);
    }
  }
  return out;
}

/**
 * Thông lượng từng lượt, commit mỗi giờ.
 *
 * Lượt có `finishedTick <= 0` bị BỎ khỏi mẫu chứ không quy về 0 hay vô cực: nó
 * nghĩa là cả lượt kết thúc ở tick 0, tức không có thời gian nào trôi qua, và
 * "bao nhiêu commit mỗi giờ" không phát biểu được trên một khoảng rỗng.
 */
function throughputPerHourSamples(record: EvaluationRecord): readonly number[] {
  const out: number[] = [];
  for (const pass of record.passes) {
    if (pass.runs.length === 0 || pass.finishedTick <= 0) {
      continue;
    }
    out.push((pass.runs.length * SECONDS_PER_HOUR) / (pass.finishedTick * SECONDS_PER_TICK));
  }
  return out;
}

/** Runner-phút từng lượt: Σ `runnerTicks` của mọi thực thể, quy ra phút. */
function runnerMinuteSamples(record: EvaluationRecord): readonly number[] {
  return record.passes.map((pass) => {
    let ticks = 0;
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        ticks += instance.runnerTicks;
      }
    }
    return (ticks * SECONDS_PER_TICK) / SECONDS_PER_MINUTE;
  });
}

function blockingStageIds(workflow: WorkflowSpec): readonly StageId[] {
  return workflow.stages.filter((stage) => stage.blocking).map((stage) => stage.id);
}

/**
 * Một commit xanh ⇔ **mọi thực thể của stage `blocking` đều `'passed'`**, đúng
 * công thức ở §5 của `contract.ts`.
 *
 * Hai điểm dễ làm sai, cả hai đều hỏng theo hướng báo XANH nhầm:
 *
 * 1. Kết quả của một thực thể là kết quả của LẦN THỬ CUỐI, không phải lần thử
 *    đầu — retry tồn tại để đổi kết quả đó.
 * 2. Một stage `blocking` **vắng mặt hoàn toàn** trong bản ghi sẽ làm vế "mọi
 *    thực thể đều xanh" đúng một cách rỗng. Nên phải kiểm luôn chiều còn lại:
 *    mọi stage `blocking` của workflow phải xuất hiện ít nhất một lần.
 *
 * ⚠ Chiều thứ hai chỉ gác được ở mức STAGE. Một stage đã quạt ra mà thiếu một
 * thực thể con thì ở đây vẫn lọt — phát hiện chuyện đó cần sinh lại tập tổ hợp
 * từ `FanOutSpec`, và đó là việc của engine (A.2), không phải của tầng chấm.
 *
 * `includes` chứ không `Set`: số stage mỗi workflow là vài chục, và hợp đồng
 * §"TẤT ĐỊNH" tránh `Set` để không ai lỡ tay lặp qua nó.
 */
function runIsGreen(run: RunRecord, blocking: readonly StageId[]): boolean {
  const present: StageId[] = [];
  for (const instance of run.instances) {
    if (!blocking.includes(instance.stageId)) {
      continue;
    }
    present.push(instance.stageId);
    if (instance.attempts.at(-1)?.outcome !== 'passed') {
      return false;
    }
  }
  return blocking.every((stageId) => present.includes(stageId));
}

/**
 * Một lượt xanh ⇔ MỌI commit của lượt đó xanh.
 *
 * Lượt không có commit nào là ĐỎ, không phải xanh: "mọi commit đều qua" đúng
 * một cách rỗng ở đó, và một bản ghi rỗng không phải một đường ống tin cậy.
 */
function passIsGreen(pass: PassRecord, blocking: readonly StageId[]): boolean {
  return pass.runs.length > 0 && pass.runs.every((run) => runIsGreen(run, blocking));
}

/**
 * `true` khi MỌI lượt của bản ghi có đủ commit để ② còn độc lập với ①.
 *
 * Dùng ở hai chỗ: test AC-9 khẳng định điều kiện này trên từng nhân chứng đo
 * thông lượng (nên hạ số commit xuống sẽ làm ô đó đỏ, thay vì lặng lẽ biến AC-9
 * thành một phép chia), và tầng kiểm level dùng để chặn một level dạy thông
 * lượng mà chỉ khai một commit.
 */
export function hasIndependentThroughput(record: EvaluationRecord): boolean {
  return (
    record.passes.length > 0 &&
    record.passes.every((pass) => pass.runs.length >= MIN_COMMITS_FOR_INDEPENDENT_THROUGHPUT)
  );
}

/**
 * Tổng hợp `passes` lượt mô phỏng thành ba trục kèm phân bố.
 *
 * `null` = không chấm được: workflow hỏng (`record.error`), không lượt nào, hoặc
 * không lượt nào đọc được thông lượng. Xem đầu file để biết vì sao không phải
 * ba số 0.
 */
export function summarizeEvaluation(
  record: EvaluationRecord,
  workflow: WorkflowSpec,
): EvaluationSummary | null {
  if (record.error !== null || record.passes.length === 0) {
    return null;
  }
  const leadSamples = leadTimeSecondSamples(record);
  const throughputSamples = throughputPerHourSamples(record);
  if (leadSamples.length === 0 || throughputSamples.length === 0) {
    return null;
  }

  const leadTimeSeconds = describeSamples(leadSamples);
  const throughputPerHour = describeSamples(throughputSamples);
  const runnerMinutes = describeSamples(runnerMinuteSamples(record));

  const blocking = blockingStageIds(workflow);
  const greenPasses = record.passes.filter((pass) => passIsGreen(pass, blocking)).length;

  return {
    axes: {
      leadTimeSeconds: leadTimeSeconds.p50,
      throughputPerHour: throughputPerHour.p50,
      // Trung bình, không p50 — xem đầu file: đây là tài nguyên cộng dồn.
      runnerMinutes: runnerMinutes.mean,
      greenRate: greenPasses / record.passes.length,
    },
    leadTimeSeconds,
    throughputPerHour,
    runnerMinutes,
    greenPasses,
    totalPasses: record.passes.length,
  };
}

/**
 * Ba trục ở đơn vị đời thật. `null` khi bản ghi không chấm được.
 *
 * Chỉ là một hình chiếu của `summarizeEvaluation` — cố ý KHÔNG tính lại, để
 * không có hai công thức cho cùng một con số.
 */
export function scoreAxes(record: EvaluationRecord, workflow: WorkflowSpec): ScoreAxes | null {
  return summarizeEvaluation(record, workflow)?.axes ?? null;
}
