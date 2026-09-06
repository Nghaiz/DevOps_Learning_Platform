'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription } from '@devops-platform/ui';
import { resolveShellFallbackNotice, type ShellFallbackInput } from './shell-fallback';

export type ShellFallbackNoticeProps = ShellFallbackInput;

/**
 * Băng "phiên này không nhận được shell bạn chọn" cho ba trình học.
 *
 * Component KHÔNG mang quyết định nào: điều kiện hiện/ẩn và toàn bộ câu chữ đến
 * từ `resolveShellFallbackNotice` (hàm thuần, có test). Ở đây chỉ còn phần
 * không test được — dựng DOM.
 */
export function ShellFallbackNotice(props: ShellFallbackNoticeProps): ReactElement | null {
  const notice = resolveShellFallbackNotice(props);
  if (notice === null) {
    return null;
  }

  return (
    <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
      <AlertDescription className="text-foreground">
        {notice.lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </AlertDescription>
    </Alert>
  );
}
