'use client';

import { TerminalSurface, type TerminalSurfaceProps } from '@devops-platform/terminal';
import '@devops-platform/terminal/style.css';

/**
 * Đích của `next/dynamic({ ssr: false })` cho trang lab — xem `lab-client.tsx`.
 *
 * File RIÊNG cho lab (song song với `lessons/[id]/terminal-pane.tsx` và
 * `(session)/session/terminal-pane.tsx`) vì cùng hai lý do đã ghi ở hai bản
 * kia: `@xterm/xterm` chạm `document` ngay lúc import module, và mỗi cái phải
 * là đích của MỘT `next/dynamic` riêng — gộp chung sẽ gộp luôn hai chunk vốn cố
 * ý tách theo route.
 */
export default function TerminalPane(props: TerminalSurfaceProps): React.ReactElement {
  return <TerminalSurface {...props} />;
}
