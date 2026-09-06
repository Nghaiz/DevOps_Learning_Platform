/**
 * Đọc một dòng `admin_audit` (`admin.audit.list`) thành câu tiếng Việt — hàm
 * thuần, test được.
 *
 * ## Luật của cả file: nhật ký nói ĐÚNG thứ nó biết, và nói ra chỗ nó không biết
 *
 * `admin_audit.actor_id` cố ý KHÔNG có khoá ngoại tới `users` (chú thích ở
 * `schema.ts` và ở C4): nhật ký sống lâu hơn tài khoản. Hệ quả trực tiếp lên
 * giao diện — **một dòng có thể nêu một id không còn tồn tại**, và cách xử lý
 * đúng là hiện đúng id đó kèm nói rõ nó là một id, KHÔNG phải để trống hay tra
 * ngược ra "người dùng đã xoá" (ta không có bảng nào để tra).
 *
 * `detail` là `jsonb` tự do (`unknown` ở tầng đọc) vì mỗi hành động mang chi
 * tiết khác nhau. Hàm dưới đây đọc được hai hình dạng đã biết và **không giả
 * vờ** hiểu hình dạng thứ ba: hình dạng lạ hiện ra dưới dạng JSON thô, chứ
 * không bị nuốt.
 */

const ACTION_LABEL: Readonly<Record<string, string>> = {
  'user.setRole': 'Đổi vai trò người dùng',
  'session.terminate': 'Kết thúc phiên của người dùng',
};

/**
 * Hành động lạ (một bản BFF mới hơn ghi một `action` FE chưa biết) hiện NGUYÊN
 * chuỗi gốc. Nhật ký mà nuốt một hành động không nhận ra là nhật ký nói dối về
 * chính phạm vi của mình.
 */
export function describeAuditAction(action: string): string {
  if (action.trim() === '') {
    return 'hành động không rõ (dòng nhật ký không ghi action)';
  }
  return ACTION_LABEL[action] ?? action;
}

const TARGET_TYPE_LABEL: Readonly<Record<string, string>> = {
  user: 'Người dùng',
  session: 'Phiên',
};

export function describeAuditTarget(targetType: string, targetId: string): string {
  const type = TARGET_TYPE_LABEL[targetType] ?? targetType;
  return targetId.trim() === '' ? `${type} (không rõ id)` : `${type} ${targetId}`;
}

export interface ActorView {
  readonly text: string;
  /** Câu phụ giải thích vì sao chỉ có id, hiện dưới dạng chú thích cột. */
  readonly note: string;
}

/**
 * Người thực hiện.
 *
 * ⛔ KHÔNG bao giờ trả chuỗi rỗng. Một ô trống ở cột "ai làm" đọc ra là "không
 * ai làm", trong khi sự thật là "có người làm, ta chỉ không tra được tên nữa".
 */
export function describeAuditActor(actorId: string): ActorView {
  if (actorId.trim() === '') {
    return {
      text: 'không rõ',
      note: 'Dòng nhật ký này không ghi id người thực hiện — bản BFF ghi ra nó có lỗi, không phải "không ai làm".',
    };
  }
  return {
    text: actorId,
    note: 'Chỉ có id: bảng nhật ký cố ý không tham chiếu tới bảng người dùng, nên một tài khoản đã xoá vẫn để lại id ở đây.',
  };
}

/**
 * Chi tiết của một dòng.
 *
 * Hai hình dạng đã biết được dịch sang tiếng Việt; mọi hình dạng khác trả JSON
 * thô. Cố "đoán" hình dạng thứ ba sẽ cho ra một câu tự tin và sai — còn JSON
 * thô thì xấu nhưng luôn đúng.
 */
export function describeAuditDetail(action: string, detail: unknown): string {
  if (detail === null || detail === undefined) {
    return 'không có chi tiết';
  }

  if (action === 'user.setRole') {
    const roles = readRoleChange(detail);
    if (roles !== null) {
      return `vai trò: ${roles.from} → ${roles.to}`;
    }
  }

  if (action === 'session.terminate') {
    const terminate = readTerminate(detail);
    if (terminate !== null) {
      return `lý do: ${terminate.reason}, chủ phiên: ${terminate.targetUserId}`;
    }
  }

  return stringifyDetail(detail);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRoleChange(detail: unknown): { from: string; to: string } | null {
  const record = asRecord(detail);
  if (record === null) {
    return null;
  }
  const from: unknown = record['from'];
  const to: unknown = record['to'];
  return typeof from === 'string' && typeof to === 'string' ? { from, to } : null;
}

function readTerminate(detail: unknown): { reason: string; targetUserId: string } | null {
  const record = asRecord(detail);
  if (record === null) {
    return null;
  }
  const reason: unknown = record['reason'];
  if (typeof reason !== 'string') {
    return null;
  }
  const target: unknown = record['targetUserId'];
  // `targetUserId` CÓ THỂ null: `terminateSessionAsAdmin` đọc nó từ response
  // của orchestrator, và orchestrator có thể reap xong mà không trả session.
  return {
    reason,
    targetUserId: typeof target === 'string' && target !== '' ? target : 'không rõ',
  };
}

/**
 * `JSON.stringify` NÉM trên `BigInt` và trên tham chiếu vòng. Cả hai không nên
 * xuất hiện trong `jsonb` đọc lên từ Postgres, nhưng một trang nhật ký mà đổ vỡ
 * vì một dòng dữ liệu lạ là trang vô dụng đúng lúc cần nó nhất.
 */
function stringifyDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail) ?? String(detail);
  } catch {
    return 'chi tiết không đọc được (dữ liệu không chuyển được sang JSON)';
  }
}

/** Thời điểm dạng ngày-giờ địa phương; chuỗi hỏng thành "không rõ", không phải "Invalid Date". */
export function formatAuditMoment(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'không rõ' : at.toLocaleString('vi-VN');
}
