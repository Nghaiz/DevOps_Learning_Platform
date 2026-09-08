'use client';

/**
 * Vùng đọc cho trình đọc màn hình — thường trực, ẩn về mặt hình ảnh.
 *
 * ⛔ Đây là vùng sống DUY NHẤT cho dòng sự kiện cụm. Bảng nhật ký sự kiện hiển
 * thị bằng mắt và KHÔNG mang `aria-live`; hai vùng cùng đọc một dòng sự kiện sẽ
 * làm trình đọc màn hình đọc lặp mỗi lần cụm đổi trạng thái.
 *
 * Vì sao nó phải thường trực thay vì nằm trong bảng nhật ký: bảng đó mặc định
 * TẮT. Nếu vùng sống duy nhất nằm bên trong nó thì cụm chạy hoàn toàn câm với
 * người dùng trình đọc màn hình cho tới khi họ tự bấm phím mở nhật ký — mà họ
 * không có cách nào biết là cần bấm.
 *
 * Vùng đọc lỗi nhập liệu trong hộp thoại đặt tên tài nguyên là chuyện khác và
 * hợp lệ: lỗi biểu mẫu phải đọc ngay cạnh ô nhập, không dồn về đây.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { EventView } from '@devops-platform/games';

export interface ArenaAnnouncerProps {
  readonly events: readonly EventView[];
}

export function ArenaAnnouncer({ events }: ArenaAnnouncerProps): ReactElement {
  const [message, setMessage] = useState('');
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const latest = events.at(-1);
    const key = `${latest?.tick ?? -1}:${latest?.message ?? ''}`;
    if (latest === undefined || key === lastIdRef.current) {
      return;
    }
    lastIdRef.current = key;
    /*
     * Chỉ đọc sự kiện MỚI NHẤT, không đọc cả hàng đợi.
     *
     * Cụm có thể sinh chục sự kiện trong một nhịp khi một node sập. Đẩy hết vào
     * vùng sống sẽ làm trình đọc màn hình đọc liên tục hàng chục câu và người
     * dùng không nghe được gì khác — kể cả thao tác của chính họ. Một câu mới
     * nhất là thứ trả lời đúng câu hỏi "vừa có gì xảy ra".
     */
    setMessage(latest.message);
  }, [events]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
