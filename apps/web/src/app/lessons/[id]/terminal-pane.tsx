'use client';

import { TerminalSurface, type TerminalSurfaceProps } from '@devops-platform/terminal';
import '@devops-platform/terminal/style.css';

/**
 * Đích của `next/dynamic({ ssr: false })` cho trang bài học — xem `lesson-client.tsx`.
 *
 * Là file RIÊNG (song song với `(session)/session/terminal-pane.tsx`) vì cùng hai
 * lý do, cả hai đều là lỗi build nếu gộp: `@xterm/xterm` chạm `document` ngay lúc
 * import module, và `style.css` + font 636 KB chỉ nên tải kèm terminal chứ không
 * nằm trong bundle của mọi trang.
 *
 * ⚠ KHÔNG gộp hai file này lại thành một module dùng chung: mỗi cái là đích của
 * một `next/dynamic` riêng, và chia sẻ đích sẽ gộp hai chunk vốn cố ý tách.
 */
export default function TerminalPane(props: TerminalSurfaceProps): React.ReactElement {
  return <TerminalSurface {...props} />;
}
