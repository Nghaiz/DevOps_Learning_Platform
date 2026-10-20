import type { ReactElement, ReactNode } from 'react';
import { cn } from './cn.ts';

export interface EmptyStateProps {
  /**
   * Hình lớn ở giữa. Bỏ trống ⇒ dùng **vòng ellipse hở của motif, ruột rỗng**
   * (design §3: "trạng thái rỗng — vòng ellipse hở, bên trong không có gì").
   * `null` ⇒ không vẽ hình nào.
   *
   * Tên cũ của `glyph`; giữ để nơi gọi hiện có không vỡ. Có cả hai ⇒ `glyph` thắng.
   */
  readonly icon?: ReactNode;
  /** Hình lớn (hợp đồng ui-kit §B). Cùng ngữ nghĩa ba trạng thái với `icon`. */
  readonly glyph?: ReactNode;
  /** Chuyện gì đã xảy ra — một câu ngắn, KHÔNG phải nhãn cụt kiểu “Trống”. */
  readonly title: string;
  /** Làm gì tiếp. Không có câu này thì `action` mất ngữ cảnh — xem chú thích dưới. */
  readonly description?: string;
  /** Hành động CÓ ÍCH — nút "Tạo bài học" (author), link "Xem bài khác", … Không có action = chỉ mô tả suông. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * Hình mặc định của trạng thái rỗng trong bản dựng lại PTIT (design-brief §1):
 * một đoạn tuyến tàu, hai ga đã có và ga cuối viền đứt, chưa ai tới. Vuông
 * như mọi thứ khác trong hệ; vòng ellipse hở của bản cũ đã bỏ vì nó là hình
 * tròn duy nhất còn lại trên trang.
 *
 * Màu lấy `currentColor` để thừa hưởng `text-muted-foreground` của lớp bọc.
 */
function EmptyStation(): ReactElement {
  return (
    <svg viewBox="0 0 96 32" role="presentation" className="size-full" data-empty-glyph="station">
      <line x1="10" y1="16" x2="66" y2="16" stroke="currentColor" strokeWidth="4" />
      <line x1="66" y1="16" x2="86" y2="16" stroke="currentColor" strokeWidth="4" strokeDasharray="3 4" />
      <rect x="4" y="10" width="12" height="12" fill="currentColor" />
      <rect x="38" y="10" width="12" height="12" fill="currentColor" />
      <rect
        x="78"
        y="10"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="3 2.5"
      />
    </svg>
  );
}

/**
 * Trạng thái "chưa có gì" phải CÓ ÍCH, không phải một ô trắng — nợ 13.C task
 * 11 (`phase-13.md`): "chưa có lab nào ⇒ nói cách tạo (nếu là author) hoặc
 * gợi ý bài khác". `action` là chỗ nơi gọi truyền nút/link cụ thể cho ngữ
 * cảnh đó; component này không tự đoán vai trò người dùng.
 *
 * Cấu trúc “chuyện gì + làm gì tiếp” nằm ở BA khe, và chỉ khe đầu là bắt buộc:
 * `title` (chuyện gì) → `description` (vì sao / làm gì tiếp) → `action` (làm
 * ngay). Component không bịa được hai khe sau vì chúng phụ thuộc vai trò và
 * bộ lọc hiện hành của nơi gọi; cái nó bảo đảm được là bố cục và hình, để
 * trạng thái rỗng trông có chủ ý thay vì trông như trang lỗi.
 *
 * ## Đĩa `bg-muted` đã bị GỠ, không phải quên
 *
 * Bản trước bọc icon `Inbox` trong một đĩa tròn `rounded-full bg-muted`. Đĩa đó
 * mâu thuẫn trực tiếp với design §3 ("bên trong không có gì"): một vòng hở mà
 * bên trong có một mảng đặc thì nó không còn hở. Hệ quả phụ: hình do NƠI GỌI
 * truyền cũng mất đĩa. Đo trên `0cc6546`: không nơi gọi nào truyền `icon` (18
 * chỗ dùng `EmptyState`, tất cả đều dùng mặc định), nên đây là thay đổi không
 * có hồi quy thị giác — nhưng nó là một thay đổi THẬT với nơi gọi tương lai,
 * nên ghi ra thay vì để phát hiện lại.
 *
 * ⚠ Hình nằm trong một khối `aria-hidden` — kể cả hình do nơi gọi truyền.
 * Đúng ý: nó lặp lại điều `title` đã nói bằng chữ, đọc thêm một lần nữa là
 * nhiễu. Vì lớp bọc đã `aria-hidden`, node của nơi gọi KHÔNG cần tự khai.
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  const { icon, glyph: glyphProp, title, description, action, className } = props;
  const chosen = glyphProp === undefined ? icon : glyphProp;
  const glyph = chosen === undefined ? <EmptyStation /> : chosen;

  return (
    <div
      data-slot="empty-state"
      className={cn(
        // Khung nét đứt vuông: đánh dấu một CHỖ TRỐNG trong bố cục, không phải
        // một thẻ nổi (design-brief §4.9: hình lớn + một câu + một hành động).
        'flex flex-col items-center gap-5 border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      {glyph !== null && (
        <div
          aria-hidden="true"
          className="flex h-12 w-36 items-center justify-center text-muted-foreground"
        >
          {glyph}
        </div>
      )}
      <div className="flex max-w-prose flex-col gap-1">
        <p className="type-title text-balance text-foreground">{title}</p>
        {description !== undefined && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}
