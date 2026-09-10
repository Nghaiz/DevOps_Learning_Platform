import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARC_GAP_DEG, ARC_START_DEG, ARC_SWEEP_DEG } from '@devops-platform/motion/motif';
import {
  STAGES,
  STAGE_COUNT,
  angleAtProgress,
  angleOfStage,
  snapProgress,
  stageIndexAtProgress,
  stagePointAt,
} from './loop-stages';
import { hasHardwareWebgl2, type WebglProbeDocument } from './webgl-support';
import {
  HOME_SCENE_TOKEN_NAMES,
  HOME_SCENE_TOKEN_VARS,
  fallbackHomeSceneColors,
  readHomeSceneColors,
} from './scene-colors';

/**
 * Ô nghiệm thu của dải bảy chặng.
 *
 * Ba nhóm, và nhóm thứ ba mới là nhóm khó thay thế: hai quyết định kỹ thuật của
 * `design §7.1` và `§7.2` hỏng **IM LẶNG** nếu ai đó gỡ chúng. Không có ngoại
 * lệ nào bị ném, không có dòng log nào, chỉ có một trang chủ mất HTML server
 * hoặc một `securitypolicyviolation` mà chỉ trình duyệt thật mới bắn ra. Một
 * lượt quét tĩnh trên chính mã nguồn là phép đo duy nhất chạy được trong suite.
 */

const HERE = import.meta.dirname;

function source(file: string): string {
  return readFileSync(path.join(HERE, file), 'utf8');
}

describe('hình học bảy chặng', () => {
  it('đúng bảy chặng, id không trùng, và mỗi chặng có đủ hai khoá chữ', () => {
    expect(STAGE_COUNT).toBe(7);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(7);
    for (const stage of STAGES) {
      expect(stage.title).toBe(`home.stage-title.${stage.id}`);
      expect(stage.body).toBe(`home.stage-body.${stage.id}`);
    }
  });

  it('chặng đầu ở đầu cung, chặng cuối ở cuối cung', () => {
    expect(angleOfStage(0)).toBeCloseTo(ARC_START_DEG, 10);
    expect(angleOfStage(6)).toBeCloseTo(ARC_START_DEG + ARC_SWEEP_DEG, 10);
  });

  /*
    Khe hở của vòng là thứ mang NGHĨA, không phải chỗ thừa: logo PTIT có một
    ellipse hở, và ở đây khoảng hở đó nằm đúng giữa chặng bảy và chặng một, tức
    chỗ vòng lặp bắt đầu lại. Một lượt đổi `ARC_SWEEP_DEG` thành 360 sẽ khép
    vòng và xoá mất chi tiết đó mà không có gì khác đỏ.
  */
  it('khoảng từ chặng cuối vòng về chặng đầu đúng bằng khe hở của motif', () => {
    const gap = 360 - (angleOfStage(6) - angleOfStage(0));
    expect(gap).toBeCloseTo(ARC_GAP_DEG, 10);
    expect(gap).toBeGreaterThan(0);
  });

  it('chỉ số chặng làm TRÒN chứ không cắt', () => {
    // Ở giữa chặng bốn và năm, `Math.floor` sẽ nói chặng ba trong khi camera đã
    // đi qua nó. Con số dưới là `p` ứng với chặng thứ 3.6 trên thang 0..6.
    expect(stageIndexAtProgress(3.6 / 6)).toBe(4);
    expect(stageIndexAtProgress(0)).toBe(0);
    expect(stageIndexAtProgress(1)).toBe(6);
  });

  it('tiến độ ngoài miền bị kẹp, NaN về chặng đầu chứ không về chặng cuối', () => {
    expect(angleAtProgress(-5)).toBeCloseTo(ARC_START_DEG, 10);
    expect(angleAtProgress(9)).toBeCloseTo(ARC_START_DEG + ARC_SWEEP_DEG, 10);
    expect(stageIndexAtProgress(Number.NaN)).toBe(0);
    expect(angleOfStage(Number.NaN)).toBeCloseTo(ARC_START_DEG, 10);
  });

  /*
    Nửa thứ hai của cổng giảm chuyển động. Nửa thứ nhất (`startGatedFrameLoop`)
    ngừng cấp khung; hàm này bảo đảm những khung lẻ do cuộn sinh ra rơi vào một
    tư thế ĐÃ THIẾT KẾ. Thiếu nó thì cảnh vẫn nội suy, chỉ là nội suy giật.
  */
  it('snapProgress đưa mọi tiến độ về đúng một trong bảy chặng', () => {
    const allowed = new Set([0, 1, 2, 3, 4, 5, 6].map((i) => i / 6));
    for (const raw of [0, 0.03, 0.2, 0.41, 0.5, 0.77, 0.99, 1]) {
      const snapped = snapProgress(raw);
      expect([...allowed].some((a) => Math.abs(a - snapped) < 1e-9)).toBe(true);
    }
  });

  it('bảy chặng nằm ở bảy vị trí khác nhau trong mặt phẳng cảnh', () => {
    const seen = STAGES.map((_, i) => {
      const p = stagePointAt(angleOfStage(i));
      return `${p.x.toFixed(4)}:${p.z.toFixed(4)}`;
    });
    expect(new Set(seen).size).toBe(7);
  });
});

describe('dò WebGL2', () => {
  function docWith(
    getContext: (id: 'webgl2', opts?: WebGLContextAttributes) => WebGL2RenderingContext | null,
  ): WebglProbeDocument {
    return { createElement: () => ({ getContext }) };
  }

  it('không có webgl2 ⇒ false', () => {
    expect(hasHardwareWebgl2(docWith(() => null))).toBe(false);
  });

  it('getContext ném ⇒ false, không để lỗi thoát ra ngoài', () => {
    expect(
      hasHardwareWebgl2(
        docWith(() => {
          throw new Error('bị chặn');
        }),
      ),
    ).toBe(false);
  });

  /*
    ĐÂY là ô quan trọng nhất của cả nhóm. Repo đã đo: tắt hardware acceleration
    KHÔNG gỡ WebGL2, Chrome rơi về SwiftShader và trả lời "có" cho mọi phép dò
    ngây thơ. `failIfMajorPerformanceCaveat` là cờ duy nhất bắt trình duyệt nói
    ra rằng context nó sắp cấp là context phần mềm. Ô này khẳng định cờ đó THẬT
    SỰ được gửi đi, chứ không chỉ có mặt trong một chú thích.
  */
  it('luôn gửi failIfMajorPerformanceCaveat: true', () => {
    let seen: WebGLContextAttributes | undefined;
    hasHardwareWebgl2(
      docWith((_id, opts) => {
        seen = opts;
        return null;
      }),
    );
    expect(seen?.failIfMajorPerformanceCaveat).toBe(true);
  });

  it('có context ⇒ true, và context được trả lại ngay', () => {
    let lost = 0;
    const gl = {
      getExtension: (name: string) =>
        name === 'WEBGL_lose_context'
          ? {
              loseContext: () => {
                lost += 1;
              },
            }
          : null,
    } as unknown as WebGL2RenderingContext;

    expect(hasHardwareWebgl2(docWith(() => gl))).toBe(true);
    expect(lost).toBe(1);
  });

  it('không trả lại được context vẫn là CÓ WebGL2', () => {
    const gl = {
      getExtension: () => {
        throw new Error('bị chặn');
      },
    } as unknown as WebGL2RenderingContext;
    expect(hasHardwareWebgl2(docWith(() => gl))).toBe(true);
  });
});

describe('màu cảnh đọc từ token', () => {
  it('bảy token, tất cả đều là biến ngữ nghĩa, không có token thương hiệu', () => {
    expect(HOME_SCENE_TOKEN_NAMES).toHaveLength(7);
    for (const name of HOME_SCENE_TOKEN_NAMES) {
      const variable = HOME_SCENE_TOKEN_VARS[name];
      expect(variable.startsWith('--')).toBe(true);
      // §1.5 của hợp đồng token: `--brand-*` chỉ tái hiện nhận diện, không bao
      // giờ là màu giao diện. Một vòng ellipse 3D là giao diện.
      expect(variable.startsWith('--brand-')).toBe(false);
    }
  });

  it('token không phân giải được ⇒ degraded, và màu dự phòng nhìn thấy được', () => {
    const probe = { style: { color: '' } } as unknown as HTMLElement;
    const { colors, degraded } = readHomeSceneColors(
      probe,
      () => '',
      () => null,
    );
    expect(degraded).toBe(true);
    // Xám chứ không đen: đen trên nền tối là vô hình, mà vô hình đọc ra thành
    // cảnh hỏng chứ không thành cảnh thiếu màu.
    expect(colors.flow).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(fallbackHomeSceneColors().track).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
  });

  it('phân giải được cả bảy ⇒ không degraded, và mỗi token đi qua đúng biến của nó', () => {
    const asked: string[] = [];
    const probe = { style: { color: '' } } as unknown as HTMLElement;
    const { colors, degraded } = readHomeSceneColors(
      probe,
      (el) => {
        asked.push(el.style.color);
        return 'rgb(10, 20, 30)';
      },
      () => ({ r: 0.1, g: 0.2, b: 0.3 }),
    );
    expect(degraded).toBe(false);
    expect(colors.active).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    expect(asked).toEqual(HOME_SCENE_TOKEN_NAMES.map((n) => `var(${HOME_SCENE_TOKEN_VARS[n]})`));
  });
});

/*
  ── Quét tĩnh: ba quả mìn của design §7.1 và §7.2 ──────────────────────────

  Cả ba hỏng IM LẶNG. Không ô test nào chạy trong jsdom bắt được chúng, vì hai
  cái đầu chỉ lộ ra ở lượt dựng phía máy chủ của một trang thật, còn cái thứ ba
  chỉ lộ ra dưới một CSP thật trên một trình duyệt thật.
*/
describe('quét tĩnh · ba thứ cảnh 3D không được phép chạm tới', () => {
  const SCENE_FILES = ['loop-scene.tsx', 'loop-story-client.tsx'] as const;

  it('tập file quét không rỗng và đọc được', () => {
    for (const file of SCENE_FILES) {
      expect(source(file).length).toBeGreaterThan(500);
    }
  });

  it('không import gì từ @react-three/drei', () => {
    /*
      `ScrollControls` render chữ vào một React root THỨ HAI qua
      `ReactDOM.createRoot`, nên chữ trong `<Scroll html>` không có HTML server:
      mất LCP, mất SEO. `<Text>` kéo `troika-worker-utils`, thứ dò worker bằng
      `new Worker(URL.createObjectURL(new Blob(...)))`; CSP của dự án không có
      `worker-src` nên rơi về `script-src`, và trình duyệt bắn
      `securitypolicyviolation` KỂ CẢ khi troika đã bắt lỗi và tự hạ cấp.

      Cấm cả gói thay vì cấm hai tên: drei có 320 file và một lượt import tiện
      tay ở lượt sửa sau sẽ không ai để ý. Cần một helper của drei thì gỡ ô này
      ra và thay bằng một danh sách cho phép, có chủ ý.
    */
    for (const file of SCENE_FILES) {
      expect(source(file), `${file} import từ drei`).not.toMatch(/@react-three\/drei/);
    }
  });

  it('không dùng loader cần WebAssembly', () => {
    // CSP không có `wasm-unsafe-eval`, và nới nó là đổi hợp đồng bảo mật chứ
    // không phải sửa một lỗi dựng hình.
    for (const file of SCENE_FILES) {
      expect(source(file)).not.toMatch(/DRACOLoader|KTX2Loader|MeshoptDecoder|\.ktx2|\.drc/);
    }
  });

  it('Canvas chạy frameloop="demand"', () => {
    /*
      Điều kiện của cả cổng giảm chuyển động. Không có nó thì R3F tự chạy một
      vòng `requestAnimationFrame` riêng mà `startGatedFrameLoop` bên ngoài
      không với tới, và trang sẽ TRÔNG NHƯ đã tuân thủ trong khi canvas vẫn
      quay. Đúng lớp lỗi "xanh mà không chứng minh gì".
    */
    expect(source('loop-scene.tsx')).toMatch(/frameloop="demand"/);
  });

  it('cổng giảm chuyển động ở mức JS, không chỉ ở khối @media', () => {
    // Khối `@media (prefers-reduced-motion: reduce)` trong `globals.css` không
    // dừng nổi một vòng rAF. Hai mảnh dưới đây là hai tầng thật.
    const client = source('loop-story-client.tsx');
    expect(client).toMatch(/startGatedFrameLoop/);
    expect(client).toMatch(/snapProgress/);
  });

  it('chunk 3D nạp qua next/dynamic với ssr: false', () => {
    // Canvas không được là phần tử LCP. Và `ssr: false` chỉ gọi được TRONG một
    // component `'use client'`, nên ô này cũng khẳng định file đó có chỉ thị.
    const client = source('loop-story-client.tsx');
    expect(client).toMatch(/^'use client';/);
    expect(client).toMatch(/dynamic\(\(\) => import\('\.\/loop-scene'\)/);
    expect(client).toMatch(/ssr:\s*false/);
  });

  it('đối chứng dương: bộ quét ĐỎ được', () => {
    // Không có ô này thì một `source()` trả chuỗi rỗng (đổi tên file, sai
    // `import.meta.dirname`) sẽ làm mọi ô `not.toMatch` ở trên xanh vĩnh viễn.
    expect(() => source('khong-ton-tai.tsx')).toThrow();
    expect("import { Text } from '@react-three/drei';").toMatch(/@react-three\/drei/);
  });
});
