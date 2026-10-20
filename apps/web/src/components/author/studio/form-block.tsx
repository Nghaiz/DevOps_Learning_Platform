import { useId, type ReactElement, type ReactNode } from 'react';

/**
 * Một khối của biểu mẫu soạn: tiêu đề (h2), ghi chú ngắn, rồi các ô.
 *
 * Các khối nối nhau bằng một đường kẻ mảnh; khối đầu không có đường kẻ trên. Không
 * đánh số: thứ tự đọc đã nằm trong vị trí, và một con số trước tiêu đề không cho người
 * soạn biết thêm điều gì.
 */
export function FormBlock(props: {
  readonly title: string;
  readonly note?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5 border-t border-rule pt-8 first:border-t-0 first:pt-0">
      <div className="flex max-w-[68ch] flex-col gap-1">
        <h2 id={headingId} className="font-display text-lg font-semibold text-ink">
          {props.title}
        </h2>
        {props.note === undefined || props.note === null ? null : <div className="text-sm text-ink-2">{props.note}</div>}
      </div>
      <div className="min-w-0">{props.children}</div>
    </section>
  );
}
