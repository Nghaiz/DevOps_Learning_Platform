'use client';

import Link from 'next/link';
import { Button } from '@devops-platform/ui';
import { useViewer } from '../components/shell/viewer-context';

/**
 * Nút hành động của trang chủ — chữ đổi theo việc đã đăng nhập hay chưa.
 *
 * Là Client Component chỉ để đọc `useViewer()` (context do vỏ ứng dụng bơm từ
 * session server). Cách khác là để `page.tsx` gọi `getSession()` lần nữa — một
 * lượt đụng DB thứ hai cho mỗi lần mở trang chủ, để trả lời đúng câu mà root
 * layout vừa trả lời xong.
 *
 * Khách chưa đăng nhập vẫn thấy nút dẫn tới `/lessons`; `proxy.ts` sẽ đưa họ qua
 * `/login` rồi mới vào. Nhưng nhãn nói thẳng "Đăng nhập để bắt đầu" thay vì hứa
 * một trang mở ra ngay — hứa sai rồi chuyển hướng là cách nhanh nhất làm người
 * lạ nghĩ trang bị hỏng.
 */
export function HomeCta() {
  const viewer = useViewer();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {viewer === null ? (
        <Button asChild size="lg">
          <Link href="/login">Đăng nhập để bắt đầu</Link>
        </Button>
      ) : (
        <Button asChild size="lg">
          <Link href="/lessons">Vào học</Link>
        </Button>
      )}
      <Button asChild size="lg" variant="outline">
        <Link href="/paths">Xem lộ trình</Link>
      </Button>
    </div>
  );
}
