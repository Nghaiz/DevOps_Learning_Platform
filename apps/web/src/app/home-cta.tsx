'use client';

import Link from 'next/link';
import { t } from '@devops-platform/copy';
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
 *
 * Hai nhãn của nút chính nằm dưới cùng một tiền tố `home.cta.enter.*` trong bản
 * đồ chữ, một bậc sâu hơn `home.cta.paths`. Đó không phải cách đặt tên cho đẹp:
 * chúng là hai BIẾN THỂ của một cái nút và người dùng không bao giờ thấy cả
 * hai, nên đặt phẳng cạnh nhãn nút phụ sẽ dựng ra một nhóm ba khoá anh em mô tả
 * đúng hai cái nút, tức một con số ba không có thật.
 */
export function HomeCta() {
  const viewer = useViewer();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg">
        <Link href={viewer === null ? '/login' : '/lessons'}>
          {viewer === null ? t('home.cta.enter.guest') : t('home.cta.enter.member')}
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/paths">{t('home.cta.paths')}</Link>
      </Button>
    </div>
  );
}
