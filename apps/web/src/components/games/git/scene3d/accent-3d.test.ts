import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENT_STYLE } from '../git-palette.ts';
import { NODE_RADIUS, X_STEP, Y_STEP, Z_STEP } from './scene3d-contract.ts';
import { GIT_SCENE_TOKENS } from './scene3d-tokens.ts';
import {
  ACCENT_3D,
  HIT_PADDING_3D,
  NODE_SOLIDS,
  SCENE_ACCENTS,
  SIGIL_CELLS,
  SOLID_OF_SHAPE,
  minNeighbourDistance,
  nodeHalfExtent,
  sigilCell,
} from './accent-3d.ts';

/**
 * Ánh xạ accent → 3D (17.K.10).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ô GÁC THẬT Ở ĐÂY LÀ "KHÔNG CHỈ KHÁC MÀU", KHÔNG PHẢI "ĐỦ SÁU DÒNG"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Một bảng đủ sáu dòng vẫn hỏng nếu hai dòng chỉ khác nhau ở token màu: ba
 * trong sáu trạng thái là đỏ/xanh-lá/xanh-dương, đúng bộ ba mà deuteranopia làm
 * nhoè vào nhau (`../git-palette.ts` § BA KÊNH). Nên ô quyết định là vòng lặp
 * mọi CẶP, và nó đòi ≥ 1 kênh ngoài màu khác nhau.
 *
 * Ngưỡng ở đây là 1, không phải 2 như bản 2D. Lý do có số: 2D còn kênh *chuyển
 * động* để đếm, còn tầng 3D thêm hai kênh mà 2D không có — **hệ số phóng** (đọc
 * được ở mọi góc nhìn) và **bloom**. Bảng hiện tại thực tế đạt ≥ 2 ở mọi cặp; ô
 * "biên hiện tại" bên dưới ghim đúng điều đó, nên một lượt sửa làm tụt xuống 1
 * vẫn ĐỎ và người sửa phải nhìn lại, chứ không trôi qua trong im lặng.
 */

const SOURCE = readFileSync(path.resolve(import.meta.dirname, 'accent-3d.ts'), 'utf8');

/** Kênh KHÔNG phải màu. Chỉ những thứ đọc được khi in đen trắng, cộng bloom. */
function nonColorChannels(accent: (typeof SCENE_ACCENTS)[number]): readonly string[] {
  const s = ACCENT_3D[accent];
  return [s.solid, String(s.scale), s.sigil, String(s.bloom)];
}

function countDiff(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

describe('T0 · file này không được biết tới three', () => {
  /*
    Không phải một ô trang trí. `scene3d-contract.ts` § "VÌ SAO FILE NÀY KHÔNG
    IMPORT three" nêu ba lý do, và lý do thứ hai — cổng `bundle:check` — đã một
    lần bị vi phạm thật ở P17 (`44f8e39`, engine rò sang 6 route qua một barrel).
    Một dòng `import ... from 'three'` lọt vào đây làm cả file này, và mọi test
    của nó, không chạy được ở env `node` nữa.
  */
  /*
    ⚠ Mẫu này bám vào CÂU LỆNH import, không bám vào chuỗi `from 'three'` ở bất
    kỳ đâu trong file — và đó là một bản sửa, không phải một lựa chọn.

    Bản đầu dùng `/from\s+['"]three/` và nó ĐỎ ngay lượt chạy đầu, khớp vào đúng
    dòng chú thích của `accent-3d.ts` giải thích rằng file đó không được import
    three. Cùng hình dạng hỏng mà `scripts/check-design-tokens.mjs` ghi ở đầu
    file: bản grep cũ của cổng màu kêu oan 5/5 lần, cả năm đều là hex nằm trong
    chú thích. Một cổng mà đầu ra toàn báo động giả thì bị tắt trong hai tuần.

    `^\s*(?:import|export)` neo vào đầu dòng nên một dòng chú thích (` * …`)
    không khớp được, còn một câu lệnh import thật thì luôn ở đầu dòng — import
    tĩnh bắt buộc nằm ở tầm module. Ba dạng đều bị bắt: `import x from 'three'`,
    `import 'three'` (chỉ lấy hiệu ứng phụ), và `import('three')` động.
  */
  const BANNED = String.raw`three|@react-three\/[a-z-]+|postprocessing`;
  const BANNED_IMPORT = new RegExp(
    String.raw`^\s*(?:import|export)\b[^\n]*?['"](?:${BANNED})['"]|import\(\s*['"](?:${BANNED})['"]`,
    'm',
  );

  it('ĐỐI CHỨNG DƯƠNG — mẫu này bắt được một vi phạm thật', () => {
    /*
      Không có ô này thì ô dưới xanh kể cả khi mẫu hỏng hoàn toàn, và "0 vi phạm"
      sẽ không phân biệt được với "không đo gì cả" (`green-that-proves-nothing.md`).
      Bốn dạng dưới là bốn cách three thật sự lọt vào một file.
    */
    for (const sample of [
      `import * as THREE from 'three';`,
      `import 'three';`,
      `import { useFrame } from "@react-three/fiber";`,
      `const m = await import('postprocessing');`,
    ]) {
      expect(BANNED_IMPORT.test(sample), sample).toBe(true);
    }
  });

  it('ĐỐI CHỨNG ÂM — nhắc tới three trong CHÚ THÍCH thì không tính là vi phạm', () => {
    expect(BANNED_IMPORT.test(` * đỏ nếu một dòng \`from 'three'\` lọt vào file này`)).toBe(false);
  });

  it('accent-3d.ts không import three / fiber / drei / postprocessing', () => {
    expect(BANNED_IMPORT.test(SOURCE), 'accent-3d.ts phải là toán thuần').toBe(false);
  });

  it('không có màu cứng — mọi màu là tên token', () => {
    for (const accent of SCENE_ACCENTS) {
      const s = ACCENT_3D[accent];
      for (const token of [s.fill, s.stroke, s.text]) {
        expect(token.startsWith('--'), `${accent}: ${token}`).toBe(true);
        expect(/#|0x|rgb|oklch/.test(token), `${accent}: ${token}`).toBe(false);
      }
    }
  });

  it('mọi token accent nằm trong GIT_SCENE_TOKENS — bộ đọc màu phải biết nó', () => {
    /*
      Chiều gác quan trọng hơn của SSOT màu (lead sở hữu `scene3d-tokens.ts`,
      `e369df7`). `useGitSceneColors()` chỉ phân giải những token có trong
      `GIT_SCENE_TOKENS`; một accent dùng token ngoài danh sách đó tra ra
      `undefined` và node ra màu xám dự phòng — **không lỗi nào được ném**.

      Đây là lý do lane B KHÔNG giữ danh sách token riêng: hai danh sách thì
      chỗ lệch không ai thấy, một danh sách cộng ô này thì chỗ lệch là một ô ĐỎ.
    */
    const known = new Set(GIT_SCENE_TOKENS);
    for (const accent of SCENE_ACCENTS) {
      const s = ACCENT_3D[accent];
      for (const token of [s.fill, s.stroke, s.text]) {
        expect(known.has(token), `${accent} dùng ${token} mà bộ đọc màu không đọc token đó`).toBe(
          true,
        );
      }
    }
  });
});

describe('17.K.10 · sáu accent, không thiếu không thừa', () => {
  it('đúng sáu, và đúng sáu tên của hợp đồng', () => {
    expect([...SCENE_ACCENTS].sort()).toEqual([
      'conflicted',
      'duplicate',
      'fresh',
      'head',
      'normal',
      'orphaned',
    ]);
  });

  it('mỗi accent có một dòng trong ACCENT_3D', () => {
    for (const accent of SCENE_ACCENTS) {
      expect(ACCENT_3D[accent], accent).toBeDefined();
      expect(ACCENT_3D[accent].scale, `${accent}.scale`).toBeGreaterThan(0);
    }
  });

  it('màu và sigil đọc XUYÊN QUA từ ACCENT_STYLE, không phải bản chép', () => {
    /*
      Ô này là thứ giữ hai renderer nói cùng một điều. Nếu ai đó gõ thẳng token
      vào `ACCENT_3D_EXTRA` cho "tiện", bảng 3D sẽ trôi khỏi bảng 2D ở lần đổi
      màu đầu tiên — và ô AC-B (so tập node/cạnh) vẫn xanh, vì nó không nhìn màu.
    */
    for (const accent of SCENE_ACCENTS) {
      const flat = ACCENT_STYLE[accent];
      const solid = ACCENT_3D[accent];
      expect(solid.fill, `${accent}.fill`).toBe(flat.fill);
      expect(solid.stroke, `${accent}.stroke`).toBe(flat.stroke);
      expect(solid.text, `${accent}.text`).toBe(flat.text);
      expect(solid.sigil, `${accent}.sigil`).toBe(flat.sigil);
      expect(solid.solid, `${accent}.solid`).toBe(SOLID_OF_SHAPE[flat.shape]);
    }
  });
});

describe('17.K.10 · ĐÚNG MỘT accent bật bloom, và đó là head', () => {
  const glowing = SCENE_ACCENTS.filter((a) => ACCENT_3D[a].bloom);

  it('chỉ một', () => {
    expect(
      glowing,
      'Bloom là kênh "bạn đang ở đây". Hai vật phát sáng thì không vật nào là mốc.',
    ).toHaveLength(1);
  });

  it('và nó là head — KHÔNG phải "running" như K.10 viết', () => {
    /*
      `running` là trạng thái của game K8s và KHÔNG tồn tại trong `SceneAccent`.
      Chủ dự án chốt ánh xạ sang `head`. Ghim ở đây để lần sau ai đọc plan §17.K.10
      rồi đi tìm `running` sẽ thấy ngay câu trả lời, thay vì thêm một accent mới.
    */
    expect(glowing[0]).toBe('head');
  });
});

describe('17.K.10 · không accent nào chỉ phân biệt bằng MÀU', () => {
  it('mọi cặp khác nhau ở ≥ 1 kênh ngoài màu', () => {
    for (let i = 0; i < SCENE_ACCENTS.length; i++) {
      for (let j = i + 1; j < SCENE_ACCENTS.length; j++) {
        const a = SCENE_ACCENTS[i];
        const b = SCENE_ACCENTS[j];
        if (a === undefined || b === undefined) continue;
        const diff = countDiff(nonColorChannels(a), nonColorChannels(b));
        expect(
          diff,
          `${a} và ${b} chỉ khác nhau ở màu — người mù màu đọc chúng thành một`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('biên hiện tại là ≥ 2, không phải ≥ 1 — tụt xuống 1 thì ô này ĐỎ trước', () => {
    /*
      Ô đồng hành của ngưỡng nới lỏng ở trên (`pinned-baseline-test-companion.md`):
      ngưỡng cứng là 1, nhưng bảng thật đang ở 2, và một lượt sửa làm tụt xuống 1
      là một sự suy giảm có chủ ý hay không thì phải có người xác nhận. ĐỎ ở đây
      nghĩa là: hoặc khôi phục kênh vừa mất, hoặc hạ con số này MỘT cách tường
      minh kèm lý do. Không sửa nó thành "giá trị vừa đo được".
    */
    let worst = Number.POSITIVE_INFINITY;
    for (let i = 0; i < SCENE_ACCENTS.length; i++) {
      for (let j = i + 1; j < SCENE_ACCENTS.length; j++) {
        const a = SCENE_ACCENTS[i];
        const b = SCENE_ACCENTS[j];
        if (a === undefined || b === undefined) continue;
        worst = Math.min(worst, countDiff(nonColorChannels(a), nonColorChannels(b)));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(2);
  });

  it('bỏ kênh bloom đi vẫn còn ít nhất một kênh tĩnh phân biệt mọi cặp', () => {
    /*
      Bloom biến mất ở tầng chất lượng thấp (không hậu kỳ) — cùng lý do
      `git-palette.ts` không cho chuyển động làm kênh duy nhất. Nên phép phân
      biệt phải sống sót khi tắt hậu kỳ.
    */
    for (let i = 0; i < SCENE_ACCENTS.length; i++) {
      for (let j = i + 1; j < SCENE_ACCENTS.length; j++) {
        const a = SCENE_ACCENTS[i];
        const b = SCENE_ACCENTS[j];
        if (a === undefined || b === undefined) continue;
        const still = countDiff(nonColorChannels(a).slice(0, 3), nonColorChannels(b).slice(0, 3));
        expect(still, `${a} vs ${b} chỉ còn bloom để phân biệt`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('17.K.4 · số LÔ là hằng số, không theo số commit', () => {
  it('NODE_SOLIDS phủ đủ mọi khối mà SOLID_OF_SHAPE sinh ra', () => {
    /*
      Ô đồng hành cho danh sách thứ tự lô: thêm một `NodeShape` thứ sáu ở
      `git-palette.ts` sẽ sinh một `NodeSolid` mà `commit-instances.tsx` không
      dựng lô nào cho nó — và hệ quả là commit đó KHÔNG ĐƯỢC VẼ, im lặng.
    */
    const produced = new Set(Object.values(SOLID_OF_SHAPE));
    for (const solid of produced) {
      expect(NODE_SOLIDS, `${solid} không có lô nào vẽ nó`).toContain(solid);
    }
  });

  it('không có lô CHẾT — mỗi lô phải có ít nhất một hình 2D trỏ vào', () => {
    const produced = new Set(Object.values(SOLID_OF_SHAPE));
    const dead = NODE_SOLIDS.filter((solid) => !produced.has(solid));
    expect(dead, 'Lô này không accent nào dùng. Một lô rỗng vẫn tốn một lệnh vẽ — XOÁ.').toEqual(
      [],
    );
  });

  it('trần lệnh vẽ của tầng thân + sigil nằm xa dưới 100', () => {
    // K.4 đặt trần < 100 lệnh vẽ/khung. Tầng này: một lô mỗi khối, cộng MỘT lô
    // sigil dùng chung atlas. Hộp bấm không tính — `visible === false`.
    const drawCalls = NODE_SOLIDS.length + 1;
    expect(drawCalls).toBeLessThan(100);
    expect(drawCalls).toBe(6);
  });
});

describe('17.K.10 · bảng sigil', () => {
  it('ô 0 rỗng — accent normal không mang ký hiệu', () => {
    expect(SIGIL_CELLS[0]).toBe('');
    expect(sigilCell('normal')).toBe(0);
  });

  it('mọi ô khác 0 là một ký tự duy nhất, không trùng nhau', () => {
    const rest = SIGIL_CELLS.slice(1);
    expect(new Set(rest).size).toBe(rest.length);
    for (const glyph of rest) expect(glyph.length).toBe(1);
  });

  it('mỗi accent trỏ vào một ô có thật', () => {
    for (const accent of SCENE_ACCENTS) {
      const cell = sigilCell(accent);
      expect(cell, accent).toBeGreaterThanOrEqual(0);
      expect(cell, accent).toBeLessThan(SIGIL_CELLS.length);
      expect(SIGIL_CELLS[cell]).toBe(ACCENT_3D[accent].sigil);
    }
  });
});

describe('17.K.4 · hộp bấm không ăn cắp cú bấm của hàng xóm', () => {
  it('hệ số nới > 1 — dưới 1 là có phần vật thấy được mà bấm không trúng', () => {
    expect(HIT_PADDING_3D).toBeGreaterThan(1);
  });

  it('hai commit TO NHẤT kề nhau vẫn còn khe giữa hai hộp bấm', () => {
    /*
      Tính lại từ hằng số của HỢP ĐỒNG, không chép số. Hạ `Z_STEP` hay `Y_STEP` ở
      `scene3d-contract.ts` mà quên hộp bấm thì ô này ĐỎ — và đó đúng là thứ cần
      biết, vì triệu chứng lúc chạy ("bấm commit này lại chọn commit bên cạnh")
      không hề chỉ về hằng số nào.
    */
    const widest = Math.max(...SCENE_ACCENTS.map((a) => nodeHalfExtent(a)));
    const occupied = 2 * widest * HIT_PADDING_3D;
    const gap = minNeighbourDistance() - occupied;
    expect(gap, `hai hộp bấm chồng nhau ${String(-gap)} đơn vị`).toBeGreaterThan(0);
  });

  it('minNeighbourDistance đúng là khoảng cách NHỎ NHẤT của ba trục', () => {
    expect(minNeighbourDistance()).toBeCloseTo(Math.min(X_STEP, Math.hypot(Z_STEP, Y_STEP)), 6);
  });

  it('nửa cạnh dùng chung NODE_RADIUS với hợp đồng', () => {
    expect(nodeHalfExtent('normal')).toBeCloseTo(NODE_RADIUS, 6);
    expect(nodeHalfExtent('head')).toBeGreaterThan(nodeHalfExtent('normal'));
    expect(nodeHalfExtent('orphaned')).toBeLessThan(nodeHalfExtent('normal'));
  });
});
