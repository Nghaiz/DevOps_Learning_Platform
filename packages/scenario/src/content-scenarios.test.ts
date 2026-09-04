import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { parseContentBlocks } from './content-blocks.ts';
import { loadScenarios } from './loader.ts';
import { scenarioSidecarSchema, type ScenarioSidecar } from './sidecar.ts';

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

/** Đọc thẳng `dlp.json` — `notes` là field của sidecar, không chảy vào DTO `Scenario`. */
function readSidecar(id: string): ScenarioSidecar {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(CONTENT_ROOT, id, 'dlp.json'), 'utf8'),
  );
  return scenarioSidecarSchema.parse(raw);
}

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

  it('mọi scenario NHẬP TỪ UPSTREAM khai đủ xuất xứ + license máy đọc được (AC 2.E)', () => {
    const vendored = scenarios.filter((s) => s.source !== null);

    // Khẳng định vẫn còn scenario vendored để kiểm. Thiếu dòng này, một thay đổi
    // biến mọi `source` thành null sẽ làm vòng lặp dưới chạy 0 lần và test XANH —
    // đúng hạng "0 vi phạm vì không kiểm gì cả".
    expect(vendored.length).toBeGreaterThanOrEqual(3);

    for (const scenario of vendored) {
      expect(scenario.source?.license, scenario.id).toMatch(/^(MIT|Apache-2\.0|BSD-3-Clause)$/);
      expect(scenario.source?.commit, scenario.id).toMatch(/^[0-9a-f]{40}$/);
      expect(scenario.source?.repo, scenario.id).toMatch(/^https:\/\/github\.com\//);
    }
  });

  it('scenario first-party (source: null) có LÝ DO ghi trong notes, không phải khai thiếu', () => {
    // `source: null` là một khẳng định ("bài này do ta soạn"), không phải một ô bỏ
    // trống. Ràng buộc nó phải kèm giải thích để lần sau không ai dùng `null` như
    // đường tắt qua schema khi lười tra commit upstream.
    for (const scenario of scenarios.filter((s) => s.source === null)) {
      const sidecar = readSidecar(scenario.id);
      expect(sidecar.notes, scenario.id).toBeTruthy();
      expect(sidecar.notes?.length ?? 0, scenario.id).toBeGreaterThan(40);
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
 * CHUÔNG BÁO cho một tổ hợp CHƯA CÓ SỐ ĐO.
 *
 * `profileForCapabilities` chọn profile `k8s` khi một bài vừa `ide` vừa
 * `kubernetes`, và ô test ở `apps/web/.../catalog.test.ts` ghim lựa chọn đó
 * kèm lý do: `profiles.k8s` đo KHÔNG có IDE trong pod, `profiles.ide` đo KHÔNG
 * có cluster con, và cộng thẳng hai số là phép tính đã sai 18% một lần rồi.
 *
 * Một ô ghim như thế mà không có gì báo khi điều kiện chấm dứt tới thì nó chỉ
 * là một lời hứa tự quên. Đây là cái báo: bài đầu tiên vừa `ide` vừa đòi
 * `kubernetes` sẽ làm ca này ĐỎ, và việc phải làm lúc ấy là ĐO tổ hợp đó rồi
 * thêm một profile, KHÔNG phải nới ca này ra.
 */
describe('content/scenarios — tổ hợp ide + kubernetes chưa được đo', () => {
  it('không nội dung nào vừa layout ide vừa đòi kubernetes', () => {
    const offenders = scenarios
      .filter((s) => s.interfaceLayout === 'ide')
      .filter((s) => (s.requiresCapabilities ?? s.capabilities).includes('kubernetes'))
      .map((s) => s.id);
    expect(
      offenders,
      `Bài ${offenders.join(', ')} vừa dùng IDE vừa đòi cluster con. Tổ hợp này ` +
        `CHƯA có số đo RAM — đo nó rồi thêm một profile, đừng nới test này.`,
    ).toEqual([]);
  });

  it('đối chứng dương: phép lọc thật sự nhìn thấy nội dung', () => {
    // Thiếu vế này thì `scenarios` rỗng cũng cho ra `[]` và ca trên xanh vĩnh
    // viễn mà không kiểm gì — đúng loại xanh-không-chứng-minh-gì.
    expect(scenarios.length).toBeGreaterThan(0);
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
    // `capabilities` = thứ image upstream CUNG CẤP. Không đổi, và không được
    // đổi: nó là sự thật về imageid, không phải về bài học.
    expect(s.capabilities).toEqual(['kubernetes', 'multi-node']);
    // `requiresCapabilities` = thứ bài ĐÒI. Bài này dùng đúng MỘT pod + MỘT
    // ConfigMap; `verify.sh` không chạm node/nodeSelector/taint/DaemonSet ở
    // dòng nào. Trước 2026-09-04 hai khái niệm này bị gộp và bài nhận profile
    // `k8s-multinode` (1536Mi) cho một việc cần 1Gi.
    expect(s.requiresCapabilities).toEqual(['kubernetes']);
    expect(s.intro).not.toBeNull();
    expect(s.finish).not.toBeNull();
  });

  it('dlp-k8s-multinode-scheduling: bài đầu tiên THẬT SỰ đòi hai node', () => {
    const s = get('dlp-k8s-multinode-scheduling');
    expect(s.source).toBeNull(); // first-party
    expect(s.backendImageId).toBe('kubernetes-kubeadm-2nodes-rapid');
    // Ở bài này "cung cấp" và "đòi" TRÙNG nhau — và lời khai tường minh chính
    // là điều phân biệt nó với ckad, nơi hai thứ đó khác nhau.
    expect(s.capabilities).toEqual(['kubernetes', 'multi-node']);
    expect(s.requiresCapabilities).toEqual(['kubernetes', 'multi-node']);
    expect(s.steps).toHaveLength(3);
    for (const step of s.steps) {
      expect(step.verifyScript, `step ${step.index}`).not.toBeNull();
    }
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
