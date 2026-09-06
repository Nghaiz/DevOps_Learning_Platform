import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchAdminHealth, parsePrometheusText, type HealthSource } from './health';

/**
 * `admin.health` (C4, phase-13) — bộ này tồn tại vì MỘT lý do: một trang health
 * báo XANH khi không với tới được nguồn nào thì tệ hơn không có trang health.
 *
 * ⚠ Nhánh "không với tới" KHÔNG phải nhánh hiếm cần phòng xa. Chart chỉ dựng
 * đường cho từng nguồn khi đủ điều kiện — `ORCHESTRATOR_METRICS_URL` luôn có
 * (cổng HTTP 8081 nằm sẵn trên Service) còn `GATEWAY_METRICS_URL` chỉ có khi cổng
 * admin 8083 lên Service, mà điều đó theo `networkPolicy.platform.enabled`
 * (`platform.gatewayAdminOnService`). Nên MỘT nguồn thiếu trong khi nguồn kia
 * khoẻ là cấu hình BÌNH THƯỜNG của chart mặc định, không phải một cụm hỏng — và
 * netpol áp ngoài chart vẫn có thể chặn cả hai. Nhánh này phải được kiểm KỸ HƠN
 * nhánh khoẻ, không phải ít hơn.
 *
 * Bốn ca bắt buộc: (1) `/metrics` thật, (2) 404, (3) không kết nối được,
 * (4) 200 với body hợp lệ nhưng KHÔNG có series `dlp_*`. Ca (4) là ca dễ trượt
 * nhất — nó có ĐÚNG hình dạng của thành công.
 */

// Mẫu thật theo format `promhttp`; tên series lấy từ
// `services/orchestrator/internal/metrics` + `terminal-gateway/internal/metrics`.
const REAL_METRICS = [
  '# HELP dlp_pool_claimed_size So pod dang duoc giu.',
  '# TYPE dlp_pool_claimed_size gauge',
  'dlp_pool_claimed_size 3',
  '# TYPE dlp_claim_total counter',
  'dlp_claim_total{result="ok",path="warm"} 128',
  'dlp_claim_total{result="error",path="cold"} 2',
  '# TYPE dlp_claim_duration_seconds histogram',
  'dlp_claim_duration_seconds_bucket{le="0.5"} 41',
  'dlp_claim_duration_seconds_bucket{le="+Inf"} 44',
  'dlp_claim_duration_seconds_sum 12.5',
  'dlp_claim_duration_seconds_count 44',
  'dlp_gateway_ws_active 7',
  'go_goroutines 27',
  'process_cpu_seconds_total 4.2',
  'promhttp_metric_handler_requests_total{code="200"} 9',
  '',
].join('\n');

/** Body 200 hợp lệ nhưng KHÔNG một series `dlp_*` nào — ca "xanh giả". */
const NO_DLP_SERIES = [
  '# HELP go_goroutines Number of goroutines.',
  '# TYPE go_goroutines gauge',
  'go_goroutines 27',
  'process_resident_memory_bytes 1.9243008e+07',
  '',
].join('\n');

const ctx = { user: { id: 'admin-health-fixture', role: 'admin' } };

beforeAll(() => {
  process.env['ORCHESTRATOR_METRICS_URL'] = 'http://fixture-orchestrator.test/metrics';
  process.env['GATEWAY_METRICS_URL'] = 'http://fixture-gateway.test/metrics';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `fetch` giả: mỗi URL một hành vi, để hai nguồn khác trạng thái trong CÙNG một lượt. */
function stubFetch(byHost: Record<string, () => Promise<Response>>): void {
  vi.stubGlobal('fetch', (input: string | URL) => {
    const url = String(input);
    const handler = Object.entries(byHost).find(([host]) => url.includes(host))?.[1];
    if (handler === undefined) {
      throw new Error('fixture thiếu handler cho ' + url);
    }
    return handler();
  });
}

function ok200(body: string): () => Promise<Response> {
  return () =>
    Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) } as Response);
}
function status(code: number): () => Promise<Response> {
  return () =>
    Promise.resolve({ ok: false, status: code, text: () => Promise.resolve('') } as Response);
}
function refused(message: string): () => Promise<Response> {
  return () => Promise.reject(new Error(message));
}

function sourceNamed(sources: readonly HealthSource[], name: string): HealthSource {
  const found = sources.find((s) => s.name === name);
  if (found === undefined) {
    throw new Error('không có nguồn ' + name);
  }
  return found;
}

vi.mock('../capacity/get-capacity', () => ({
  fetchCapacity: () =>
    Promise.resolve({ activeSessions: 3, softCapacity: 20, poolFree: 17, fetchedAt: 'x' }),
}));

describe('parsePrometheusText — chỉ giữ dlp_*, đọc đúng label và giá trị', () => {
  it('mẫu /metrics THẬT: bỏ go_*/process_*/promhttp_*, giữ gauge + counter có label + bucket', () => {
    const series = parsePrometheusText(REAL_METRICS);
    expect(series.every((s) => s.name.startsWith('dlp_'))).toBe(true);
    expect(series.map((s) => s.name)).not.toContain('go_goroutines');

    const gauge = series.find((s) => s.name === 'dlp_pool_claimed_size');
    expect(gauge).toEqual({ name: 'dlp_pool_claimed_size', labels: {}, value: 3 });

    const counter = series.find(
      (s) => s.name === 'dlp_claim_total' && s.labels['result'] === 'error',
    );
    expect(counter?.labels).toEqual({ result: 'error', path: 'cold' });
    expect(counter?.value).toBe(2);

    const inf = series.find(
      (s) => s.name === 'dlp_claim_duration_seconds_bucket' && s.labels['le'] === '+Inf',
    );
    expect(inf?.value).toBe(44);
  });

  it('body KHÔNG có series dlp_* nào ⇒ mảng RỖNG (không phải "khoẻ, chưa có số")', () => {
    expect(parsePrometheusText(NO_DLP_SERIES)).toEqual([]);
  });
});

describe('fetchAdminHealth — ba trạng thái phân biệt được bằng MÁY, không bằng đọc chuỗi', () => {
  it('với tới + khoẻ ⇒ reached:true, ok:true, error:null, có series', async () => {
    stubFetch({ orchestrator: ok200(REAL_METRICS), gateway: ok200(REAL_METRICS) });
    const health = await fetchAdminHealth(ctx);
    for (const name of ['orchestrator', 'gateway']) {
      const source = sourceNamed(health.sources, name);
      expect({ reached: source.reached, ok: source.ok, error: source.error }).toEqual({
        reached: true,
        ok: true,
        error: null,
      });
      expect(source.series.length).toBeGreaterThan(0);
    }
  });

  it('404 ⇒ với tới được nhưng KHÔNG khoẻ (reached:true, ok:false)', async () => {
    stubFetch({ orchestrator: status(404), gateway: ok200(REAL_METRICS) });
    const health = await fetchAdminHealth(ctx);
    const source = sourceNamed(health.sources, 'orchestrator');
    expect(source.reached).toBe(true);
    expect(source.ok).toBe(false);
    expect(source.error).toContain('404');
  });

  it('không kết nối được ⇒ reached:FALSE — phân biệt được với 404 mà không cần so chuỗi', async () => {
    stubFetch({
      orchestrator: refused('connect ECONNREFUSED 10.42.0.5:8081'),
      gateway: ok200(REAL_METRICS),
    });
    const health = await fetchAdminHealth(ctx);
    const blocked = sourceNamed(health.sources, 'orchestrator');
    const healthy = sourceNamed(health.sources, 'gateway');

    expect(blocked.reached).toBe(false);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain('ECONNREFUSED');

    // ⛔ Khẳng định TRUNG TÂM của cả file: nguồn KHÔNG với tới được KHÔNG được
    // render giống nguồn khoẻ. So nguyên bản ghi, không so từng field lẻ.
    expect(blocked).not.toEqual({ ...healthy, name: 'orchestrator' });
    expect([blocked.reached, blocked.ok]).not.toEqual([healthy.reached, healthy.ok]);
  });

  it('200 nhưng KHÔNG series dlp_* ⇒ ok:FALSE (ca "xanh giả" dễ trượt nhất)', async () => {
    stubFetch({ orchestrator: ok200(NO_DLP_SERIES), gateway: ok200(REAL_METRICS) });
    const health = await fetchAdminHealth(ctx);
    const source = sourceNamed(health.sources, 'orchestrator');
    expect(source.reached).toBe(true);
    expect(source.ok).toBe(false);
    expect(source.error).toContain('dlp_');
    expect(source.series).toEqual([]);
  });

  it('GATEWAY_METRICS_URL VẮNG MẶT (mặc định của chart khi netpol tắt) ⇒ nguồn đó ok:false, KHÔNG giết cả admin.health', async () => {
    // ⛔ Đây là CẤU HÌNH MẶC ĐỊNH của chart, không phải một ca hiếm:
    // `web-deployment.yaml` OMIT hẳn biến khi cổng admin 8083 không lên Service,
    // và nó không lên Service khi `networkPolicy.platform.enabled` tắt — mặc định
    // của cả ba bộ values. `gatewayMetricsUrl()` là `requireEnv` nên nó NÉM — nếu
    // lời gọi đó không được bọc, cả trang quản trị trả 500 thay vì hiện một
    // nguồn hỏng cạnh một nguồn khoẻ.
    const saved = process.env['GATEWAY_METRICS_URL'];
    delete process.env['GATEWAY_METRICS_URL'];
    try {
      stubFetch({ orchestrator: ok200(REAL_METRICS) });
      const health = await fetchAdminHealth(ctx);

      const gateway = sourceNamed(health.sources, 'gateway');
      expect(gateway.reached).toBe(false);
      expect(gateway.ok).toBe(false);
      expect(gateway.error).toContain('chưa cấu hình');

      // Vế còn lại: nguồn KIA vẫn phải chạy bình thường — một nguồn thiếu cấu
      // hình không được kéo theo nguồn còn lại.
      expect(sourceNamed(health.sources, 'orchestrator').ok).toBe(true);
    } finally {
      if (saved !== undefined) {
        process.env['GATEWAY_METRICS_URL'] = saved;
      }
    }
  });

  it('CHỈ gateway bị chặn ⇒ đúng nguồn đó đỏ, orchestrator vẫn xanh (hình dạng của "một nửa cạnh rơi")', async () => {
    // Ca này gác đúng chế độ hỏng mà thay đổi P13 vừa đóng, theo chiều NGƯỢC với
    // ca ECONNREFUSED ở trên (ca kia chặn orchestrator). Hai cạnh mạng của
    // `admin.health` được dựng bởi hai khối netpol khác nhau (12b cho gateway,
    // 13b cho orchestrator) cộng hai nửa egress; nếu nửa của gateway rơi — netpol
    // ngoài chart, CNI khác, ai đó gỡ nhầm rule — thì cụm hiện ra ĐÚNG hình dạng
    // dưới đây. Nó phải đọc ra "gateway không với tới", KHÔNG được đọc ra
    // "admin.health hỏng" và tuyệt đối không được biến mất thành một dấu xanh.
    stubFetch({
      orchestrator: ok200(REAL_METRICS),
      gateway: refused('connect ETIMEDOUT 10.244.211.92:8083'),
    });
    const health = await fetchAdminHealth(ctx);
    const gateway = sourceNamed(health.sources, 'gateway');
    const orchestrator = sourceNamed(health.sources, 'orchestrator');

    expect(gateway.reached).toBe(false);
    expect(gateway.ok).toBe(false);
    expect(gateway.error).toContain('ETIMEDOUT');
    expect(gateway.series).toEqual([]);

    // Vế còn lại — nguồn KIA không được kéo theo. Thiếu vế này thì một `catch`
    // đặt sai tầng (bọc cả `Promise.all` thay vì bọc từng nguồn) vẫn qua cổng.
    expect(orchestrator.reached).toBe(true);
    expect(orchestrator.ok).toBe(true);
    expect(orchestrator.series.length).toBeGreaterThan(0);

    // `capacity` đi đường gRPC riêng, không qua `/metrics` — một nguồn metrics
    // chết KHÔNG được làm mất luôn khối capacity của trang.
    expect(health.capacity).not.toBeNull();
  });

  it('CẢ HAI nguồn bị chặn ⇒ không nguồn nào ok, và nói rõ vì sao', async () => {
    stubFetch({ orchestrator: refused('fetch failed'), gateway: refused('fetch failed') });
    const health = await fetchAdminHealth(ctx);
    expect(health.sources).toHaveLength(2);
    expect(health.sources.every((s) => !s.ok && !s.reached && s.error !== null)).toBe(true);
    // Contract C4: hai nguồn LUÔN có mặt trong output — một `sources: []` im
    // lặng đọc y hệt "không có gì để báo".
    expect(health.sources.map((s) => s.name).sort()).toEqual(['gateway', 'orchestrator']);
  });
});
