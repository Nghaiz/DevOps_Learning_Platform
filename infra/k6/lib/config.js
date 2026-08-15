// Cấu hình + tiện ích dùng chung cho hai kịch bản k6 của chặng P3/3.F.
//
// ⛔ VÌ SAO k6 CHẠY TRÊN WINDOWS, KHÔNG TRÊN VM VÀ KHÔNG TRONG CỤM (plan 3.F §F1).
// Cụm lab chỉ có 8 vCPU. Một generator tải nằm CÙNG CHỖ với hệ nó đang đo sẽ ăn
// đúng phần CPU mà nó đang đo — số ra thấp hơn thực tế và không cách nào biết
// thấp bao nhiêu. Chạy ngoài là điều kiện để con số có nghĩa, không phải để tiện.
//
// ⛔ MODULE WS: `k6/net/websockets` KHÔNG tồn tại ở k6 v2.2.0 — k6 báo
// `unknown dependency` rồi cố provision một binary tuỳ biến, và thông báo đó đọc
// ra y hệt lỗi mạng. Hai module chạy được là `k6/ws` và
// `k6/experimental/websockets`. Xem `edge.js` để biết vì sao cuối cùng KHÔNG
// module nào được dùng.

export const TARGET = __ENV.TARGET || 'https://dlp.192.168.94.130.sslip.io:30443';
export const ORIGIN = __ENV.ORIGIN || TARGET;

// Số user tối đa kịch bản `ceiling` sẽ thử. Phải LỚN HƠN trần dự kiến, nếu không
// thì "không thấy lượt bị từ chối" không phân biệt được với "hết user để thử" —
// và hai thứ đó cho CÙNG một kết quả quan sát được.
//
// ⚠ 3.I mắt 5 nâng trần 3 → 20 phiên. Giá trị cũ (6) giờ NHỎ HƠN trần, tức kịch
// bản sẽ cạn user trước khi hệ kịp từ chối và ô AC-F1 sẽ ghi một trần GIẢ bằng
// đúng số user có sẵn. Mỗi lần nới quota phải nâng số này lên trên trần mới.
export const MAX_ATTEMPTS = Number(__ENV.MAX_ATTEMPTS || 26);

// TTL của session tạo ra trong lượt đo. Đủ dài để giữ pod suốt lượt, đủ ngắn để
// một lượt chạy hỏng không ghim pod tới hàng giờ.
export const TTL_SECONDS = Number(__ENV.TTL_SECONDS || 600);

// Nhịp giữa hai lượt `session.create`. Trần rate-limit web là 120/1m burst 60,
// nên vài giây là thừa an toàn — mục đích của nhịp này là để phép đo trần QUOTA
// không bị trần RATE-LIMIT chen vào (plan 3.F §F2).
export const PACE_MS = Number(__ENV.PACE_MS || 3000);

// Giữ ở đỉnh bao lâu trước khi tự dọn. `run-load.sh` lấy mẫu Prometheus liên tục
// suốt lượt và lấy MAX, nên con số này chỉ cần đủ rộng để có vài mẫu rơi vào đỉnh.
export const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 40);

/**
 * Phân loại một phản hồi tRPC.
 *
 * ⛔ "TỪ CHỐI CÓ CẤU TRÚC" LÀ MỘT TIÊU CHÍ QUÁ RỘNG — và đó là đường xanh-giả
 * nguy hiểm nhất của chặng này (review đối kháng 2026-08-15). `401` (cookie
 * cache chết), `429` (trần per-user của Next), `400` (idempotencyKey sai) đều là
 * "lỗi có cấu trúc, không 5xx, không treo". Một lượt chạy mà MỌI claim chết ở
 * tầng auth vẫn cho ô "chạm trần" xanh — và trần ghi được sẽ là 0.
 *
 * Vì thế nhánh QUOTA tách riêng và nhận diện bằng THÔNG ĐIỆP của orchestrator,
 * không bằng "không phải 2xx".
 */
export const OUTCOME = {
  CREATED: 'created',
  REFUSED_QUOTA: 'refused_quota', // đúng trần muốn đo
  REFUSED_OTHER: 'refused_other', // 4xx khác — PHÉP ĐO HỎNG, không phải chạm trần
  REFUSED_5XX: 'refused_5xx', // 5xx — hỏng SAI kiểu
  CONN_ERROR: 'conn_error', // không có phản hồi — phép đo hỏng
};

// Thông điệp orchestrator phát ra khi ResourceQuota chặn cold path
// (`services/orchestrator/internal/lifecycle/service.go`). Web bọc lại thành
// `orchestrator gRPC: <rawMessage>`, nên chuỗi này đi xuyên qua nguyên vẹn.
const QUOTA_MARKERS = ['trần số sandbox đồng thời', 'hệ thống đang quá tải'];

export function isQuotaMessage(body) {
  const s = String(body || '');
  return QUOTA_MARKERS.some((m) => s.indexOf(m) !== -1);
}

/**
 * ⛔ `status === 0` KHÔNG phải "server từ chối" — nó là "không có phản hồi nào".
 * Trộn nó vào nhánh từ chối là đúng cái lỗi 3.E đã đo: ramp song song ra lỗi kết
 * nối 000 và đọc nhầm thành "đã bị chặn đúng".
 */
export function classify(res) {
  if (!res || res.status === 0) {
    return { outcome: OUTCOME.CONN_ERROR, code: '000', detail: (res && res.error) || 'no response' };
  }
  if (res.status >= 200 && res.status < 300) {
    return { outcome: OUTCOME.CREATED, code: String(res.status), detail: '' };
  }
  const code = trpcCode(res.body) || String(res.status);
  // Quota được nhận diện TRƯỚC khi xét 5xx: hôm nay nó ĐANG tới dưới dạng 500
  // (`Code.ResourceExhausted` không có trong bảng map của orchestrator-client),
  // và ta cần phân biệt "chạm trần nhưng báo sai mã" với "hỏng vì lý do khác".
  if (isQuotaMessage(res.body)) {
    return {
      outcome: OUTCOME.REFUSED_QUOTA,
      code,
      http: res.status,
      detail: snippet(res.body),
    };
  }
  if (res.status >= 500) {
    return { outcome: OUTCOME.REFUSED_5XX, code, http: res.status, detail: snippet(res.body) };
  }
  return { outcome: OUTCOME.REFUSED_OTHER, code, http: res.status, detail: snippet(res.body) };
}

/** Mã lỗi tRPC nằm ở `error.data.code` (không transformer — body là JSON thô). */
export function trpcCode(body) {
  try {
    const doc = JSON.parse(body);
    const err = Array.isArray(doc) ? doc[0] && doc[0].error : doc.error;
    return (err && err.data && err.data.code) || null;
  } catch (_e) {
    return null;
  }
}

export function sessionIdOf(body) {
  try {
    const doc = JSON.parse(body);
    const r = Array.isArray(doc) ? doc[0] && doc[0].result : doc.result;
    const data = r && (r.data || r);
    return (data && data.session && data.session.id) || null;
  } catch (_e) {
    return null;
  }
}

export function snippet(body) {
  if (!body) return '';
  return String(body).replace(/\s+/g, ' ').slice(0, 180);
}

export function jsonHeaders(cookie) {
  return {
    'content-type': 'application/json',
    origin: ORIGIN,
    cookie: cookie,
  };
}

export const baseOptions = {
  // Cert sslip.io self-signed trên lab — cùng lý do `curl -k` của harness pentest.
  insecureSkipTLSVerify: true,
  // Một lượt đo, không ramp. Ramp là thứ plan 3.F §F2 cấm ở kịch bản trần.
  scenarios: {},
};
