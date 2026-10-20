import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../../components/catalog/viewer-role.server';
import { withReturnPath } from '../../../login/return-path';
import { TerminalWindowClient } from './terminal-window-client';

/**
 * `/session/<id>/terminal`: cửa sổ terminal trần, mở từ nút "Mở terminal ra cửa sổ
 * riêng" của khoang làm việc.
 *
 * | Đường | Ai phục vụ |
 * |---|---|
 * | `/ide/session/<id>/` | **gateway** (Theia), không có route Next nào |
 * | `/session/<id>/terminal` | file này |
 *
 * Chỉ kiểm đăng nhập, không kiểm chủ sở hữu phiên ở đây: cổng thật nằm ở gateway
 * (WebSocket `/ws/session/<id>` tự xác thực bằng cookie `dlp_sandbox` và từ chối bằng
 * `4401`/`4403`). Một `id` bịa ra vẫn render được trang này rồi hiện "kết nối đã đóng";
 * trang không đọc gì của phiên ngoài chính cái id trên URL.
 */
export default async function SessionTerminalWindowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await readViewerSession()) === null) {
    redirect(withReturnPath('/login', `/session/${encodeURIComponent(id)}/terminal`));
  }
  return <TerminalWindowClient sessionId={id} />;
}
