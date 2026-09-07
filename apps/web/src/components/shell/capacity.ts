/**
 * "Còn N chỗ" — NGUỒN DUY NHẤT của ngưỡng sức chứa cho cả ứng dụng.
 *
 * ⛔ **Không hằng số 20 hay 23 ở đây.** Trần mềm được orchestrator TÍNH lúc đọc
 * (`hard − poolTarget`, xem `apps/web/src/server/capacity/get-capacity.ts`),
 * chính vì một con số viết tay cạnh `poolTarget` sẽ mục trong im lặng khi một
 * trong hai vế đổi. Mọi thứ dưới đây suy ra từ payload, không từ trí nhớ.
 *
 * ## Vì sao ngưỡng nằm ở ĐÂY chứ không ở `components/session/capacity.ts`
 *
 * Trước 2026-09-06 có HAI hiện thực `describeCapacity`: vỏ dùng ngưỡng tỉ lệ
 * (20% trần mềm), khung phiên dùng ngưỡng cố định (`LOW_REMAINING = 3`). Với
 * trần mềm 20, cùng một payload `{active: 16}` cho badge trên thanh đầu trang
 * đọc "sắp hết chỗ" trong khi nhãn cạnh nút Bắt đầu ngay bên dưới đọc "còn 4
 * chỗ" bình thường — hai câu mâu thuẫn, cùng màn hình, cùng dữ liệu.
 *
 * Gộp về vỏ chứ không về khung phiên vì (a) một ngưỡng CỐ ĐỊNH mục đúng kiểu
 * `capacitySoftLimit` viết tay mà D5 vừa gỡ khỏi orchestrator — trần đổi thì
 * "sắp hết" đổi nghĩa mà không ai sửa dòng nào — và (b) vỏ nằm trên tất cả và
 * không kéo theo phụ thuộc terminal nào, nên `components/session` tiêu thụ
 * `components/shell` được, chiều ngược lại thì không.
 */

/** Cặp số tối thiểu để nói được câu "còn N chỗ". Dùng chung cho vỏ lẫn khung phiên. */
export interface CapacitySnapshot {
  readonly activeSessions: number;
  readonly softCapacity: number;
}

/**
 * Phần payload `capacity.get` (C4/D5) mà vỏ ứng dụng đọc.
 *
 * Khai theo cấu trúc (không `inferRouterOutputs`) để file này chạy được trong
 * test node thuần, KHÔNG mất cổng kiểu: `use-capacity.tsx` giữ state đúng kiểu
 * output của router và truyền thẳng vào `describeCapacity`, nên BE bỏ một field
 * là đỏ ngay ở chỗ gọi.
 */
export interface CapacityView extends CapacitySnapshot {
  readonly hardCapacity: number;
  readonly fetchedAt: string;
}

/**
 * Sức chứa của MỘT profile sandbox, orchestrator TÍNH lúc đọc từ ResourceQuota
 * (`GetCapacityResponse.profile_capacity`).
 *
 * `slotsTotal` là trần khi quota TRỐNG — mẫu số để nói "còn 6/7" và để ngưỡng
 * "sắp hết" co giãn theo trần THẬT của chính profile đó thay vì một hằng số.
 */
export interface ProfileCapacity {
  readonly slotsFree: number;
  readonly slotsTotal: number;
}

/**
 * Khoá của profile MẶC ĐỊNH — chuỗi RỖNG, cùng quy ước với
 * `CreateSessionRequest.profile` phía orchestrator. Một hằng số có tên chứ
 * không phải `''` rải khắp nơi: `''` đọc ra như một chỗ quên điền.
 */
export const DEFAULT_PROFILE = '';

/**
 * `CapacityView` cộng phần trần THEO PROFILE (P13, vá 2026-09-08).
 *
 * ⛔ VÌ SAO TÁCH RA CHỨ KHÔNG NHÉT THẲNG VÀO `CapacityView`. `CapacityView` là
 * đầu vào của `describeCapacity`, mà hàm đó còn ba chỗ gọi ngoài vỏ
 * (`app/admin/overview-client.tsx`, `components/me/active-sessions.tsx`, và
 * `components/session/capacity.ts` qua `readCapacity`). Thêm field BẮT BUỘC vào
 * kiểu chung sẽ làm chúng đỏ biên dịch ở những file lane này không sở hữu.
 * Kiểu mở rộng giữ được cả hai: vỏ đọc field mới, phần còn lại không đổi dòng nào.
 */
export interface ProfileCapacityView extends CapacityView {
  /** `false` ⇒ `profileCapacity` RỖNG và ta CHƯA BIẾT còn mấy chỗ. */
  readonly quotaReadable: boolean;
  /** Lý do đọc quota hỏng — rỗng khi `quotaReadable`. */
  readonly quotaError: string;
  /** Khoá VẮNG MẶT = chưa biết cho profile đó, KHÔNG phải 0. */
  readonly profileCapacity: Readonly<Record<string, ProfileCapacity>>;
}

/** Mức để tô màu, KHÔNG phải để quyết định chặn — nút Bắt đầu luôn bấm được. */
export type CapacityTone = 'ok' | 'low' | 'full';

/** Phần SỐ HỌC dùng chung: hai nơi hiển thị khác nhau, nhưng cùng một mức. */
export interface CapacityLevel {
  /** `max(0, soft − active)` — số phiên còn nhận được trước khi chạm trần mềm. */
  readonly remaining: number;
  readonly exhausted: boolean;
  readonly tone: CapacityTone;
}

export interface CapacityReading extends CapacityLevel {
  /** Câu ngắn cho badge trên thanh điều hướng. */
  readonly label: string;
  /** Câu đầy đủ: chuyện gì đang xảy ra + làm gì tiếp. Không chứa thời điểm (xem §fetchedAt). */
  readonly detail: string;
}

/**
 * Ngưỡng "sắp hết" là TỈ LỆ, không phải một số phiên cố định.
 *
 * Một ngưỡng cứng ("≤3 chỗ") là đúng hằng số viết tay mà D5 vừa gỡ khỏi
 * orchestrator: trần mềm đổi (thêm node, đổi `poolTarget`) thì "sắp hết" đổi
 * nghĩa mà không ai sửa dòng nào. 20% tự co giãn theo trần thật.
 */
export const LOW_CAPACITY_RATIO = 0.2;

/**
 * Mức từ một cặp số ĐÃ hợp lệ. Hàm TOÀN PHẦN — không có nhánh "chưa biết".
 *
 * Tách khỏi `readCapacity` để `describeCapacity` (đầu vào đã được hai chỗ gọi
 * chặn `null` từ trước) giữ nguyên chữ ký trả về không-null, mà vẫn dùng CHUNG
 * đúng một công thức với khung phiên.
 */
function levelOf(activeSessions: number, softCapacity: number): CapacityLevel {
  // `max(0, …)` vì `soft = hard − poolTarget` có thể ÂM khi ai đó đặt poolTarget
  // lớn hơn trần cứng. "Còn −2 chỗ" là một con số không có nghĩa với người học.
  const remaining = Math.max(0, Math.trunc(softCapacity) - Math.trunc(activeSessions));
  const exhausted = remaining === 0;
  return {
    remaining,
    exhausted,
    tone: exhausted ? 'full' : remaining <= softCapacity * LOW_CAPACITY_RATIO ? 'low' : 'ok',
  };
}

/**
 * `null` = **CHƯA BIẾT**, và nó KHÁC "biết là đã đầy".
 *
 * Query lỗi / chưa chạy / đang tắt đều cho `undefined`, và vẽ chúng thành
 * "Sandbox đang đầy" là bịa ra một sự thật hạ tầng từ một lỗi mạng. Người gọi
 * nhận `null` thì KHÔNG hiện gì cả — im lặng đúng hơn là sai.
 */
export function readCapacity(
  snapshot: CapacitySnapshot | null | undefined,
): CapacityLevel | null {
  if (snapshot == null) {
    return null;
  }
  const { activeSessions, softCapacity } = snapshot;
  // Số không hữu hạn (JSON hỏng, field vắng) cũng là "chưa biết", không phải 0.
  if (!Number.isFinite(activeSessions) || !Number.isFinite(softCapacity)) {
    return null;
  }
  return levelOf(activeSessions, softCapacity);
}

/**
 * Câu cho badge + tooltip, TÍNH TỪ `softCapacity` — đường CŨ.
 *
 * ⚠ NỢ ĐÃ BIẾT, ghi ra chứ không giấu: `softCapacity` = `CAPACITY_HARD_LIMIT −
 * POOL_TARGET`, và trần cứng đó là một hằng số mã hoá giả định "mọi phiên đều
 * là bài thường" — chính con số đã in "Còn 14 chỗ" ngày 2026-09-07 trong lúc
 * `startSession` trả 429 cho một bài IDE. Vỏ ứng dụng ĐÃ chuyển sang
 * `describeProfileCapacity` (đọc ResourceQuota thật, theo từng profile).
 *
 * Hàm này còn sống vì ba chỗ gọi nằm NGOÀI sở hữu của lượt vá này:
 * `app/admin/overview-client.tsx`, `components/me/active-sessions.tsx`, và
 * `components/session/capacity.ts` (qua `readCapacity`). Chúng vẫn hiện con số
 * cũ. Đổi chúng là việc còn lại, không phải một chi tiết đã xong.
 *
 * ⚠ Chữ ký nhận `CapacityView` KHÔNG-null có chủ ý: cả hai chỗ gọi
 * (`capacity-indicator.tsx`, `app-shell.tsx`) đã tự chặn `data === null` và
 * hiện Skeleton/không hiện gì — tức ngữ nghĩa "chưa biết ⇒ không vẽ" đã được
 * giữ ở đó. Muốn dời cổng đó vào đây thì kiểu trả về phải thành
 * `CapacityReading | null` và HAI file kia phải sửa theo.
 */
export function describeCapacity(view: CapacityView): CapacityReading {
  const level = levelOf(view.activeSessions, view.softCapacity);
  const load = `Đang chạy ${String(view.activeSessions)}/${String(view.softCapacity)} phiên (trần cứng ${String(view.hardCapacity)}).`;

  if (level.tone === 'full') {
    return {
      ...level,
      label: 'Hết chỗ',
      // Người dùng gặp 429 mà không được báo trước là lỗi thiết kế (13.B mục 7)
      // — nên câu này phải nói cả việc phải làm, không chỉ tình trạng.
      detail: `${load} Bắt đầu phiên mới lúc này sẽ bị từ chối. Chờ vài phút rồi thử lại, hoặc kết thúc một phiên đang mở ở trang Của tôi.`,
    };
  }

  if (level.tone === 'low') {
    return {
      ...level,
      label: `Chỉ còn ${String(level.remaining)} chỗ`,
      detail: `${load} Sắp hết chỗ — nếu bạn định làm lab, hãy bắt đầu sớm.`,
    };
  }

  return { ...level, label: `Còn ${String(level.remaining)} chỗ`, detail: load };
}

/**
 * Mức sức chứa cho MỘT profile. `null` = **CHƯA BIẾT**, và nó KHÁC "đã đầy".
 *
 * Ba nguồn của "chưa biết", tất cả đều có thật:
 *   · `quotaReadable === false` — orchestrator không đọc được ResourceQuota
 *     (ca thật: Role sandbox thiếu quyền `resourcequotas`, một 403 im lặng);
 *   · khoá vắng mặt — server không khai profile đó, hoặc (với profile mặc định)
 *     namespace thiếu LimitRange nên chi phí một pod là ẩn số;
 *   · số không hữu hạn — payload hỏng.
 *
 * ⛔ KHÔNG rơi về `softCapacity` ở bất kỳ nhánh nào. Chính con số đó đã in
 * "Còn 14 chỗ" ngày 2026-09-07 đúng lúc `startSession` trả 429: nó bằng
 * `CAPACITY_HARD_LIMIT − POOL_TARGET`, mà trần cứng là hằng số mã hoá giả định
 * "mọi phiên đều là bài thường". Một "còn 14 chỗ" sai tệ hơn một "chưa rõ" —
 * người học bấm Bắt đầu rồi ăn 429.
 */
export function readProfileCapacity(
  view: ProfileCapacityView,
  profile: string = DEFAULT_PROFILE,
): CapacityLevel | null {
  if (!view.quotaReadable) {
    return null;
  }
  const slots = view.profileCapacity[profile];
  if (slots == null) {
    return null;
  }
  if (!Number.isFinite(slots.slotsFree) || !Number.isFinite(slots.slotsTotal)) {
    return null;
  }
  const total = Math.max(0, Math.trunc(slots.slotsTotal));
  const remaining = Math.max(0, Math.trunc(slots.slotsFree));
  const exhausted = remaining === 0;
  return {
    remaining,
    exhausted,
    // Cùng ngưỡng TỈ LỆ với `levelOf`, chỉ đổi mẫu số sang trần THẬT của chính
    // profile này: 20% của 7 (bài IDE) khác hẳn 20% của 23 (bài thường), và
    // dùng chung một mẫu số là lại nói sai theo đúng cách cũ.
    tone: exhausted ? 'full' : remaining <= total * LOW_CAPACITY_RATIO ? 'low' : 'ok',
  };
}

/**
 * Câu hiển thị cho sức chứa của MỘT profile. `null` = chưa biết ⇒ người gọi
 * KHÔNG vẽ một con số nào (xem `CapacityIndicator`).
 *
 * Nhãn nói đúng thứ nó biết, không hơn:
 *   · profile mặc định ⇒ ghi rõ **"cho bài thường"** và nêu rằng bài có IDE
 *     hoặc lab Kubernetes có trần RIÊNG, thấp hơn. Vỏ ứng dụng không biết người
 *     dùng sắp mở bài nào, nên một con số trần trụi ở đó là một lời hứa rộng
 *     hơn dữ liệu;
 *   · profile cụ thể ⇒ **"cho bài này"**.
 */
export function describeProfileCapacity(
  view: ProfileCapacityView,
  profile: string = DEFAULT_PROFILE,
): CapacityReading | null {
  const level = readProfileCapacity(view, profile);
  const slots = view.profileCapacity[profile];
  // Kiểm `slots` lần nữa cho trình biên dịch (`noUncheckedIndexedAccess`):
  // `readProfileCapacity` đã loại ca vắng khoá, nhưng kiểu trả về của nó không
  // mang được sự thật đó sang đây.
  if (level === null || slots == null) {
    return null;
  }
  const total = Math.max(0, Math.trunc(slots.slotsTotal));
  const isDefault = profile === DEFAULT_PROFILE;
  const scope = isDefault ? 'cho bài thường' : 'cho bài này';
  const load = `Còn ${String(level.remaining)}/${String(total)} chỗ ${scope}.`;
  // Chỉ dán ở profile mặc định: trên trang một bài cụ thể thì con số ĐÃ đúng
  // bài đó, và nhắc thêm chỉ làm người đọc nghi ngờ con số vừa đọc.
  const note = isDefault
    ? ' Bài có IDE hoặc lab Kubernetes tốn nhiều tài nguyên hơn nên có trần riêng, thấp hơn số này.'
    : '';

  if (level.tone === 'full') {
    return {
      ...level,
      label: 'Hết chỗ',
      // Người dùng gặp 429 mà không được báo trước là lỗi thiết kế (13.B mục 7)
      // — nên câu này phải nói cả việc phải làm, không chỉ tình trạng.
      detail: `${load} Bắt đầu phiên mới lúc này sẽ bị từ chối. Chờ vài phút rồi thử lại, hoặc kết thúc một phiên đang mở ở trang Của tôi.${note}`,
    };
  }
  if (level.tone === 'low') {
    return {
      ...level,
      label: `Chỉ còn ${String(level.remaining)} chỗ`,
      detail: `${load} Sắp hết chỗ — nếu bạn định làm lab, hãy bắt đầu sớm.${note}`,
    };
  }
  return { ...level, label: `Còn ${String(level.remaining)} chỗ`, detail: `${load}${note}` };
}

/**
 * Giờ đọc số liệu, dạng `HH:MM:SS` theo múi giờ trình duyệt.
 *
 * Tách khỏi `describeCapacity` có chủ ý: định dạng thời gian phụ thuộc locale +
 * múi giờ của máy chạy, nên nhét nó vào hàm thuần sẽ biến một test xác định
 * thành một test đỏ tuỳ máy. Trả `null` khi chuỗi không phải thời điểm hợp lệ —
 * hiện "không rõ" còn hơn hiện "Invalid Date".
 */
export function formatFetchedAt(fetchedAt: string): string | null {
  const at = new Date(fetchedAt);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleTimeString('vi-VN');
}
