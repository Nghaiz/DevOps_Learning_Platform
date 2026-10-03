'use client';

import { TerminalSurface, type TerminalSurfaceProps } from '@devops-platform/terminal';
import '@devops-platform/terminal/style.css';

/**
 * Đích của `next/dynamic({ ssr: false })`, MỘT bản dùng chung cho mọi trình học.
 *
 * File riêng vì `@xterm/xterm` chạm `document` lúc import module.
 *
 * Cử chỉ rời terminal là Esc rồi Tab / Shift+Tab trong 500ms (packages/terminal).
 * Không đặt `onEscapeFocus` mặc định ở đây: bản trước luôn gọi `focusNextAfter`,
 * nên Shift+Tab cũng nhảy TỚI. Để trống thì thứ tự Tab tự nhiên của trình duyệt
 * lo cả hai chiều.
 */
export default function TerminalSurfaceLazy(props: TerminalSurfaceProps): React.ReactElement {
  return (
    <div className="h-full w-full">
      <TerminalSurface {...props} />
    </div>
  );
}
