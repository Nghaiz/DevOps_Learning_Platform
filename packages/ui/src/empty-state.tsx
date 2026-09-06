import type { ReactElement, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from './cn.ts';

export interface EmptyStateProps {
  /**
   * Icon lớn ở giữa. Bỏ trống ⇒ dùng `Inbox` (khay rỗng — hình quy ước cho
   * “không có gì ở đây”). `null` ⇒ không vẽ icon nào.
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
 * Trạng thái "chưa có gì" phải CÓ ÍCH, không phải một ô trắng — nợ 13.C task
 * 11 (`phase-13.md`): "chưa có lab nào ⇒ nói cách tạo (nếu là author) hoặc
 * gợi ý bài khác". `action` là chỗ nơi gọi truyền nút/link cụ thể cho ngữ
 * cảnh đó; component này không tự đoán vai trò người dùng.
 *
 * Cấu trúc “chuyện gì + làm gì tiếp” nằm ở BA khe, và chỉ khe đầu là bắt buộc:
 * `title` (chuyện gì) → `description` (vì sao / làm gì tiếp) → `action` (làm
 * ngay). Component không bịa được hai khe sau vì chúng phụ thuộc vai trò và
 * bộ lọc hiện hành của nơi gọi; cái nó bảo đảm được là bố cục và icon, để
 * trạng thái rỗng trông có chủ ý thay vì trông như trang lỗi.
 *
 * ⚠ Icon nằm trong một khối `aria-hidden` — kể cả icon do nơi gọi truyền.
 * Đúng ý: nó lặp lại điều `title` đã nói bằng chữ, đọc thêm một lần nữa là
 * nhiễu. Vì lớp bọc đã `aria-hidden`, node của nơi gọi KHÔNG cần tự khai.
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  const { icon, title, description, action, className } = props;
  const glyph = icon === undefined ? <Inbox className="size-8" /> : icon;

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
          className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground"
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
