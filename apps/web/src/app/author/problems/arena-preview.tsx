'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';

/**
 * Mở đấu trường 3D với chính bài đang soạn, để người soạn tự thử.
 *
 * ## Đường vào là `/games/k8s?problem=<mã>` — đúng một đường, không bịa đường thứ hai
 *
 * Lead chốt (2026-09-08) rằng chế độ bài tập của arena nhận bài qua tham số truy
 * vấn `problem`, và `arena-contract.ts` khai `ArenaMode` cho nó. Trang soạn KHÔNG
 * dựng một điểm gắn riêng: một đường vào thứ hai nghĩa là hai chỗ quyết định
 * "bài này chơi thế nào", và chúng sẽ trôi khỏi nhau.
 *
 * ## Hệ quả phải NÓI RA, không được giấu
 *
 * Đường đó nạp bài từ MÁY CHỦ theo mã. Nên:
 *
 * - Bài chưa lưu lần nào thì chưa có mã ⇒ **chưa có đường vào nào**. Đây là chỗ
 *   nối còn hở, và nó được nói thẳng ở đây thay vì lấp bằng một nút bấm không
 *   làm gì.
 * - Bài đã lưu nhưng đang sửa dở thì arena mở ra bản ĐÃ LƯU, không phải thứ trên
 *   màn hình. Một nút "xem trước" mở ra bản cũ mà không cảnh báo là kiểu sai
 *   lặng lẽ tệ nhất — người soạn kết luận sai về chính thay đổi vừa làm.
 *
 * ## ⚠ Mã bài rời khỏi CÂU cảnh báo, và đó là một đánh đổi có chủ ý
 *
 * Bản cũ nhúng `<code>{props.code}</code>` vào giữa câu "Đấu trường nạp bài từ
 * máy chủ theo mã X". Đưa câu đó vào bản đồ thì hoặc mất thẻ `<code>` (mã hiện
 * ra như chữ thường), hoặc phải cắt câu làm hai khoá nửa vời mà bộ dò đọc
 * thành hai mảnh vô nghĩa. Chọn cách thứ ba: câu không nhắc mã nữa, vì mã đã
 * nằm ngay trên nhãn nút bên dưới. Không mất thông tin nào.
 *
 * ## Icon `ResourceKind` KHÔNG được import ở đây
 *
 * Ràng buộc phòng ngừa của P16: nếu file này một ngày cần icon tài nguyên thì
 * lấy từ `packages/ui/src/resource-icon.tsx`, không lấy từ
 * `components/k8s-arena/**`. Hiện tại nó không cần icon nào.
 */
export function ArenaPreview(props: {
  readonly code: string | null;
  readonly hasUnsavedChanges: boolean;
}): ReactElement {
  if (props.code === null) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
          {t('author.problem.arena.heading')}
        </h2>
        <Alert variant="warning">
          <AlertTitle>{t('author.problem.arena.no-code-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.arena.no-code-body')}</AlertDescription>
        </Alert>
      </section>
    );
  }

  const href = `/games/k8s?problem=${encodeURIComponent(props.code)}`;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
        {t('author.problem.arena.heading')}
      </h2>

      <p className="text-sm text-muted-foreground">{t('author.problem.arena.lead')}</p>

      {props.hasUnsavedChanges && (
        <Alert variant="warning">
          <AlertTitle>{t('author.problem.arena.stale-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.arena.stale-body')}</AlertDescription>
        </Alert>
      )}

      <div>
        {/*
          `target="_blank"` để trang soạn không mất state đang gõ, và `rel` đi
          kèm vì không có nó thì tab mới với tới được `window.opener`.
        */}
        <Button asChild variant="outline">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {t('author.problem.arena.open', { code: props.code })}
          </a>
        </Button>
      </div>
    </section>
  );
}
