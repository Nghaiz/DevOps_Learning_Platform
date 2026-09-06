import type { BadgeVariant } from '@devops-platform/ui';

/**
 * Đọc `admin.health` (C4) thành câu tiếng Việt cho bảng sức khoẻ của `/admin`.
 *
 * ## Luật của cả file: một nguồn KHÔNG với tới được KHÔNG BAO GIỜ đọc ra "khoẻ"
 *
 * `admin.health` trả BA trạng thái, không phải hai (xem chú thích `HealthSource`
 * trong `apps/web/src/server/admin/health.ts`): `reached` × `ok`. Cột `reached`
 * tồn tại chính vì hai nhánh `ok:false` đòi hai hành động khác hẳn nhau — "sửa
 * mạng/netpol" với "xem vì sao dịch vụ không phát metric".
 *
 * Đây là chỗ dễ nhất để phạm `green-that-proves-nothing`: một nguồn không với
 * tới được có `series: []`, và một bảng vẽ thẳng số liệu sẽ hiện 0 cho mọi chỉ
 * số. Số 0 đó trông y hệt "hệ thống đang rảnh". Nên mọi hàm dưới đây phân biệt
 * *không đo được* với *đo được và bằng 0*, và câu chữ nói thẳng điều đó.
 *
 * ⛔ **Không đoán trạng thái bằng cách so chuỗi `error`.** Máy chủ cố ý cấp
 * `reached` làm field MÁY ĐỌC ĐƯỢC để UI khỏi phải làm vậy; một
 * `error.includes('chưa cấu hình')` ở đây sẽ mục ngay lần đầu ai đó sửa câu chữ
 * phía server. `error` chỉ được hiện NGUYÊN VĂN như lý do.
 *
 * Kiểu khai theo CẤU TRÚC (không `inferRouterOutputs`) để file chạy được trong
 * test node thuần — cùng lý lẽ và cùng khuôn với `components/shell/capacity.ts`.
 * Cổng kiểu không mất: `health-panel.tsx` truyền thẳng output thật của router
 * vào đây, nên BE bỏ một field là đỏ ở chỗ gọi.
 */

export interface MetricSeriesView {
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

export interface HealthSourceView {
  readonly name: string;
  /** Có nhận được HTTP response nào không (bất kể mã). `false` = không với tới. */
  readonly reached: boolean;
  readonly ok: boolean;
  readonly error: string | null;
  readonly series: readonly MetricSeriesView[];
}

export type HealthTone = 'ok' | 'unhealthy' | 'unreachable';

export interface HealthReading {
  readonly tone: HealthTone;
  /** Nhãn ngắn cho badge. */
  readonly label: string;
  readonly badgeVariant: BadgeVariant;
  /** Chuyện gì đã xảy ra + làm gì tiếp. */
  readonly detail: string;
  readonly seriesCount: number;
  /** `false` ⇒ bảng số liệu của nguồn này KHÔNG được vẽ (không có gì để vẽ). */
  readonly hasReadings: boolean;
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  orchestrator: 'Orchestrator',
  gateway: 'Terminal gateway',
};

/** Tên nguồn cho người đọc; nguồn lạ giữ NGUYÊN tên máy chủ trả về, không rỗng. */
export function describeSourceName(name: string): string {
  return SOURCE_LABEL[name] ?? name;
}

function reason(error: string | null): string {
  return error === null || error.trim() === '' ? 'máy chủ không nêu lý do' : error;
}

/**
 * ⚠ Thứ tự các nhánh dưới đây LÀ luật, không phải phong cách.
 *
 * `reached` xét TRƯỚC `ok`. Một payload mâu thuẫn (`reached:false, ok:true` —
 * bug phía server, hoặc một bản BE cũ hơn chưa có `reached`) phải rơi vào nhánh
 * "không với tới", không phải nhánh "khoẻ". Fail-closed: khi hai field cãi
 * nhau, tin field nói rằng ta KHÔNG biết gì.
 */
export function describeHealthSource(source: HealthSourceView): HealthReading {
  const who = describeSourceName(source.name);

  if (!source.reached) {
    return {
      tone: 'unreachable',
      label: 'Không với tới được',
      badgeVariant: 'warning',
      detail:
        `${who} không trả lời: ${reason(source.error)}. ` +
        'Chưa đọc được số liệu nào — đây không phải "mọi chỉ số bằng 0". ' +
        'Kiểm NetworkPolicy và Service của nguồn này, hoặc đọc metric qua Prometheus.',
      seriesCount: 0,
      hasReadings: false,
    };
  }

  if (!source.ok) {
    return {
      tone: 'unhealthy',
      label: 'Trả lời nhưng không dùng được',
      badgeVariant: 'destructive',
      detail:
        `${who} có trả lời nhưng không cho số liệu dùng được: ${reason(source.error)}. ` +
        'Kiểm URL /metrics có trỏ đúng dịch vụ không, và dịch vụ có đăng ký metric dlp_* lúc khởi động không.',
      seriesCount: source.series.length,
      hasReadings: source.series.length > 0,
    };
  }

  return {
    tone: 'ok',
    label: 'Đang phát metric',
    badgeVariant: 'success',
    detail: `${who} trả lời và đang phát ${String(source.series.length)} chỉ số dlp_*.`,
    seriesCount: source.series.length,
    hasReadings: source.series.length > 0,
  };
}

export interface HealthSummary {
  readonly total: number;
  readonly okCount: number;
  readonly tone: 'ok' | 'degraded' | 'down';
  readonly headline: string;
}

/**
 * Một câu cho cả bảng.
 *
 * Hai ca dễ nói dối, và cả hai được xử lý tường minh:
 *
 * · **Không có nguồn nào** (`sources: []`) ⇒ `down`, KHÔNG phải `ok`. "0/0
 *   nguồn lỗi" là tỉ lệ trên mẫu số rỗng — nó vẽ ra y hệt một hệ khoẻ mạnh.
 * · **Một nguồn hỏng giữa các nguồn khoẻ** ⇒ `degraded`, và câu tóm tắt phải
 *   GỌI TÊN nguồn hỏng. Câu "1/2 nguồn ổn" không nói được cần đi sửa cái nào.
 */
export function summarizeHealth(sources: readonly HealthSourceView[]): HealthSummary {
  const total = sources.length;
  if (total === 0) {
    return {
      total: 0,
      okCount: 0,
      tone: 'down',
      headline:
        'Không có nguồn metric nào để đọc. Bảng trống ở đây nghĩa là chưa cấu hình được gì, không phải hệ thống khoẻ.',
    };
  }

  const failing = sources.filter((source) => !source.reached || !source.ok);
  const okCount = total - failing.length;
  const names = failing.map((source) => describeSourceName(source.name)).join(', ');

  if (failing.length === 0) {
    return {
      total,
      okCount,
      tone: 'ok',
      headline: `Cả ${String(total)} nguồn đều đang phát metric.`,
    };
  }

  if (okCount === 0) {
    return {
      total,
      okCount,
      tone: 'down',
      headline: `Không đọc được nguồn nào (0/${String(total)}): ${names}. Mọi con số bên dưới đều thiếu.`,
    };
  }

  return {
    total,
    okCount,
    tone: 'degraded',
    headline: `Đọc được ${String(okCount)}/${String(total)} nguồn. Chưa đọc được: ${names}.`,
  };
}

export interface PoolReading {
  /** `false` ⇒ không có số để hiện; đừng vẽ 0. */
  readonly known: boolean;
  readonly text: string;
}

/**
 * Pool pod ấm — `capacity` của `admin.health`, có thể `null` khi orchestrator
 * không trả lời (hợp đồng C4).
 *
 * `null` ⇒ nói "không đọc được", KHÔNG vẽ 0. `poolFree: 0` là một sự thật đo
 * được ("pool đã cạn, phiên mới phải chờ tạo pod"); `capacity: null` là "ta
 * không biết". Vẽ cả hai thành 0 là gộp một cảnh báo thật với một khoảng trống
 * — và người trực sẽ đi tìm nhầm chỗ.
 */
export function describePool(
  capacity: { readonly poolFree: number; readonly poolQuarantine: number } | null,
): PoolReading {
  if (capacity === null) {
    return {
      known: false,
      text: 'Không đọc được pool từ orchestrator — đây không phải "pool trống". Xem trạng thái nguồn Orchestrator ở trên.',
    };
  }
  return {
    known: true,
    text: `${String(capacity.poolFree)} pod ấm sẵn sàng, ${String(capacity.poolQuarantine)} pod đang cách ly.`,
  };
}

/**
 * Bốn họ metric mà AC 13.G mục 23 gọi tên: pool, claim, reap, exec. Chúng lên
 * đầu bảng; phần còn lại vẫn hiện đủ (cắt bớt là tự làm mù chính mình), chỉ xếp
 * sau.
 */
const HIGHLIGHT_PREFIXES: readonly string[] = ['dlp_pool', 'dlp_claim', 'dlp_reap', 'dlp_exec'];

export function isHighlightSeries(name: string): boolean {
  return HIGHLIGHT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Bốn họ chính lên trước; trong mỗi nhóm sắp theo tên rồi theo nhãn — thứ tự ỔN ĐỊNH giữa hai lượt đọc. */
export function orderSeries(series: readonly MetricSeriesView[]): readonly MetricSeriesView[] {
  return [...series].sort((left, right) => {
    const leftKey = isHighlightSeries(left.name) ? 0 : 1;
    const rightKey = isHighlightSeries(right.name) ? 0 : 1;
    if (leftKey !== rightKey) {
      return leftKey - rightKey;
    }
    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }
    return formatLabels(left.labels).localeCompare(formatLabels(right.labels));
  });
}

/**
 * Giá trị một series.
 *
 * `NaN` và vô cực là giá trị HỢP LỆ của format text Prometheus và parser phía
 * server giữ nguyên chúng (`parseValue` trong `server/admin/health.ts`).
 * `String(NaN)` cho ra chuỗi "NaN" — trông như một số liệu; `String(Infinity)`
 * cho "Infinity". Cả hai phải đọc ra là "không phải một phép đo", chứ không lẫn
 * vào cột số.
 */
export function formatMetricValue(value: number): string {
  if (Number.isNaN(value)) {
    return 'NaN (nguồn báo không đo được)';
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 'vô cực (+Inf)';
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return 'âm vô cực (-Inf)';
  }
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

/** Nhãn của series thành `key=value, key=value`; không nhãn thì trả dấu gạch, không phải chuỗi rỗng. */
export function formatLabels(labels: Readonly<Record<string, string>>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return '—';
  }
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
