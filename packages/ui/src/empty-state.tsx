import type { ReactElement, ReactNode } from 'react';
import { ARC_PATH_D, ARC_STROKE, ARC_VIEWBOX } from '@devops-platform/motion/motif';
import { cn } from './cn.ts';

export interface EmptyStateProps {
  /**
   * Hình lớn ở giữa. Bỏ trống ⇒ dùng **vòng ellipse hở của motif, ruột rỗng**
   * (design §3: "trạng thái rỗng — vòng ellipse hở, bên trong không có gì").
   * `null` ⇒ không vẽ hình nào.
   */
  readonly icon?: ReactNode;
  /** Chuyện gì đã xảy ra — một câu ngắn, KHÔNG phải nhãn cụt kiểu “Trống”. */
  readonly title: string;
  /** Làm gì tiếp. Không có câu này thì `action` mất ngữ cảnh — xem chú thích dưới. */
  readonly description?: string;
  /** Hành động CÓ ÍCH — nút "Tạo bài học" (author), link "Xem bài khác", … Không có action = chỉ mô tả suông. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * Vòng ellipse hở, ruột rỗng — hình mặc định của trạng thái rỗng.
 *
 * Vẽ `ARC_PATH_D` THẲNG thay vì gọi `arcTrackProps()`, cùng lý do đã ghi ở
 * `BrandMark` của `apps/web/src/components/shell/app-shell.tsx`: hàm đó ghim
 * `stroke: var(--border)`/`var(--input)` vì nó mô tả cái RÃNH của một thanh
 * tiến độ. Ở đây cung không phải rãnh của thứ gì. Nó lấy `currentColor` để
 * thừa hưởng `text-muted-foreground` của lớp bọc — cùng sắc độ mà icon cũ
 * dùng, và là sắc độ đọc được, khác `--border` (1.30:1) vốn dành cho ranh giới
 * chứ không cho một hình mang thông điệp.
 *
 * KHÔNG có `<circle>` nền, không glyph ở giữa: "bên trong không có gì" là NỘI
 * DUNG của hình này, không phải một chỗ còn trống chờ ai đó lấp.
 */
function EmptyArc(): ReactElement {
  return (
    <svg viewBox={ARC_VIEWBOX} role="presentation" className="size-full">
      <path
        d={ARC_PATH_D}
        fill="none"
        stroke="currentColor"
        strokeWidth={ARC_STROKE}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
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
  const { icon, title, description, action, className } = props;
  const glyph = icon === undefined ? <EmptyArc /> : icon;

  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {glyph !== null && (
        <div
          aria-hidden="true"
          className="flex size-16 items-center justify-center text-muted-foreground"
        >
          {glyph}
        </div>
      )}
      <div className="flex max-w-prose flex-col gap-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description !== undefined && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}
