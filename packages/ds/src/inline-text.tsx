import type { ReactElement } from 'react';

const CODE_SPAN = /(`[^`\n]+`)/g;

/**
 * Chữ dữ liệu (tên màn, mô tả lộ trình) viết lệnh trong dấu backtick như Markdown nội dòng:
 * "`git reset --hard` xoá gì". Component dựng ĐÚNG một luật đó thành `<code>`; nó không phải
 * trình dựng Markdown, nên `*` hay `_` trong chữ giữ nguyên. Thiếu nó thì dấu backtick hiện
 * thô ra màn hình (rà ảnh 2026-10-20: danh sách màn Git, mô tả lộ trình Docker).
 */
export function InlineText({ text }: { readonly text: string }): ReactElement {
  const parts = text.split(CODE_SPAN);
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
          <code key={index} className="rounded-xs bg-well-2 px-1 py-px font-mono text-[0.92em] text-ink">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
