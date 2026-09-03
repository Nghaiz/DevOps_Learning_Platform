'use client';

import { TerminalSurface, type TerminalSurfaceProps } from '@devops-platform/terminal';
import '@devops-platform/terminal/style.css';

/**
 * Đích của `next/dynamic({ ssr: false })` cho trang playground — xem
 * `playground-client.tsx`. File RIÊNG (song song với các bản `terminal-pane.tsx`
 * khác trong repo) vì cùng hai lý do đã ghi ở `lessons/[id]/terminal-pane.tsx`:
 * `@xterm/xterm` chạm `document` ngay lúc import module, và mỗi route cần một
 * đích `next/dynamic` riêng để giữ chunk tách theo route.
 */
export default function TerminalPane(props: TerminalSurfaceProps): React.ReactElement {
  return <TerminalSurface {...props} />;
}
