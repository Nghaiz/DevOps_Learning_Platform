import type { ReactElement, ReactNode } from 'react';
import { cn } from './cn.ts';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
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
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  const { icon, title, description, action, className } = props;
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon !== undefined && (
        <div aria-hidden="true" className="text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description !== undefined && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}
