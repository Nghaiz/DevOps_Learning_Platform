/**
 * Kiểm tên tài nguyên Kubernetes, và gợi ý một tên chưa dùng.
 *
 * ⛔ Kiểm NGAY KHI GÕ, không đợi bấm nút. Đây là điểm khác biệt có chủ ý so với
 * bản của k8sgames.com: hộp thoại của họ nhận mọi chuỗi rồi để lệnh chết ở tầng
 * dưới, nên người học đọc được "tạo thất bại" mà không biết vì sao. Tên K8s có
 * đúng bốn luật, cả bốn nói được thành một câu tiếng Việt, và nói TRƯỚC lúc bấm
 * thì người học nhớ luật — nói SAU thì họ chỉ nhớ là mình vừa sai.
 *
 * Luật lấy từ RFC 1123 (nhãn DNS), đúng thứ `kubectl` áp cho `metadata.name`
 * của gần như mọi loại tài nguyên.
 */

/** Giới hạn của một nhãn DNS. Vượt là API server từ chối, không phải cảnh báo. */
export const NAME_MAX_LENGTH = 63;

const VALID_NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export type NameCheck =
  | { readonly ok: true }
  /** Tiếng Việt, một câu, nói ĐÚNG luật bị vi phạm — không phải "tên không hợp lệ". */
  | { readonly ok: false; readonly reason: string };

/**
 * Thứ tự các phép kiểm là thứ tự người ta gõ sai.
 *
 * Chuỗi rỗng trả về lý do riêng thay vì gộp chung với "sai định dạng": lúc hộp
 * thoại vừa mở, ô còn trống là trạng thái BÌNH THƯỜNG, và bắn một thông báo lỗi
 * đỏ vào mặt người chưa gõ chữ nào là sai. Bên gọi phân biệt được hai trường hợp
 * qua chính chuỗi rỗng, nên nó im lặng cho tới khi có ký tự đầu tiên.
 */
export function checkResourceName(raw: string): NameCheck {
  const name = raw.trim();
  if (name === '') {
    return { ok: false, reason: 'Chưa có tên.' };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, reason: `Tên dài quá ${NAME_MAX_LENGTH} ký tự (đang ${name.length}).` };
  }
  if (/[A-Z]/.test(name)) {
    return { ok: false, reason: 'Tên K8s chỉ nhận chữ THƯỜNG — đổi chữ hoa thành chữ thường.' };
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return { ok: false, reason: 'Tên không được bắt đầu hoặc kết thúc bằng dấu gạch nối.' };
  }
  if (!VALID_NAME.test(name)) {
    return { ok: false, reason: 'Chỉ dùng chữ thường, số và dấu gạch nối (`-`). Không dấu cách, không dấu tiếng Việt.' };
  }
  return { ok: true };
}

/**
 * Ép một chuỗi bất kỳ về dạng nhãn DNS hợp lệ.
 *
 * Chỉ dùng để dựng GỢI Ý, không bao giờ để "sửa hộ" thứ người dùng gõ. Sửa hộ
 * làm người học tưởng chuỗi họ gõ là hợp lệ, và họ sẽ gõ lại đúng chuỗi đó ở
 * cụm thật rồi bị API server từ chối.
 */
function toLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_MAX_LENGTH);
}

/**
 * Tên đề xuất sẵn trong ô: `base`, rồi `base-2`, `base-3`… nếu đã có người dùng.
 *
 * `taken` là tên THẬT đang có trong cụm, đọc từ `ClusterView` lúc mở hộp thoại —
 * không phải một bộ đếm giữ trong state. Bộ đếm sẽ lệch ngay lần đầu người chơi
 * xoá một tài nguyên rồi tạo lại.
 */
export function suggestResourceName(base: string, taken: readonly string[]): string {
  const root = toLabel(base) || 'tai-nguyen';
  const used = new Set(taken);
  if (!used.has(root)) {
    return root;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${root}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return root;
}
