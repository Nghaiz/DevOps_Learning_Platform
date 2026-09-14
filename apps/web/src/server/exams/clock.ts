/**
 * Đồng hồ kỳ thi — hàm THUẦN, và mọi mốc thời gian đi qua đây.
 *
 * ## Vì sao một module riêng thay vì vài phép cộng rải rác
 *
 * Ô nghiệm thu **AC-7** đo hai thứ mà chỉ một nguồn thời gian duy nhất mới giữ
 * được: đổi giờ máy khách không làm đếm ngược nhảy, và đóng tab lúc còn một
 * phút thì mở lại đã hết giờ. Cả hai hỏng theo cùng một kiểu nếu phép tính hạn
 * nằm ở ba chỗ và một chỗ quên `closes_at`.
 *
 * Memory dự án có hai vết đã cắn đúng chỗ này: VM ngủ làm vỡ ô nghiệm thu treo
 * theo đồng hồ, và đồng hồ VM lệch ~59 giây so với máy chủ. Trong chế độ thi
 * thì lệch NHỎ nguy hơn lệch lớn, vì con số vẫn trông hợp lý.
 *
 * ## ⛔ `now` là THAM SỐ, không phải `Date.now()` gọi bên trong
 *
 * Không phải để cho dễ test (tuy nó cũng làm được thế). Lý do thật: một hàm
 * đọc đồng hồ bên trong thì KHÔNG đo được — mọi ô nghiệm thu về "hết giờ" sẽ
 * phải ngủ thật, và một ô ngủ thật là một ô sẽ bong tróc dưới tải song song.
 * Tham số hoá là cách duy nhất khẳng định hành vi ở đúng mốc hạn.
 */

const MS_PER_MINUTE = 60_000;

export interface AttemptClock {
  readonly startedAt: Date;
  /**
   * ẢNH CHỤP thời lượng lúc mở lượt, KHÔNG đọc lại từ `exams`. Xem chú thích
   * cột ở `schema.ts` § `exam_attempts.duration_minutes`.
   */
  readonly durationMinutes: number;
  /** `null` = chưa bấm nộp. KHÔNG có nghĩa là còn giờ. */
  readonly submittedAt: Date | null;
}

/**
 * Hạn thật của một lượt: cái nào TỚI TRƯỚC giữa đồng hồ riêng của lượt và hạn
 * chót của cả kỳ thi.
 *
 * `closesAt = null` nghĩa là kỳ thi không có hạn tuyệt đối, chứ không phải
 * "không có hạn": đồng hồ riêng vẫn chạy.
 *
 * ⚠ Thiếu vế `closesAt` thì một sinh viên mở lượt trước lúc đóng đề 1 phút vẫn
 * được trọn thời lượng — tức là thi sau khi đề đã đóng. Đó là lý do hàm này
 * nhận `closesAt` chứ không chỉ nhận `attempt`.
 */
export function attemptDeadline(attempt: AttemptClock, closesAt: Date | null): Date {
  const own = new Date(attempt.startedAt.getTime() + attempt.durationMinutes * MS_PER_MINUTE);
  if (closesAt === null) {
    return own;
  }
  return own.getTime() <= closesAt.getTime() ? own : closesAt;
}

/**
 * Còn bao nhiêu mili-giây. Không bao giờ âm — hết giờ là `0`.
 *
 * Một lượt ĐÃ nộp trả `0`: câu hỏi "còn bao lâu" không còn nghĩa sau khi nộp,
 * và trả một số dương ở đó sẽ làm giao diện vẽ tiếp một đồng hồ đang chạy cho
 * một bài đã khoá.
 */
export function remainingMs(attempt: AttemptClock, closesAt: Date | null, now: Date): number {
  if (attempt.submittedAt !== null) {
    return 0;
  }
  const left = attemptDeadline(attempt, closesAt).getTime() - now.getTime();
  return left > 0 ? left : 0;
}

/** Lượt đã khoá chưa — vì đã nộp, hoặc vì hết giờ. */
export function isAttemptClosed(
  attempt: AttemptClock,
  closesAt: Date | null,
  now: Date,
): boolean {
  return (
    attempt.submittedAt !== null || now.getTime() >= attemptDeadline(attempt, closesAt).getTime()
  );
}

/**
 * Mốc nộp HIỆU LỰC, dùng cho bảng điểm và CSV.
 *
 * Hết giờ mà chưa bấm nộp thì mốc nộp là đúng HẠN, không phải `now`. Nếu trả
 * `now` thì cùng một lượt đọc ra hai mốc khác nhau ở hai lần mở bảng điểm, và
 * cột "nộp lúc" của một bài bỏ dở sẽ trôi theo thời điểm giảng viên bấm F5.
 *
 * `null` = còn giờ và chưa nộp.
 */
export function effectiveSubmittedAt(
  attempt: AttemptClock,
  closesAt: Date | null,
  now: Date,
): Date | null {
  if (attempt.submittedAt !== null) {
    return attempt.submittedAt;
  }
  const deadline = attemptDeadline(attempt, closesAt);
  return now.getTime() >= deadline.getTime() ? deadline : null;
}

/**
 * Lượt này TỰ nộp hay người ta bấm nộp — SUY ra, không đọc cột.
 *
 * `schema.ts` cố ý không có cột `auto_submitted`, và đây là phép suy thay cho
 * nó: nộp tay luôn xảy ra TRƯỚC hạn vì đường nộp từ chối sau hạn, còn lượt tự
 * nộp thì mốc hiệu lực đúng BẰNG hạn. Hai ca không chồng nhau.
 *
 * ⚠ Ranh giới là `>=`, không phải `>`. Một lượt bấm nộp đúng mili-giây cuối
 * cùng đọc ra là "tự nộp", và đó là ca duy nhất phép suy này không phân biệt
 * được. Cái giá: một dòng trong bảng điểm mang nhãn sai ở xác suất gần bằng 0.
 * Cái được: không có một cột cờ thứ hai có thể lệch khỏi hai cột thời gian.
 *
 * `null` = chưa khoá, câu hỏi chưa có nghĩa.
 */
export function wasAutoSubmitted(
  attempt: AttemptClock,
  closesAt: Date | null,
  now: Date,
): boolean | null {
  const submitted = effectiveSubmittedAt(attempt, closesAt, now);
  if (submitted === null) {
    return null;
  }
  return submitted.getTime() >= attemptDeadline(attempt, closesAt).getTime();
}

/**
 * Kỳ thi đã mở chưa, theo đồng hồ MÁY CHỦ.
 *
 * Tách khỏi `isAttemptClosed` vì nó trả lời câu khác: "được phép BẮT ĐẦU
 * chưa", chứ không phải "lượt đang chạy đã hết chưa".
 */
export function isExamOpen(
  window: { readonly opensAt: Date | null; readonly closesAt: Date | null },
  now: Date,
): boolean {
  if (window.opensAt !== null && now.getTime() < window.opensAt.getTime()) {
    return false;
  }
  if (window.closesAt !== null && now.getTime() >= window.closesAt.getTime()) {
    return false;
  }
  return true;
}
