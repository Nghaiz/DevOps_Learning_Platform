import { redirect } from 'next/navigation';

/**
 * Tạm thời (lead 00, 2026-10-03): trang giới thiệu mới do phiên 5a dựng và sẽ thay
 * file này. Trong lúc chờ, `/` đưa thẳng tới trang chọn game thay vì hiện bản cũ.
 */
export default function HomePage(): never {
  redirect('/games');
}
