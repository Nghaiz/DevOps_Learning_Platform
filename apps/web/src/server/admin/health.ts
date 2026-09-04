import { fetchCapacity, type CapacityView } from '../capacity/get-capacity';
import { gatewayMetricsUrl, orchestratorMetricsUrl } from '../env';

export interface MetricSeries {
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

export interface HealthSource {
  readonly name: 'orchestrator' | 'gateway';
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
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(METRICS_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      return { name, ok: false, error: `HTTP ${String(response.status)}`, series: [] };
    }
    const text = await response.text();
    return { name, ok: true, error: null, series: parsePrometheusText(text) };
  } catch (cause) {
    // Nguồn KHÔNG với tới được PHẢI hiện ra ở đây, không được nuốt: một
    // `admin.health` trả `sources: []` im lặng đọc y hệt "cả hai đều khoẻ,
    // không có series nào" — chính chế độ hỏng mà contract C4 cấm bằng câu
    // "per-source {ok,error} … không bao giờ nuốt".
    return { name, ok: false, error: cause instanceof Error ? cause.message : String(cause), series: [] };
  }
}

export async function fetchAdminHealth(ctx: {
  user: { id: string; role: string };
}): Promise<AdminHealthView> {
  const [capacity, orchestratorSource, gatewaySource] = await Promise.all([
    fetchCapacity(ctx).catch(() => null),
    fetchSource('orchestrator', orchestratorMetricsUrl()),
    fetchSource('gateway', gatewayMetricsUrl()),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    capacity,
    sources: [orchestratorSource, gatewaySource],
  };
}
