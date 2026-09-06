'use client';

import { useCallback, useRef } from 'react';
import { TerminalSurface, focusNextAfter, type TerminalSurfaceProps } from '@devops-platform/terminal';
import '@devops-platform/terminal/style.css';

/**
 * Đích của `next/dynamic({ ssr: false })` — MỘT bản dùng chung cho mọi trình
 * học, thay cho bốn file `terminal-pane.tsx` chép tay từng route.
 *
 * File riêng vì `@xterm/xterm` chạm `document` lúc import module. Trước C5 mỗi
 * route có một đích riêng "để giữ chunk tách theo route"; nay ngược lại mới
 * đúng: bốn route dùng CÙNG một chunk xterm (~vài trăm KB) nên gộp lại là bớt
 * ba bản sao, không phải thêm.
 *
 * Hành vi mặc định của `onEscapeFocus` (D10) sống ở đây chứ không ở
 * `terminal-pane.tsx`: `focusNextAfter` được export từ subpath `"."` của
 * `@devops-platform/terminal`, và subpath đó kéo theo `@xterm/*`. Import nó ở
 * một component KHÔNG `ssr:false` sẽ lôi cả xterm vào bundle server — đúng thứ
 * `next/dynamic` ở đây tồn tại để tránh.
 */
export default function TerminalSurfaceLazy(props: TerminalSurfaceProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleEscapeFocus = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (wrapper !== null) {
      focusNextAfter(wrapper);
    }
  }, []);

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <TerminalSurface {...props} onEscapeFocus={props.onEscapeFocus ?? handleEscapeFocus} />
    </div>
  );
}
