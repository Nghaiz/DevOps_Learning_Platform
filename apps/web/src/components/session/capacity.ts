/**
 * C5 — "còn N chỗ **cho bài NÀY**" cho khung phiên dùng chung.
 *
 * ⛔ **Ngưỡng KHÔNG nằm ở đây, và bảng ánh xạ profile cũng không.** Số học (số
 * còn lại, mức `ok`/`low`/`full`, ngữ nghĩa "chưa biết") sống ở
 * `components/shell/capacity.ts`; file này chỉ là lớp CHỮ: nhãn cạnh nút Bắt
 * đầu + câu cảnh báo trước khi bấm. Còn việc "bài này thuộc profile nào" là
 * quyết định của MÁY CHỦ (`server/lessons/catalog.ts` → `profileForCapabilities`)
 * và được truyền xuống dưới dạng một chuỗi — xem `app/lessons/[id]/page.tsx`.
 *
 * ## Vì sao file này đổi (2026-09-08)
 *
 * Ngày 2026-09-07 giao diện in **"Còn 14 chỗ"** ngay cạnh nút Bắt đầu ĐÚNG LÚC
 * `lessons.startSession` trả **429**. Không mâu thuẫn — hai bên đếm hai thứ
 * khác nhau: con số kia là `softCapacity − active`, mà `softCapacity` suy từ
 * `CAPACITY_HARD_LIMIT = 23 = 5952Mi ÷ 256Mi`, tức nó mã hoá giả định "mọi
 * phiên đều là bài thường". Bài đang mở là bài IDE (768Mi) và quota lúc đó chỉ
 * còn 576Mi. Một con số đúng cho một câu hỏi không ai hỏi.
 *
 * Nên `describeCapacity` nay nhận CẢ profile của bài và đọc
 * `profile_capacity` — trần mà orchestrator tính từ ResourceQuota + LimitRange
 * ngay lúc gọi (`5135cf9`). Không còn đường nào để nó trả lời bằng con số của
 * profile mặc định cho một bài không phải profile mặc định.
 *
 * ## Ba trạng thái, không phải hai
 *
 * `null` (không vẽ gì) · `known: false` ("Chưa rõ sức chứa") · `known: true`.
 * Trạng thái giữa là trạng thái mới và là lý do file này không còn trả
 * `CapacityHint | null` phẳng: **quota đọc lỗi thì tuyệt đối KHÔNG rơi về
 * `softCapacity`** — chính con số đó đã nói dối hôm 2026-09-07. Một "còn 14
 * chỗ" sai tệ hơn một "chưa rõ".
 *
 * Hàm THUẦN, tách khỏi React, vì thứ cần gác ở đây là NGỮ NGHĨA của con số —
 * đặc biệt là hai ranh giới "chưa biết" vs "biết là 0" và "profile này" vs
 * "profile mặc định". Đọc ngược nó ra từ DOM là đo qua một lớp trung gian
 * không liên quan.
 */

import { t } from '@devops-platform/copy';
import { DEFAULT_PROFILE, describeProfileCapacity } from '../shell/capacity';

// Cùng MỘT kiểu, không phải hai kiểu trùng hình dạng: C5 giữ tên, vỏ giữ định
// nghĩa. Khai lại ở đây là mở lại đúng khe hở vừa bịt.
export type {
  CapacitySnapshot,
  CapacityTone,
  ProfileCapacity,
  ProfileCapacityView,
} from '../shell/capacity';
export { DEFAULT_PROFILE } from '../shell/capacity';

import type { CapacityTone, ProfileCapacityView } from '../shell/capacity';

/** Sức chứa ĐÃ ĐỌC ĐƯỢC cho đúng profile của bài đang mở. */
export interface KnownCapacityHint {
  readonly known: true;
  readonly remaining: number;
  readonly exhausted: boolean;
  readonly tone: CapacityTone;
  /** Nhãn ngắn cạnh nút Bắt đầu. */
  readonly label: string;
  /** Câu đầy đủ (`Còn 6/7 chỗ cho bài này.`) — dùng làm `title` của badge. */
  readonly detail: string;
  /** Câu cảnh báo hiện TRƯỚC khi bấm; `null` khi còn chỗ. */
  readonly warning: string | null;
}

/**
 * Có payload, nhưng KHÔNG biết còn mấy chỗ cho bài này.
 *
 * ⛔ Đây KHÔNG phải "đầy". `exhausted` cố ý không tồn tại trên nhánh này để
 * một chỗ gọi cẩu thả (`hint.exhausted`) đỏ ở TypeScript thay vì lặng lẽ đọc
 * `undefined` thành `false` — hoặc tệ hơn, thành `true`.
 */
export interface UnknownCapacityHint {
  readonly known: false;
  readonly label: string;
  readonly detail: string;
}

export type CapacityHint = KnownCapacityHint | UnknownCapacityHint;

const UNKNOWN_LABEL = t('session.capacity.unknown-label');

/**
 * Vì sao KHÔNG biết — nói ra chứ không nuốt.
 *
 * Ba nguồn đều có thật: quota đọc lỗi (403 vì Role sandbox thiếu quyền
 * `resourcequotas` — đúng tình trạng cụm trước khi `helm upgrade` mang RBAC
 * mới lên), server không khai profile đó, payload hỏng.
 */
function unknownDetail(view: ProfileCapacityView, profile: string): string {
  const why = !view.quotaReadable
    ? view.quotaError === ''
      ? t('session.capacity.why-quota-unreadable')
      : t('session.capacity.why-quota-error', { error: view.quotaError })
    : t('session.capacity.why-no-profile-cap');

  return profile === DEFAULT_PROFILE
    ? t('session.capacity.unknown-default', { why })
    : t('session.capacity.unknown-profile', { why });
}

/**
 * Nhãn + cảnh báo cho ĐÚNG profile của bài đang mở.
 *
 * `null` = chưa có payload nào (query lỗi / chưa chạy / đang tắt) ⇒ người gọi
 * KHÔNG vẽ gì. Im lặng đúng hơn là sai — và nó khác hẳn `known: false`, là
 * trạng thái "có payload, nhưng payload nói chính nó không biết".
 *
 * `profile` là chuỗi mà `profileForCapabilities` phía máy chủ trả về (`''` =
 * bài thường, `ide`, `k8s`, `k8s-multinode`). ⛔ **Không suy nó ở đây.** Bảng
 * ánh xạ `capabilities → profile` sống đúng MỘT chỗ, trong `server/lessons/
 * catalog.ts`, vì chính nó quyết định pod thật xin bao nhiêu RAM; một bản chép
 * ở FE là hai bảng sẽ trôi khỏi nhau, và lần trôi đó sẽ lại in một con số sai
 * cạnh một nút bấm hỏng.
 */
export function describeCapacity(
  view: ProfileCapacityView | null | undefined,
  profile: string = DEFAULT_PROFILE,
): CapacityHint | null {
  if (view == null) {
    return null;
  }

  const reading = describeProfileCapacity(view, profile);
  if (reading === null) {
    return { known: false, label: UNKNOWN_LABEL, detail: unknownDetail(view, profile) };
  }

  return {
    known: true,
    remaining: reading.remaining,
    exhausted: reading.exhausted,
    tone: reading.tone,
    // Nhãn lấy NGUYÊN của vỏ, không viết lại: hai câu chữ cho cùng một mức là
    // hai câu sẽ lệch nhau (đã xảy ra một lần — xem chú thích ở vỏ).
    label: reading.label,
    detail: reading.detail,
    warning: reading.exhausted ? exhaustedWarning(profile) : null,
  };
}

/**
 * Câu cảnh báo TRƯỚC khi bấm, và nó phải không nói dối theo CẢ HAI CHIỀU.
 *
 * `slots_free` là **cận dưới** có chủ ý: orchestrator không cộng pod đang ấm
 * trong `pool:free` vào đó. Nên "0 chỗ" KHÔNG chứng minh là sẽ bị từ chối, và
 * chặn cứng nút Bắt đầu ở đây là từ chối nhầm một người học trong khi chỗ đang
 * có thật. Ngược lại, im lặng cho họ bấm rồi ăn 429 trần trụi là lỗi thiết kế
 * mà 13.B mục 7 đã gọi tên. Nên: vẫn bấm được, nhưng nói trước, và nói rõ vì
 * sao con số có thể bi quan.
 */
function exhaustedWarning(profile: string): string {
  return profile === DEFAULT_PROFILE
    ? t('session.capacity.exhausted-default')
    : t('session.capacity.exhausted-profile');
}
