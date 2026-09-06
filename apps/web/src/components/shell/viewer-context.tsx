'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Viewer } from './nav';

const ViewerContext = createContext<Viewer | null>(null);

/**
 * Người dùng đang đăng nhập, hoặc `null` khi khách vãng lai.
 *
 * Nguồn là **session phía server** — `app/layout.tsx` gọi `getSession()` một
 * lần rồi bơm xuống đây. Client KHÔNG tự đoán vai trò từ đâu khác, và vai trò
 * này chỉ dùng để ẩn/hiện liên kết (xem `userMenuItems`): cổng thật nằm ở
 * `layout.tsx` server của từng route.
 *
 * Tồn tại để trang con (Server Component không nhận được prop từ layout) vẫn
 * biết có ai đang đăng nhập mà KHÔNG phải gọi `getSession()` lần thứ hai — mỗi
 * lần gọi là một lượt đụng DB cho mọi request.
 */
export function useViewer(): Viewer | null {
  return useContext(ViewerContext);
}

export function ViewerProvider({
  viewer,
  children,
}: {
  readonly viewer: Viewer | null;
  readonly children: ReactNode;
}) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}
