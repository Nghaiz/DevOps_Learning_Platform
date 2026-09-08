/**
 * Ranh giới trong lòng máy mô phỏng, giữa hai lane chạy song song.
 *
 * ⛔ Lead sở hữu. Sinh ra 2026-09-08 khi lane B chạm trần lượt ba lần liên tiếp
 * mà chưa tới `reducer.ts` — đường găng bị nghẽn ở một lane. Tách đôi:
 *
 * | Lane | Sở hữu |
 * |---|---|
 * | B  | `reducer.ts` · `tick.ts` · `session.ts` · `scoring.ts` |
 * | B2 | `predicates.ts` · `incidents.ts` · `kubectl.ts` |
 *
 * Cả hai ĐỌC `model.ts` / `query.ts` / `health.ts` / `scheduler.ts` /
 * `controllers.ts` (lane B đã viết, coi như đóng băng). Ba chữ ký dưới đây là
 * chỗ hai lane gặp nhau; sửa lén một cái = một lane biên dịch xanh trong khi
 * lane kia hiểu khác.
 */

import type { IncidentKind, ResourceRef } from './contract.ts';
import type { PredicateName } from './predicate-names.ts';
import type { ClusterState } from './model.ts';

// ── Vị từ ───────────────────────────────────────────────────────────────────

/**
 * THUẦN và CHỈ ĐỌC. Vị từ không bao giờ đổi state — nó chỉ trả lời "mục tiêu
 * này đã đạt chưa" tại một thời điểm. Một vị từ có tác dụng phụ sẽ làm phát lại
 * ra kết quả khác lần chơi thật, và cả cơ chế chống gian lận sụp theo.
 *
 * `args` là bộ tham số ghi trong comment của từng tên ở `predicate-names.ts`.
 * Thiếu tham số bắt buộc thì trả `false`, KHÔNG ném: một level viết sai không
 * được phép làm sập cả phiên chơi của người dùng.
 */
export type Predicate = (state: ClusterState, args: Readonly<Record<string, unknown>>) => boolean;

export type PredicateTable = Readonly<Record<PredicateName, Predicate>>;

// ── Sự cố ───────────────────────────────────────────────────────────────────

export interface IncidentDefinition {
  readonly kind: IncidentKind;
  /**
   * Tiếng Việt, một câu: TRIỆU CHỨNG người chơi quan sát được — không phải
   * nguyên nhân. Đây là thứ hiện ở event log, và nói thẳng nguyên nhân ra đây
   * là xoá mất phần chẩn đoán, tức xoá mất bài học.
   */
  readonly symptom: string;
  /**
   * Gieo sự cố. THUẦN: trả state mới.
   *
   * KHÔNG nhận tham số rng — `ClusterState.rng` đã mang sẵn con trỏ PRNG, và
   * hàm này trả về state mới kèm `rng` đã tiến. Truyền rng riêng bên ngoài sẽ
   * tạo ra hai nguồn ngẫu nhiên và giết tính tất định mà chống gian lận dựa vào.
   */
  inject(state: ClusterState, target: ResourceRef): ClusterState;
  /**
   * Sự cố còn hoạt động không? Dùng cho vị từ `no-incident-active`, cho chaos
   * mode, và cho việc chấm "người chơi đã thật sự sửa hay chỉ xoá đi làm lại".
   */
  isActive(state: ClusterState, target: ResourceRef): boolean;
}

export type IncidentTable = Readonly<Record<IncidentKind, IncidentDefinition>>;

// ── kubectl ─────────────────────────────────────────────────────────────────

/**
 * ⚠ Hình dạng này lấy TỪ mã lane B đã viết (`reducer.ts` gọi
 * `runCommand(state, command, namespace)`), không phải từ một thiết kế mới.
 * Hợp đồng chạy theo mã đang chạy, không bắt mã chạy theo hợp đồng vừa nghĩ ra.
 */
export interface CommandOutcome {
  /** State sau lệnh. Lệnh chỉ đọc trả về đúng tham chiếu đã nhận. */
  readonly state: ClusterState;
  /**
   * Văn bản trả cho người chơi. Lệnh đọc (`get`, `describe`, `logs`) bắt chước
   * định dạng kubectl thật vì đó là thứ người học sẽ gặp ngoài đời; lệnh lỗi
   * thì giải thích bằng tiếng Việt CHUYỆN GÌ xảy ra và LÀM GÌ TIẾP.
   *
   * ⛔ Không bao giờ để lọt ra một chuỗi kiểu `context deadline exceeded`. Đó là
   * thứ đúng cho log và vô nghĩa cho người học — repo đã trả giá cho đúng lỗi
   * này (`phase-14.md` §14.C.8).
   */
  readonly output: string;
  /** `false` = sai cú pháp hoặc không áp dụng được. Vẫn KHÔNG ném. */
  readonly accepted: boolean;
}

export type RunCommand = (
  state: ClusterState,
  command: string,
  namespace: string,
) => CommandOutcome;
