import type { GetCapacityResponse } from '@devops-platform/shared-types/orchestrator/v1';
import { callOrchestrator, orchestratorClient } from '../grpc/orchestrator-client';
import { callHeaders } from '../labs/session';

/**
 * `GetCapacity` (C3, phase-13 — Lane Go) — sức chứa nền tảng NGAY LÚC GỌI,
 * không cache phía BFF.
 *
 * Dùng chung bởi `capacity.get` (mọi user đã đăng nhập) VÀ `admin.health`
 * (đọc lại đúng con số đó thay vì tự gọi lần hai với logic khác) — MỘT chỗ
 * quyết định cách hỏi orchestrator, cùng kỷ luật `sessionExpiry`/`callHeaders`
 * ở `labs/session.ts`.
 *
 * ## Vì sao kiểu này SUY RA từ proto thay vì được khai tay
 *
 * Bản trước liệt kê từng field một (`activeSessions: response.activeSessions,`
 * …) trong cả interface lẫn object trả về. Đó là một cái BẪY, không phải một
 * chi tiết: khi orchestrator thêm `quota_readable` / `profile_capacity`
 * (2026-09-08), một danh sách chép tay sẽ NUỐT chúng trong im lặng — không lỗi
 * biên dịch, không test đỏ, chỉ là FE không bao giờ thấy dữ liệu mới và không
 * ai biết vì sao. Đúng hạng lỗi `no-derived-fields` cấm: hình dạng response là
 * SSOT của proto, chép nó ra một chỗ thứ hai là để hai chỗ lệch nhau.
 *
 * `Omit<…, '$typeName'>` + spread khiến việc quên KHÔNG XẢY RA ĐƯỢC, mạnh hơn
 * một phép kiểm bắt được sau khi đã quên. `$typeName` bị bỏ vì nó là nhãn thời
 * chạy của protobuf-es, không phải dữ liệu — để lại thì nó rò ra payload tRPC.
 *
 * ⚠ Đánh đổi có ý thức: mọi field TƯƠNG LAI của `GetCapacityResponse` sẽ tự
 * động ra tới client. Đúng cho message NÀY (toàn số đếm sức chứa, không có gì
 * riêng tư); nếu sau này ai đó thêm field nội bộ vào chính message này thì phải
 * loại nó ở `Omit` — chứ đừng quay lại chép tay.
 */
export type CapacityView = Omit<GetCapacityResponse, '$typeName'> & {
  readonly fetchedAt: string;
};

/**
 * Tách khỏi `fetchCapacity` để test được mà không cần orchestrator: đây là
 * toàn bộ phần "dịch wire → view", và `capacity-wire.test.ts` gác đúng nó bằng
 * cách so danh sách field với descriptor của proto.
 */
export function toCapacityView(response: GetCapacityResponse, fetchedAt: string): CapacityView {
  const { $typeName: _wireTypeName, ...rest } = response;
  return { ...rest, fetchedAt };
}

export async function fetchCapacity(ctx: {
  user: { id: string; role: string };
}): Promise<CapacityView> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() => orchestratorClient().getCapacity({}, { headers }));
  return toCapacityView(response, new Date().toISOString());
}
