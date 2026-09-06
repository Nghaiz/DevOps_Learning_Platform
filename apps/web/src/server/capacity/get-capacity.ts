import { callOrchestrator, orchestratorClient } from '../grpc/orchestrator-client';
import { callHeaders } from '../labs/session';

/**
 * `GetCapacity` (C3, phase-13 — Lane Go) — sức chứa nền tảng NGAY LÚC GỌI,
 * không cache phía BFF (contract: "FE tự tính còn = max(0, soft − active)").
 *
 * Dùng chung bởi `capacity.get` (mọi user đã đăng nhập) VÀ `admin.health`
 * (đọc lại đúng con số đó thay vì tự gọi lần hai với logic khác) — MỘT chỗ
 * quyết định cách hỏi orchestrator, cùng kỷ luật `sessionExpiry`/`callHeaders`
 * ở `labs/session.ts`.
 */
export interface CapacityView {
  readonly activeSessions: number;
  /**
   * Trần MỀM — `hard_capacity − POOL_TARGET`, orchestrator TÍNH lúc đọc (không
   * còn env `CAPACITY_SOFT_LIMIT`, xem proto §GetCapacityResponse). Đây là con
   * số "còn N chỗ" của FE.
   */
  readonly softCapacity: number;
  /**
   * Trần CỨNG — env `CAPACITY_HARD_LIMIT`, trần vật lý đã đo.
   *
   * ⚠ KHÔNG được gộp với `softCapacity` thành một con số: chúng trả lời hai câu
   * khác nhau ("người học còn vào được không" vs "hạ tầng chịu được bao nhiêu"),
   * và phần đệm giữa hai trần CHÍNH LÀ chỗ pool giữ pod ấm. Trang quản trị hiện
   * "20/23" đọc cả hai; gộp lại là mất đúng thông tin đó.
   */
  readonly hardCapacity: number;
  readonly poolFree: number;
  readonly poolQuarantine: number;
  readonly fetchedAt: string;
}

export async function fetchCapacity(ctx: { user: { id: string; role: string } }): Promise<CapacityView> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() => orchestratorClient().getCapacity({}, { headers }));
  return {
    activeSessions: response.activeSessions,
    softCapacity: response.softCapacity,
    hardCapacity: response.hardCapacity,
    poolFree: response.poolFree,
    poolQuarantine: response.poolQuarantine,
    fetchedAt: new Date().toISOString(),
  };
}
