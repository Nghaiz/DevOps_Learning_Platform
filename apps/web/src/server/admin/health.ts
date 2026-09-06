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

async function fetchSource(name: HealthSource['name'], url: string): Promise<HealthSource> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(METRICS_FETCH_TIMEOUT_MS) });
  } catch (cause) {
    // KHÔNG với tới được. Trên cụm hardened đây là nhánh sẽ CHẠY THẬT
    // (`platform-networkpolicy.yaml` khối 9 chặn web→orchestrator:8081, và
    // gateway chưa mở port 8083) — nên nó phải nói đúng "không với tới", không
    // được lẫn với "với tới rồi nhưng hỏng".
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
    fetchSource('orchestrator', orchestratorMetricsUrl()),
    fetchSource('gateway', gatewayMetricsUrl()),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    capacity,
    sources: [orchestratorSource, gatewaySource],
  };
}
