import { describe, expect, it } from 'vitest';
import {
  describeHealthSource,
  describePool,
  formatLabels,
  formatMetricValue,
  isHighlightSeries,
  orderSeries,
  summarizeHealth,
  type HealthSourceView,
  type MetricSeriesView,
} from './health-reading';

/**
 * Bảng sức khoẻ `/admin` là chỗ `green-that-proves-nothing` cắn đau nhất trong
 * cả phase: một nguồn không với tới được trả `series: []`, và mọi con số vẽ ra
 * sẽ là 0 — trông y hệt một hệ thống đang rảnh. Bộ test này gác đúng ranh giới
 * "không đo được" ≠ "đo được và bằng 0".
 */

function source(over: Partial<HealthSourceView> = {}): HealthSourceView {
  return {
    name: 'orchestrator',
    reached: true,
    ok: true,
    error: null,
    series: [{ name: 'dlp_pool_free', labels: {}, value: 3 }],
    ...over,
  };
}

const UNREACHABLE: HealthSourceView = {
  name: 'gateway',
  reached: false,
  ok: false,
  error: 'connect ECONNREFUSED 10.96.0.7:8083',
  series: [],
};

describe('describeHealthSource — nguồn không với tới được', () => {
  it('KHÔNG bao giờ đọc ra "khoẻ"', () => {
    const reading = describeHealthSource(UNREACHABLE);
    expect(reading.tone).toBe('unreachable');
    expect(reading.tone).not.toBe('ok');
  });

  it('không cho phép vẽ bảng số liệu (hasReadings = false)', () => {
    expect(describeHealthSource(UNREACHABLE).hasReadings).toBe(false);
  });

  it('nói rõ số 0 không phải một phép đo', () => {
    expect(describeHealthSource(UNREACHABLE).detail).toContain('không phải "mọi chỉ số bằng 0"');
  });

  it('nêu nguyên văn lý do máy chủ trả về, và việc phải làm tiếp', () => {
    const reading = describeHealthSource(UNREACHABLE);
    expect(reading.detail).toContain('ECONNREFUSED');
    expect(reading.detail).toContain('NetworkPolicy');
  });

  it('nguồn CHƯA CẤU HÌNH URL cũng là "không với tới", không phải "khoẻ"', () => {
    // Đây là mặc định của chart hôm nay: `web-deployment.yaml` omit hẳn
    // GATEWAY_METRICS_URL, và server trả reached:false với câu này.
    const reading = describeHealthSource({
      ...UNREACHABLE,
      error: 'chưa cấu hình URL /metrics cho nguồn này (biến môi trường vắng mặt)',
    });
    expect(reading.tone).toBe('unreachable');
    expect(reading.detail).toContain('chưa cấu hình URL');
  });

  it('vẫn có lý do khi máy chủ trả error rỗng — không để một ô trống', () => {
    const reading = describeHealthSource({ ...UNREACHABLE, error: null });
    expect(reading.detail).toContain('máy chủ không nêu lý do');
  });

  /**
   * FAIL-CLOSED. Payload mâu thuẫn (`reached:false` mà `ok:true`) chỉ có thể do
   * bug phía server hoặc một bản BE cũ hơn chưa có `reached`. Khi hai field cãi
   * nhau, tin field nói rằng ta KHÔNG biết gì.
   */
  it('reached:false + ok:true (payload mâu thuẫn) vẫn KHÔNG đọc ra khoẻ', () => {
    expect(describeHealthSource({ ...UNREACHABLE, ok: true }).tone).toBe('unreachable');
  });
});

describe('describeHealthSource — hai trạng thái còn lại', () => {
  it('với tới được nhưng không khoẻ: tone riêng, không lẫn với "không với tới"', () => {
    const reading = describeHealthSource(
      source({
        reached: true,
        ok: false,
        error: 'HTTP 200 nhưng không có series dlp_* nào',
        series: [],
      }),
    );
    expect(reading.tone).toBe('unhealthy');
    expect(reading.detail).toContain('HTTP 200');
    expect(reading.detail).toContain('/metrics');
  });

  it('khoẻ: đếm đúng số series và cho vẽ bảng', () => {
    const reading = describeHealthSource(source());
    expect(reading.tone).toBe('ok');
    expect(reading.seriesCount).toBe(1);
    expect(reading.hasReadings).toBe(true);
  });

  /** ĐỐI CHỨNG DƯƠNG: ba trạng thái phải cho ba nhãn KHÁC nhau, nếu không badge vô nghĩa. */
  it('ba trạng thái cho ba nhãn khác nhau', () => {
    const labels = [
      describeHealthSource(source()).label,
      describeHealthSource(source({ ok: false })).label,
      describeHealthSource(UNREACHABLE).label,
    ];
    expect(new Set(labels).size).toBe(3);
  });

  it('nguồn lạ giữ nguyên tên máy chủ trả về, không thành chuỗi rỗng', () => {
    expect(describeHealthSource(source({ name: 'sandbox-reaper' })).detail).toContain(
      'sandbox-reaper',
    );
  });
});

describe('summarizeHealth', () => {
  it('một nguồn hỏng giữa các nguồn khoẻ KHÔNG được tóm tắt là ổn', () => {
    const summary = summarizeHealth([source(), UNREACHABLE]);
    expect(summary.tone).not.toBe('ok');
    expect(summary.tone).toBe('degraded');
  });

  it('gọi TÊN nguồn chưa đọc được — "1/2 ổn" không nói được phải sửa cái nào', () => {
    expect(summarizeHealth([source(), UNREACHABLE]).headline).toContain('Terminal gateway');
  });

  it('mẫu số rỗng KHÔNG đọc ra khoẻ', () => {
    const summary = summarizeHealth([]);
    expect(summary.tone).toBe('down');
    expect(summary.headline).toContain('không phải hệ thống khoẻ');
  });

  it('mọi nguồn hỏng: tone down và nói rõ mọi con số bên dưới đều thiếu', () => {
    const summary = summarizeHealth([UNREACHABLE, { ...UNREACHABLE, name: 'orchestrator' }]);
    expect(summary.tone).toBe('down');
    expect(summary.okCount).toBe(0);
  });

  it('đối chứng dương: tất cả khoẻ thì tone ok', () => {
    const summary = summarizeHealth([source(), source({ name: 'gateway' })]);
    expect(summary).toMatchObject({ tone: 'ok', okCount: 2, total: 2 });
  });

  it('nguồn "reached nhưng không ok" cũng bị đếm là chưa đọc được', () => {
    expect(summarizeHealth([source({ ok: false })]).okCount).toBe(0);
  });
});

describe('describePool', () => {
  it('capacity null nói "không đọc được", KHÔNG vẽ 0', () => {
    const reading = describePool(null);
    expect(reading.known).toBe(false);
    expect(reading.text).not.toMatch(/\b0\b/);
    expect(reading.text).toContain('không phải "pool trống"');
  });

  it('poolFree 0 là một phép đo THẬT và được nói ra như số', () => {
    const reading = describePool({ poolFree: 0, poolQuarantine: 2 });
    expect(reading.known).toBe(true);
    expect(reading.text).toContain('0 pod ấm');
    expect(reading.text).toContain('2 pod đang cách ly');
  });
});

describe('formatMetricValue', () => {
  it('NaN không được hiện như một con số', () => {
    expect(formatMetricValue(Number.NaN)).toContain('không đo được');
  });

  it('vô cực nói rõ là vô cực', () => {
    expect(formatMetricValue(Number.POSITIVE_INFINITY)).toContain('+Inf');
    expect(formatMetricValue(Number.NEGATIVE_INFINITY)).toContain('-Inf');
  });

  it('0 vẫn là 0', () => {
    expect(formatMetricValue(0)).toBe('0');
  });
});

describe('orderSeries + formatLabels', () => {
  const series: readonly MetricSeriesView[] = [
    { name: 'dlp_ws_frames_total', labels: {}, value: 1 },
    { name: 'dlp_reap_total', labels: { actor: 'admin' }, value: 0 },
    { name: 'dlp_pool_claimed_size', labels: {}, value: 5 },
  ];

  it('bốn họ pool/claim/reap/exec lên trước', () => {
    expect(orderSeries(series).map((entry) => entry.name)).toEqual([
      'dlp_pool_claimed_size',
      'dlp_reap_total',
      'dlp_ws_frames_total',
    ]);
  });

  it('không làm mất series nào (cắt bớt là tự làm mù chính mình)', () => {
    expect(orderSeries(series)).toHaveLength(series.length);
  });

  it('không sửa mảng gốc', () => {
    const before = series.map((entry) => entry.name);
    orderSeries(series);
    expect(series.map((entry) => entry.name)).toEqual(before);
  });

  it('isHighlightSeries nhận đúng bốn họ và từ chối họ khác', () => {
    expect(isHighlightSeries('dlp_exec_duration_seconds')).toBe(true);
    expect(isHighlightSeries('dlp_claim_wait_seconds')).toBe(true);
    expect(isHighlightSeries('dlp_gateway_sessions')).toBe(false);
  });

  /*
    Bản cũ trả U+2014 cho series không nhãn. Ký tự đó vi phạm luật số 3 của
    design §5, và nó còn đọc ra như "giá trị bị giấu" thay vì "series này vốn
    không có nhãn nào". Câu thay thế nói đúng chuyện thứ hai.
  */
  it('không nhãn thì hiện một câu, không phải ô trống và không phải gạch ngang', () => {
    expect(formatLabels({})).toBe('không nhãn');
  });

  it('nhãn sắp theo tên nên hai lượt đọc không nhảy chỗ', () => {
    expect(formatLabels({ tier: 'kata', actor: 'admin' })).toBe('actor=admin, tier=kata');
  });
});
