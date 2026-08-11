'use client';

import { TerminalSurface, type TerminalSurfaceProps } from '@devops-platform/terminal';
import '@devops-platform/terminal/style.css';

/**
 * Đích của `next/dynamic({ ssr: false })` — xem `session-client.tsx`.
 *
 * Tồn tại như một file RIÊNG vì hai lý do, cả hai đều là lỗi build nếu gộp:
 *
 * 1. `@xterm/xterm` chạm `document` ngay lúc import module, nên module này không
 *    được nằm trên đường import tĩnh của bất kỳ thứ gì server render.
 * 2. `style.css` của xterm cũng chỉ nên tải kèm terminal, không nằm trong bundle
 *    chung của mọi trang — cùng với font 636 KB, đó là tải thừa cho ai không mở
 *    `/session`.
 */
export default function TerminalPane(props: TerminalSurfaceProps): React.ReactElement {
  return <TerminalSurface {...props} />;
}
