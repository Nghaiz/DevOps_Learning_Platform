import { describe, expect, it, vi } from 'vitest';
import { fetchCapacity } from './get-capacity';

/**
 * `capacity.get` / `fetchCapacity` (D5, C3 — phase-13).
 *
 * ⚠ VÌ SAO BỘ NÀY TỒN TẠI: hợp đồng C3 ĐÃ ĐỔI giữa chừng (lane Go, `bd84df7` +
 * `0fa36a9`) — `CAPACITY_SOFT_LIMIT` biến mất, trần mềm giờ được TÍNH
 * (`hard − POOL_TARGET`), và `GetCapacityResponse` mọc thêm `hard_capacity`.
 * Một tầng ánh xạ quên field mới KHÔNG làm typecheck đỏ (thừa field ở nguồn là
 * hợp lệ), nên nó im lặng đi vào FE dưới dạng "trang quản trị không có trần
 * cứng để hiện". Bộ này là thứ duy nhất bắt được chuyện đó.
 *
 * ⛔ Và nó khẳng định ánh xạ theo TÊN chứ không theo thứ tự: một `softCapacity`
 * lấy nhầm từ `hard_capacity` cho ra một con số HỢP LÝ (23 thay vì 20) mà không
 * test nào so shape bắt được — nên các giá trị fixture dưới đây cố ý KHÁC NHAU
 * ĐÔI MỘT.
 */

const getCapacitySpy = vi.hoisted(() =>
  vi.fn((_req: Record<string, never>, _opts?: unknown) =>
    Promise.resolve({
      activeSessions: 5,
      softCapacity: 20,
      poolFree: 3,
      poolQuarantine: 1,
      hardCapacity: 23,
    }),
  ),
);

vi.mock('../grpc/orchestrator-client', () => ({
  orchestratorClient: () => ({ getCapacity: getCapacitySpy }),
  callOrchestrator: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

const ctx = { user: { id: 'cap-fixture-user', role: 'user' } };

describe('fetchCapacity — ánh xạ GetCapacityResponse (hợp đồng C3 SAU khi lane Go đổi)', () => {
  it('mang ĐỦ cả hai trần: softCapacity (tính) VÀ hardCapacity (env), không gộp', async () => {
    const view = await fetchCapacity(ctx);
    expect(view.softCapacity).toBe(20);
    expect(view.hardCapacity).toBe(23);
    // Phần đệm giữa hai trần chính là số pod ấm pool giữ — nếu hai field bị ánh
    // xạ từ cùng một nguồn, hiệu số này thành 0 và không ai nhận ra.
    expect(view.hardCapacity - view.softCapacity).toBe(3);
  });

  it('mọi field còn lại ánh xạ đúng TÊN (giá trị fixture khác nhau đôi một)', async () => {
    const view = await fetchCapacity(ctx);
    expect(view.activeSessions).toBe(5);
    expect(view.poolFree).toBe(3);
    expect(view.poolQuarantine).toBe(1);
  });

  it('fetchedAt là mốc ISO của LƯỢT ĐỌC — không cache, không đến từ orchestrator', async () => {
    const before = Date.now();
    const view = await fetchCapacity(ctx);
    const at = Date.parse(view.fetchedAt);
    expect(Number.isNaN(at)).toBe(false);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
