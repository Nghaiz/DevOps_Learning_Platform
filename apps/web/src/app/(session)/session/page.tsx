import { permanentRedirect } from 'next/navigation';

/**
 * `/session` → `/me`, **308 Permanent Redirect** (quyết định **D12**,
 * `plans/devops-learning-platform/phase-13-exec.md` §1).
 *
 * ## Vì sao gộp
 *
 * `/session` (F7) là màn hình chứng minh engine: mở một sandbox trần, không gắn
 * với bài học nào. Bốn trình học của 13.D nay đều nhúng phiên vào ngay trang
 * nội dung qua khung phiên dùng chung (C5), nên một trang "phiên không có bài"
 * chỉ còn là một đường thứ hai vào cùng một thứ — và là đường không ai bảo trì.
 * `/me` (13.E) là nơi liệt kê **và kết thúc được** phiên đang mở.
 *
 * ## Vì sao redirect chứ không xoá thư mục
 *
 * Nó vẫn nằm trong lịch sử duyệt, trong bookmark, và trong report của P5–P12.
 * 308 giữ những đường đó sống và nói đúng rằng địa chỉ đã đổi vĩnh viễn.
 *
 * ## Cái đã bị xoá cùng lúc, và vì sao
 *
 * `session-client.tsx` + `terminal-pane.tsx` cạnh file này bị xoá: chính thay
 * đổi này làm chúng không còn ai import (đã grep — chỉ `page.tsx` cũ dùng), và
 * chúng mang bảng màu `slate-*` trần mà AC 13 cấm trên toàn `apps/web/src` —
 * giữ lại là để một cổng grep đỏ vì mã chết. Ba chú thích ở
 * `labs/[id]/terminal-pane.tsx`, `lessons/[id]/terminal-pane.tsx` và
 * `lessons/[id]/lesson-client.tsx` còn trỏ tới hai file này như tiền lệ thiết
 * kế; nội dung vẫn đọc được ở lịch sử git (commit trước commit này), và lane D1
 * đang thay chúng bằng `components/session/**` của C5.
 */
export default function SessionRedirect(): never {
  permanentRedirect('/me');
}
