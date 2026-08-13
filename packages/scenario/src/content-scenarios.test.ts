import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { parseContentBlocks } from './content-blocks.ts';
import { loadScenarios } from './loader.ts';

/**
 * Ô AC 2.A/2.E: "Import scenario Katacoda thật → parse không lỗi, hiển thị đủ
 * step (test trên ≥3 scenario mẫu)."
 *
 * Đây là phép đo trên NỘI DUNG THẬT đã vendor về `content/scenarios/`, tại đúng
 * commit ghim trong từng `dlp.json`. Không có fixture tự chế nào ở file này — một
 * parser chỉ gặp format do chính nó sinh ra thì không chứng minh được gì về rủi
 * ro #1 của P2 ("Format Katacoda/Killercoda biến thể → parser lệch", score 9).
 *
 * Bốn scenario được chọn vì chúng KHÁC NHAU về hình dạng, không vì chúng nhiều:
 * step phẳng vs step trong thư mục con, có verify vs không verify nào, có assets
 * vs không, và một ca mang field mà Killercoda không định nghĩa.
 */
const CONTENT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', 'content', 'scenarios');

const scenarios = await loadScenarios(CONTENT_ROOT);
const byId = new Map(scenarios.map((s) => [s.id, s]));

function get(id: string): Scenario {
  const scenario = byId.get(id);
  if (scenario === undefined) {
    throw new Error(
      `thiếu scenario "${id}" trong ${CONTENT_ROOT} — có: ${[...byId.keys()].join(', ')}`,
    );
  }
  return scenario;
}

describe('content/scenarios — parse kho thật', () => {
  it('nạp được ≥3 scenario, không lỗi', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(3);
  });

  it('mọi scenario đều có ≥1 step, step đánh số liên tục từ 0, và markdown không rỗng', () => {
    for (const scenario of scenarios) {
      expect(scenario.steps.length, scenario.id).toBeGreaterThan(0);
      expect(
        scenario.steps.map((s) => s.index),
        scenario.id,
      ).toEqual(scenario.steps.map((_, i) => i));
      for (const step of scenario.steps) {
        expect(step.markdown.trim(), `${scenario.id} step ${step.index}`).not.toBe('');
      }
    }
  });

  it('mọi scenario khai đủ xuất xứ + license máy đọc được (AC 2.E)', () => {
    for (const scenario of scenarios) {
      expect(scenario.source.license, scenario.id).toMatch(/^(MIT|Apache-2\.0|BSD-3-Clause)$/);
      expect(scenario.source.commit, scenario.id).toMatch(/^[0-9a-f]{40}$/);
      expect(scenario.source.repo, scenario.id).toMatch(/^https:\/\/github\.com\//);
    }
  });

  it('markdown của mọi step parse được thành block, không có verb lạ', () => {
    for (const scenario of scenarios) {
      for (const step of scenario.steps) {
        expect(
          () => parseContentBlocks(step.markdown),
          `${scenario.id} step ${step.index}`,
        ).not.toThrow();
      }
      for (const phase of [scenario.intro, scenario.finish]) {
        if (phase !== null) {
          expect(() => parseContentBlocks(phase.markdown), scenario.id).not.toThrow();
        }
      }
    }
  });
});

/**
 * Đối chứng âm cho mỗi biến thể format. "Bốn scenario parse xanh" tự nó không
 * nói được gì nếu cả bốn cùng một hình dạng — mỗi `it` dưới đây khẳng định ĐÚNG
 * cái khác biệt mà scenario đó được chọn để mang.
 */
describe('content/scenarios — từng biến thể format', () => {
  it('ckad: verify theo từng step + field lạ courseData được ghi lại chứ không nuốt', () => {
    const s = get('ckad-configmap-as-files');
    expect(s.ignoredUpstreamFields).toEqual(['details.intro.courseData']);
    expect(s.steps[0]?.verifyScript).toContain('kubectl');
    expect(s.backendImageId).toBe('kubernetes-kubeadm-2nodes');
    expect(s.capabilities).toEqual(['kubernetes', 'multi-node']);
    expect(s.intro).not.toBeNull();
    expect(s.finish).not.toBeNull();
  });

  it('prolug: step nằm trong THƯ MỤC CON, intro dùng background chứ không foreground', () => {
    const s = get('prolug-linux-system-checking');
    expect(s.steps).toHaveLength(3);
    for (const step of s.steps) {
      expect(step.verifyScript, `step ${step.index}`).not.toBeNull();
    }
    expect(s.intro?.setup.background).not.toBeNull();
    expect(s.intro?.setup.foreground).toBeNull();
    expect(s.capabilities).toEqual([]);
  });

  it('loki: step KHÔNG có title và KHÔNG phase nào có verify — nút Check phải ẩn được', () => {
    const s = get('loki-quickstart');
    expect(s.steps.map((step) => step.title)).toEqual(s.steps.map(() => null));
    expect(s.steps.every((step) => step.verifyScript === null)).toBe(true);
    expect(s.intro?.setup.foreground).not.toBeNull();
  });

  it('loxilb: có assets kèm chmod, và intro cũng chấm được', () => {
    const s = get('loxilb-tcp-load-balancing');
    expect(s.assets.length).toBeGreaterThan(0);
    expect(new Set(s.assets.map((a) => a.host))).toEqual(new Set(['host01']));
    expect(s.assets.some((a) => a.chmod === '+rwx')).toBe(true);
    expect(s.intro?.verifyScript).not.toBeNull();
    expect(s.intro?.setup.foreground).not.toBeNull();
    expect(s.intro?.setup.background).not.toBeNull();
  });

  it('bộ mẫu phủ được cả hai cực: có verify và không verify nào', () => {
    const withVerify = scenarios.filter((s) => s.steps.some((step) => step.verifyScript !== null));
    const withoutVerify = scenarios.filter((s) =>
      s.steps.every((step) => step.verifyScript === null),
    );
    expect(withVerify.length, 'cần ≥1 scenario chấm được để 2.C có gì mà chạy').toBeGreaterThan(0);
    expect(
      withoutVerify.length,
      'cần ≥1 scenario không chấm để 2.D không giả định luôn có Check',
    ).toBeGreaterThan(0);
  });
});

/**
 * `{{exec}}` là thứ 2.D nối vào terminal. Nếu KHÔNG scenario nào trong bộ mẫu có
 * nút chạy được, thì AC "code copy button hoạt động" của 2.D sẽ được nghiệm thu
 * trên một bộ nội dung không bao giờ kích hoạt đường đó.
 */
describe('content/scenarios — hành động code có thật trong nội dung', () => {
  it('ít nhất một scenario mang nút bấm-để-chạy', () => {
    const execCounts = scenarios.map((scenario) => ({
      id: scenario.id,
      count: scenario.steps
        .flatMap((step) => parseContentBlocks(step.markdown))
        .filter((block) => block.kind === 'code' && block.action !== 'none').length,
    }));
    expect(
      execCounts.some((entry) => entry.count > 0),
      JSON.stringify(execCounts),
    ).toBe(true);
  });

  /**
   * Đối chứng âm trên nội dung THẬT, mạnh hơn ca tổng hợp ở content-blocks.test.ts:
   * `loxilb` step 3 có đúng một cặp `{{…}}` và nó nằm trong
   * `[ACCESS WIRESHARK]({{TRAFFIC_HOST1_3000}})`. Một parser đi tìm `{{…}}` trần
   * trụi sẽ biến nó thành nút bấm — và số 0 dưới đây là thứ duy nhất nói rằng
   * điều đó KHÔNG xảy ra.
   */
  it('biến TRAFFIC trong nội dung thật không bị biến thành nút', () => {
    const loxilb = get('loxilb-tcp-load-balancing');
    const raw = loxilb.steps.map((step) => step.markdown).join('\n');
    expect(
      raw,
      'nội dung mẫu phải THẬT SỰ chứa một biến TRAFFIC, nếu không phép kiểm này rỗng',
    ).toContain('{{TRAFFIC_HOST1_3000}}');
    const actions = loxilb.steps
      .flatMap((step) => parseContentBlocks(step.markdown))
      .filter((block) => block.kind === 'code');
    expect(actions).toEqual([]);
  });
});

/**
 * Chất lượng của chính verify script — thứ 2.C sẽ chạy trong pod.
 *
 * Không phải phép kiểm về parser: nó là một CẢNH BÁO ĐÓNG BĂNG cho chặng sau.
 * Ba script verify của `prolug` đều là `/bin/true`, tức chúng LUÔN exit 0. Nếu
 * 2.C chọn prolug làm bằng chứng cho ô AC "bấm Check → pass/fail đúng (1 step
 * pass + 1 step fail)", ô đó sẽ xanh mà không chứng minh gì — vế "fail" là bất
 * khả trên nội dung ấy.
 */
describe('content/scenarios — verify script có thật sự kiểm gì không', () => {
  const isNoOp = (script: string): boolean =>
    script
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .every((line) => line === '/bin/true' || line === 'true' || line === 'exit 0');

  it('prolug dùng verify no-op — ĐỪNG chọn nó làm bằng chứng pass/fail của 2.C', () => {
    for (const step of get('prolug-linux-system-checking').steps) {
      expect(step.verifyScript, `step ${step.index}`).not.toBeNull();
      expect(isNoOp(step.verifyScript ?? ''), `step ${step.index}`).toBe(true);
    }
  });

  it('ít nhất một scenario có verify thật sự soi trạng thái — 2.C có vật liệu để chấm', () => {
    const real = scenarios.flatMap((scenario) =>
      [...scenario.steps, scenario.intro, scenario.finish]
        .filter((phase) => phase !== null && phase.verifyScript !== null)
        .filter((phase) => !isNoOp(phase?.verifyScript ?? ''))
        .map(() => scenario.id),
    );
    expect([...new Set(real)].length, 'bộ mẫu không có verify thật nào').toBeGreaterThan(0);
  });
});
