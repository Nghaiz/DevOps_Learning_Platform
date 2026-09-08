import type { ReactNode } from 'react';

/**
 * Layout của trụ cột ③ Games.
 *
 * ⛔ **KHÔNG có `TrpcQueryProvider` — và đó là một ràng buộc, không phải một
 * tối ưu bị bỏ quên.**
 *
 * Bốn layout danh mục còn lại (`lessons`, `labs`, `playgrounds`, `paths`,
 * `quiz`) đều cấp provider đó, nên sự vắng mặt ở đây trông y hệt một chỗ sót —
 * người sau sẽ "sửa" nó trong ba mươi giây. Vì vậy file này tồn tại **để nói ra
 * lý do**, chứ không phải để làm gì: game phải chạy với **0 lời gọi backend**
 * (ô nghiệm thu của `phase-14-exec.md` §6, đo bằng network trace của
 * Playwright), và một provider tRQC sẵn sàng ở đây là lời mời đầu tiên phá ô đó.
 *
 * Cùng lý do, `/games` **không** nằm trong `PROTECTED_PATHS` của `proxy.ts`:
 * game chạy hoàn toàn trong trình duyệt và tiến độ lưu ở `localStorage`, nên
 * bắt đăng nhập là dựng một cánh cổng không gác gì (`phase-14-exec.md` §4.2).
 *
 * Không gác auth, không đọc session, không đụng DB — đây là một trong hai trụ
 * cột mà khách chưa đăng nhập dùng được trọn vẹn.
 */
export default function GamesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
