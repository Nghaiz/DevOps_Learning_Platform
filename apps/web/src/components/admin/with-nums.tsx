import { Fragment, type ReactElement, type ReactNode } from 'react';

/**
 * Câu có số nằm trong (design-brief §4.8): "12 phiên đang chạy, còn 18/30 chỗ"
 * với hai con số in bằng `<Num>`.
 *
 * ## Vì sao chỗ giữ chứ không cắt câu thành mảnh
 *
 * Cắt câu thành ba khoá ("phiên đang chạy, còn", "chỗ") làm trật tự từ rơi ra
 * khỏi bản đồ chữ: câu sửa ở một khoá thì hai khoá kia vẫn giữ cấu trúc cũ, và
 * cổng copy không đọc được câu nào trọn vẹn. Ở đây cả câu là MỘT mục của bản
 * đồ, nhận tham số kiểu `string`; nơi gọi truyền `numSlot(i)` vào chỗ của số,
 * rồi `WithNums` thay chỗ giữ bằng nút React.
 *
 * Hai ký tự bao là vùng dùng riêng của Unicode (U+E000, U+E001): không bàn
 * phím nào gõ ra, nên chúng không đụng được chữ thật trong câu.
 */
const OPEN = '';
const CLOSE = '';
const SLOT_RE = /(\d+)/g;

/** Chỗ giữ cho nút thứ `index` trong mảng `nums` của `WithNums`. */
export function numSlot(index: number): string {
  return `${OPEN}${String(index)}${CLOSE}`;
}

export type SlotPart = string | { readonly slot: number };

/** Hàm thuần: tách câu đã dựng thành đoạn chữ và chỗ giữ, theo đúng thứ tự. */
export function splitSlots(text: string): readonly SlotPart[] {
  const parts: SlotPart[] = [];
  let last = 0;
  for (const match of text.matchAll(SLOT_RE)) {
    const at = match.index;
    if (at > last) {
      parts.push(text.slice(last, at));
    }
    parts.push({ slot: Number(match[1]) });
    last = at + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

/**
 * Thay chỗ giữ bằng nút. Chỗ giữ trỏ ra ngoài mảng là lỗi của nơi gọi, và nó
 * NÉM thay vì in một ô trống: một câu "phiên đang chạy" mất con số đọc ra như
 * "không có phiên nào", tức một khẳng định sai về cụm.
 */
export function WithNums({
  text,
  nums,
}: {
  readonly text: string;
  readonly nums: readonly ReactNode[];
}): ReactElement {
  return (
    <>
      {splitSlots(text).map((part, index) => {
        if (typeof part === 'string') {
          return <Fragment key={index}>{part}</Fragment>;
        }
        if (part.slot >= nums.length) {
          // Thông báo cho lập trình viên, không tới người dùng: tiếng Anh, ngoài bản đồ chữ.
          throw new Error(
            `WithNums: slot ${String(part.slot)} has no node (${String(nums.length)} given)`,
          );
        }
        return <Fragment key={index}>{nums[part.slot]}</Fragment>;
      })}
    </>
  );
}
