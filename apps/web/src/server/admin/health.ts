import { fetchCapacity, type CapacityView } from '../capacity/get-capacity';
import { gatewayMetricsUrl, orchestratorMetricsUrl } from '../env';

export interface MetricSeries {
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

/**
 * Trạng thái MỘT nguồn `/metrics`.
 *
 * ⛔ BA trạng thái, không phải hai — và đó là điểm của cả file này:
 *
 * | `reached` | `ok` | nghĩa |
 * |---|---|---|
 * | `true`  | `true`  | với tới được VÀ khoẻ (có ít nhất một series `dlp_*`) |
 * | `true`  | `false` | với tới được nhưng KHÔNG khoẻ (HTTP lỗi, hoặc 200 mà 0 series `dlp_*`) |
 * | `false` | `false` | KHÔNG với tới được (netpol chặn, DNS, timeout, connection refused) |
 *
 * `reached` là field MÁY ĐỌC ĐƯỢC — không bắt UI phải đoán bằng cách so chuỗi
 * `error`. Nó cần thiết vì hai nhánh `ok:false` đòi hai hành động khác hẳn nhau:
 * "sửa mạng/netpol" với "xem vì sao dịch vụ không phát metric".
 *
 * ⚠ Vì sao "200 nhưng 0 series `dlp_*`" là KHÔNG KHOẺ chứ không phải "khoẻ, chưa
 * có số": một reverse-proxy trả trang lỗi HTML, một URL trỏ nhầm dịch vụ, hay
 * một binary quên `MustRegister` đều cho ĐÚNG hình dạng đó — `ok:true,
 * series:[]` — và nó render y hệt một nguồn khoẻ. Đây là `green-that-proves-
 * nothing` ở đúng dạng "định dạng output không mang nổi tín hiệu": cả hai đầu
 * của tình huống đọc ra như nhau. Nguồn khoẻ THẬT luôn phát ít nhất một series
 * `dlp_*` (orchestrator: `dlp_pool_*`; gateway: `dlp_gateway_*`, đều đăng ký
 * lúc khởi động, không đợi request đầu tiên), nên "0 series" là một khẳng định
 * có nội dung, không phải một trạng thái trung tính.
 *
 * ⚠ PHẠM VI CỦA `series`: MỘT REPLICA, KHÔNG PHẢI CẢ DEPLOYMENT.
 * Cả hai nguồn đều đọc qua Service (ClusterIP), mà Service cân bằng tải — nên
 * `series` là ảnh chụp của đúng một pod do kube-proxy chọn, và có thể đổi pod
 * giữa hai lần refresh. Đo trên cụm lab 2026-09-06: `gateway.replicaCount: 2`
 * (values-selfhost) và `orchestrator.replicaCount: 2` (values.yaml mặc định),
 * nên đây là tính chất của CẢ HAI nguồn, không phải điểm riêng của gateway.
 *
 * Điều đó KHÔNG làm `reached`/`ok` sai: replica nào trả lời cũng chứng minh
 * deployment đang phục vụ, và không replica nào trả lời thì `reached:false`.
 * Nhưng nó làm mọi GIÁ TRỊ trong `series` là một MẪU: `dlp_gateway_ws_active`
 * đọc ra 0 không có nghĩa cả fleet đang rảnh. Cần con số cộng dồn thì nguồn đúng
 * là Prometheus — PodMonitor `dlp-gateway` scrape TỪNG pod theo IP (đo được
 * 2026-09-06: job `monitoring/dlp-gateway` có 2 target, đều `up`), và
 * ServiceMonitor `dlp-orchestrator` cho nửa còn lại. UI đọc `series` phải trình
 * bày chúng như số của một instance, không như tổng của hệ.
 */
export interface HealthSource {
  readonly name: 'orchestrator' | 'gateway';
  /** Có nhận được HTTP response nào không (bất kể mã). `false` = không với tới. */
  readonly reached: boolean;
  readonly ok: boolean;
  readonly error: string | null;
  readonly series: readonly MetricSeries[];
}

export interface AdminHealthView {
  readonly fetchedAt: string;
  readonly capacity: CapacityView | null;
  readonly sources: readonly HealthSource[];
}

/**
 * Parser tối giản của format text Prometheus (`# HELP`/`# TYPE` bỏ qua, mỗi
 * dòng dữ liệu là `metric{label="value",...} number`). KHÔNG dùng thư viện:
 * `admin.health` chỉ cần TÊN + LABEL + GIÁ TRỊ của các series `dlp_*`, không
 * cần histogram bucket/quantile hay exemplar OpenMetrics — một regex là đủ và
 * không kéo thêm dependency cho một trang quản trị đọc-một-lần.
 */
const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)(?:\s+\d+)?$/;
const LABEL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function parseValue(raw: string): number {
  if (raw === '+Inf') return Infinity;
  if (raw === '-Inf') return -Infinity;
  if (raw === 'NaN') return NaN;
  return Number(raw);
}

export function parsePrometheusText(text: string): MetricSeries[] {
  const out: MetricSeries[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const match = LINE_RE.exec(line);
    if (match === null) {
      continue;
    }
    const [, name, labelsStr, rawValue] = match;
    if (name === undefined || rawValue === undefined || !name.startsWith('dlp_')) {
      continue;
    }
    const labels: Record<string, string> = {};
    for (const labelMatch of (labelsStr ?? '').matchAll(LABEL_RE)) {
      const key = labelMatch[1];
      const value = labelMatch[2];
      if (key !== undefined && value !== undefined) {
        labels[key] = value.replace(/\\"/g, '"');
      }
    }
    out.push({ name, labels, value: parseValue(rawValue) });
  }
  return out;
}

const METRICS_FETCH_TIMEOUT_MS = 10_000;

/**
 * URL của một nguồn, hoặc `null` khi CHƯA ĐƯỢC CẤU HÌNH.
 *
 * ⛔ ĐÃ ĐO trên chart thật, không phải phòng xa: `web-deployment.yaml` **OMIT**
 * hẳn biến `GATEWAY_METRICS_URL` khi không có URL nào để đặt.
 *
 * Khi nào thì không có: cổng admin 8083 của gateway chỉ lên Service khi
 * `platform.gatewayAdminOnService` đúng — mặc định `exposeAdminPort: auto`, tức
 * THEO `networkPolicy.platform.enabled`. Nên trên một cụm CHƯA siết netpol (mặc
 * định của chart) biến này vắng mặt, và đó là một cấu hình hợp lệ chứ không phải
 * một cụm hỏng. `ORCHESTRATOR_METRICS_URL` thì luôn có (cổng HTTP 8081 nằm sẵn
 * trên Service), nên hai nguồn KHÔNG cùng vắng cùng có — đúng lý do `sources`
 * phải mang trạng thái riêng cho từng nguồn.
 *
 * Khẳng định "báo lỗi có kiểm soát" KHÔNG tự đúng nếu ta gọi thẳng
 * `gatewayMetricsUrl()`: nó là `requireEnv`, tức nó NÉM khi biến vắng mặt — và
 * vì lời gọi nằm ngoài `try` của `fetchSource`, cú ném đó giết CẢ `admin.health`
 * (500) thay vì hiện một nguồn `ok:false` cạnh một nguồn `ok:true`. Nói cách
 * khác: đúng cấu hình mặc định của chart sẽ làm trang quản trị trắng.
 *
 * Nên "chưa cấu hình" là một TRẠNG THÁI, không phải một lỗi hệ thống — và nó
 * phải nói rõ mình là gì, để không ai đọc nhầm thành "gateway chết".
 */
function resolveUrl(read: () => string): string | null {
  try {
    return read();
  } catch {
    return null;
  }
}

async function fetchSource(name: HealthSource['name'], url: string | null): Promise<HealthSource> {
  if (url === null) {
    return {
      name,
      reached: false,
      ok: false,
      error: 'chưa cấu hình URL /metrics cho nguồn này (biến môi trường vắng mặt)',
      series: [],
    };
  }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(METRICS_FETCH_TIMEOUT_MS) });
  } catch (cause) {
    // KHÔNG với tới được — DNS, timeout, connection refused, hoặc NetworkPolicy
    // drop gói. Đây không phải nhánh phòng xa: mỗi nửa cạnh mạng còn thiếu đều
    // rơi vào đây, và nó phải nói đúng "không với tới" chứ không được lẫn với
    // "với tới rồi nhưng hỏng" — hai nhánh đó đòi hai hành động khác hẳn nhau.
    //
    // Hai cạnh phải mở, mỗi cạnh HAI nửa (`platform-networkpolicy.yaml`):
    //   web → orchestrator:8081   egress khối 3 + ingress khối 13b
    //   web → gateway:8083        egress khối 3 + ingress khối 12b
    // Cả hai đều gác bởi cùng một vị từ trong chart, nên thiếu nửa là chuyện
    // chart không cho xảy ra — nhưng netpol áp ngoài chart (CNI, cụm khác) thì
    // vẫn rơi vào đây, và đó chính là lúc `reached:false` phải nói ra.
    return {
      name,
      reached: false,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
      series: [],
    };
  }

  if (!response.ok) {
    return { name, reached: true, ok: false, error: `HTTP ${String(response.status)}`, series: [] };
  }

  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    // Kết nối đứt GIỮA CHỪNG khi đang đọc body: header đã về (reached) nhưng
    // nội dung thì không.
    return {
      name,
      reached: true,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
      series: [],
    };
  }

  const series = parsePrometheusText(text);
  if (series.length === 0) {
    // 200 nhưng KHÔNG series `dlp_*` nào — xem chú thích của `HealthSource`.
    return {
      name,
      reached: true,
      ok: false,
      error: 'HTTP 200 nhưng không có series dlp_* nào — sai URL hoặc dịch vụ không phát metric',
      series: [],
    };
  }
  return { name, reached: true, ok: true, error: null, series };
}

export async function fetchAdminHealth(ctx: {
  user: { id: string; role: string };
}): Promise<AdminHealthView> {
  const [capacity, orchestratorSource, gatewaySource] = await Promise.all([
    // `capacity: null` là hợp đồng C4 cho "không lấy được", nhưng LÝ DO thì
    // không được biến mất — nuốt trọn nó làm một orchestrator chết đọc y hệt
    // một orchestrator chưa có phiên nào.
    fetchCapacity(ctx).catch((cause: unknown) => {
      console.warn('[admin:health] không lấy được capacity từ orchestrator', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
      return null;
    }),
    fetchSource('orchestrator', resolveUrl(orchestratorMetricsUrl)),
    fetchSource('gateway', resolveUrl(gatewayMetricsUrl)),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    capacity,
    sources: [orchestratorSource, gatewaySource],
  };
}
