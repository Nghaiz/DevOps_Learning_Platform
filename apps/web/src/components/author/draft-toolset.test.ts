import { describe, expect, it } from 'vitest';
import type { Lab } from '@devops-platform/shared-types/lab';
import type { Playground } from '@devops-platform/shared-types/playground';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { emptyDraft, toDraftInput, type DraftFormState } from './draft-form';
import { draftFromLab, draftFromPlayground, draftFromScenario } from './draft-from-preview';

/**
 * C4 — `toolset` đi TRỌN đường: form → payload gửi server → và ngược lại,
 * DTO → form khi mở lại bản nháp.
 *
 * Vì sao phải kiểm cả hai chiều: một field chỉ đúng chiều GHI sẽ lưu được nhưng
 * mở lại thì trống, và người soạn bấm Lưu lần nữa là xoá mất lựa chọn của chính
 * mình — im lặng, không hoàn tác được. Đó đúng là chế độ hỏng mà
 * `draft-from-preview.ts` đã ghi chú cho cả form.
 */

function lessonForm(over: Partial<DraftFormState> = {}): DraftFormState {
  return { ...emptyDraft(), title: 'Bài một', ...over };
}

describe('emptyDraft — mặc định KHÔNG chọn công cụ nào', () => {
  it('bản nháp mới có toolset rỗng', () => {
    /*
      ⛔ Yêu cầu trực tiếp của người dùng: *"tùy chỉnh từng bài thôi, không phải
      bài nào cũng cần dùng"*. Mặc định bật hết nghe tiện hơn, nhưng mỗi công cụ
      là một lượt cài gói THẬT trong pod lúc setup phiên — bật sẵn cả tám cho
      mọi bài là bắt MỌI người học trả thời gian khởi động cho thứ bài họ mở
      không hề dùng tới.
    */
    expect(emptyDraft().toolset).toEqual([]);
  });
});

describe('toDraftInput — form → payload', () => {
  it('toolset rỗng đi qua thành mảng rỗng, KHÔNG thành null', () => {
    // C4 chốt `readonly string[]`, không dùng `null`. Một `null` thứ hai mang
    // cùng nghĩa "không bật gì" là hai cách viết cùng một sự thật — chỗ để hai
    // call-site xử lý khác nhau.
    const result = toDraftInput('lesson', lessonForm());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.toolset).toEqual([]);
  });

  it('công cụ đã chọn đi vào payload, ĐÚNG thứ tự', () => {
    const result = toDraftInput('lesson', lessonForm({ toolset: ['yq', 'btop'] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.toolset).toEqual(['yq', 'btop']);
  });

  it('payload KHÔNG dùng chung tham chiếu với state của form', () => {
    /*
      Trả về chính mảng trong state là để một chỗ khác sửa được state của form
      từ xa: payload đi qua tRPC và không có gì cấm người nhận `push` vào nó.
      Đây là lý do `toDraftInput` dùng `[...form.toolset]`.
    */
    const form = lessonForm({ toolset: ['yq'] });
    const result = toDraftInput('lesson', form);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.toolset).not.toBe(form.toolset);
  });

  it('lab và playground cũng mang toolset — không phải field riêng của lesson', () => {
    // Cột `toolset` nằm ở `content_items`, dùng chung cho cả ba loại. Một trong
    // ba loại lặng lẽ đánh rơi nó sẽ chỉ lộ ra khi có người soạn lab dùng `yq`.
    for (const kind of ['lab', 'playground'] as const) {
      const result = toDraftInput(kind, lessonForm({ toolset: ['ncdu'] }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.toolset).toEqual(['ncdu']);
    }
  });
});

// ── Chiều ngược: DTO → form ─────────────────────────────────────────────────

const BAI: Scenario = {
  id: 'bai-mot',
  title: 'Bài một',
  description: null,
  difficulty: 'beginner',
  estimatedMinutes: null,
  tier: 'sysbox',
  capabilities: [],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: null,
  toolset: ['btop', 'yq'],
  assets: [],
  source: null,
  intro: null,
  finish: null,
  steps: [{ index: 0, title: null, markdown: 'x', setup: { foreground: null, background: null }, verifyScript: null }],
  ignoredUpstreamFields: [],
} as unknown as Scenario;

describe('draftFrom* — DTO → form', () => {
  it('lesson: toolset đã lưu hiện lại trên form, giữ thứ tự', () => {
    expect(draftFromScenario(BAI).toolset).toEqual(['btop', 'yq']);
  });

  it('tên không có trong danh mục bị BỎ, không lọt vào form', () => {
    /*
      Cột DB là `text`, nên một lượt seed hay một bản vá SQL tay ghi được bất cứ
      chuỗi nào vào. Giữ lại một giá trị mà ô chọn không hiện được nghĩa là lượt
      Lưu kế tiếp âm thầm xoá nó — người soạn không hề biết mình vừa mất gì.
    */
    const la = { ...BAI, toolset: ['btop', 'emacs', 'khong-co-that'] } as unknown as Scenario;
    expect(draftFromScenario(la).toolset).toEqual(['btop']);
  });

  it('toolset rỗng ⇒ form rỗng, không phải form mang mặc định nào', () => {
    const rong = { ...BAI, toolset: [] } as unknown as Scenario;
    expect(draftFromScenario(rong).toolset).toEqual([]);
  });

  it('lab và playground cũng nạp lại được', () => {
    const lab = { ...BAI, setup: { foreground: null, background: null }, passThresholdPercent: 60, leaderboard: false, tasks: [] } as unknown as Lab;
    const san = { ...BAI, ttlSeconds: 1800 } as unknown as Playground;
    expect(draftFromLab(lab).toolset).toEqual(['btop', 'yq']);
    expect(draftFromPlayground(san).toolset).toEqual(['btop', 'yq']);
  });
});

describe('vòng tròn form → payload → form', () => {
  it('chọn, lưu, mở lại ⇒ vẫn đúng những công cụ đó', () => {
    // Phép kiểm này là thứ bắt được lỗi "lưu được nhưng đọc ra thì hỏng" —
    // hạng lỗi mà `validate.ts` đã ghi chú là lý do nó gọi lại chính nguồn DB
    // thay vì chép phép ánh xạ ra bản thứ hai.
    const chon: DraftFormState['toolset'] = ['delta', 'fd'];
    const payload = toDraftInput('lesson', lessonForm({ toolset: chon }));
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;

    const quayLai = draftFromScenario({ ...BAI, toolset: payload.value.toolset } as unknown as Scenario);
    expect(quayLai.toolset).toEqual(chon);
  });
});
