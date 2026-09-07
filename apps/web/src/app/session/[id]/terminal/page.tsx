import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../../../server/auth/config';
import { TerminalWindowClient } from './terminal-window-client';

/**
 * C7 — `/session/<id>/terminal`: cửa sổ terminal trần, dùng cho nút "mở ra cửa
 * sổ riêng" của `WorkspacePanel`.
 *
 * ## Bảng đường của C7, cho rõ cái gì KHÔNG ở đây
 *
 * | Đường | Ai phục vụ |
 * |---|---|
 * | `/ide/session/<id>/` | **gateway** (Theia). KHÔNG có route Next nào cả — xem `ideSessionUrl` trong `components/session/ide-layout.ts` |
 * | `/session/<id>/terminal` | file này |
 *
 * ## Vì sao chỉ kiểm đăng nhập, không kiểm chủ sở hữu phiên ở đây
 *
 * Cổng thật nằm ở **gateway**: WebSocket `/ws/session/<id>` tự xác thực bằng
 * cookie `dlp_sandbox` và từ chối bằng mã đóng `4401`/`4403`. Kiểm quyền lần
 * nữa tại đây sẽ là một bản sao THỨ HAI của cùng một luật, và bản sao là bản sẽ
 * trôi. Cái duy nhất route này thêm được là chặn người CHƯA đăng nhập nhìn thấy
 * một khung terminal rồi mới bị đóng — nên nó chỉ làm đúng thế.
 *
 * ⚠ Hệ quả: một `id` bịa ra vẫn render được trang này; nó sẽ hiện màn hình
 * "kết nối đã đóng" ngay sau đó. Đó là hành vi ĐÚNG, không phải lỗ hổng — trang
 * không đọc gì của phiên ngoài chính cái id trên URL.
 */
export default async function SessionTerminalWindowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <TerminalWindowClient sessionId={id} />;
}
