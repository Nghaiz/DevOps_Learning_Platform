'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@devops-platform/ui';

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
 */
export function ArenaPreview(props: {
  readonly code: string | null;
  readonly hasUnsavedChanges: boolean;
}): ReactElement {
  if (props.code === null) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">Thử trong đấu trường</h2>
        <Alert variant="warning">
          <AlertTitle>Chưa lưu thì chưa thử được</AlertTitle>
          <AlertDescription>
            Đấu trường nạp bài theo mã, mà mã do máy chủ cấp lúc lưu lần đầu. Lưu bản nháp rồi quay lại đây —
            bản nháp không hiện với người học, kể cả khi họ biết URL.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const href = `/games/k8s?problem=${encodeURIComponent(props.code)}`;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">Thử trong đấu trường</h2>

      <p className="text-sm text-muted-foreground">
        Mở cụm bạn vừa soạn trong đấu trường 3D và tự làm thử bài của mình. Đây là cách duy nhất phát hiện một
        mục tiêu không bao giờ tích xanh trước khi có người học đụng vào nó.
      </p>

      {props.hasUnsavedChanges && (
        <Alert variant="warning">
          <AlertTitle>Đấu trường sẽ mở BẢN ĐÃ LƯU</AlertTitle>
          <AlertDescription>
            Bạn đang có thay đổi chưa lưu. Đấu trường nạp bài từ máy chủ theo mã <code>{props.code}</code>, nên
            nó không thấy những gì bạn vừa sửa. Lưu trước rồi hãy mở.
          </AlertDescription>
        </Alert>
      )}

      <div>
        {/*
          `target="_blank"` để trang soạn không mất state đang gõ, và `rel` đi
          kèm vì không có nó thì tab mới với tới được `window.opener`.
        */}
        <Button asChild variant="outline">
          <a href={href} target="_blank" rel="noopener noreferrer">
            Mở đấu trường với bài {props.code}
          </a>
        </Button>
      </div>
    </section>
  );
}
