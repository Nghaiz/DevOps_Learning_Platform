import { describe, expect, it } from 'vitest';
import {
  ANGLE_COUNT,
  CAMERA_NEAR,
  DEFAULT_ANGLE_INDEX,
  FRAME_FILL,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  ZOOM_STEP,
  boundsCenter,
  boundsCorners,
  cameraBasis,
  cameraFar,
  cameraPosition,
  clampZoomScale,
  cycleIndex,
  cycleRefKey,
  dampFactor,
  frameDistance,
  frameZoom,
  nextAngle,
  normalizeAngleIndex,
  prevAngle,
  projectToScreen,
  refTargetPosition,
  refTargets,
  screenExtent,
  stepZoomScale,
  type Scene3DBounds,
} from './camera-angles.ts';
import type { Placed3D, Scene3DPlacement, Vec3 } from './scene3d-contract.ts';
import type { SceneRefBadge, SceneView } from '../../shared/scene-props.ts';

/**
 * Toán camera của tầng 3D game Git (K.1 + K.9).
 *
 * Ô có sức nặng nhất ở đây là **khung-toàn-bộ chứa trọn hộp bao**, và nó được
 * khẳng định HAI CHIỀU: không đỉnh nào tràn ra ngoài khung (cảnh không bị cắt),
 * VÀ chiều ràng buộc lấp đúng `FRAME_FILL` phần khung (cảnh không co lại thành
 * một chấm giữa màn hình trống). Một chiều thôi là nửa cổng: `zoom = 0.001`
 * thoả mãn "không tràn" ở mọi cảnh, mọi góc, mãi mãi.
 *
 * Chạy ở env `node` — không một dòng `three`, không DOM. Đó là cả lý do phép
 * toán này không nằm trong `ortho-camera-rig.tsx`.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Tiện ích vec-tơ, chỉ dùng trong test
// ═══════════════════════════════════════════════════════════════════════════

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

function distance(a: Vec3, b: Vec3): number {
  return length([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
}

const ALL_ANGLES = Array.from({ length: ANGLE_COUNT }, (_unused, index) => index);

function makeBounds(min: Vec3, max: Vec3): Scene3DBounds {
  return { min, max };
}

/** Hộp bao thật của một level nhiều nhánh, hai kho: rộng theo X, dày theo Z. */
const WIDE_BOUNDS = makeBounds([-0.62, -0.62, -0.62], [26.02, 2.37, 20.62]);
/** Một commit duy nhất — hộp bao gần suy biến. */
const TINY_BOUNDS = makeBounds([-0.62, -0.62, -0.62], [0.62, 0.62, 0.62]);
/** Cảnh rỗng: `place3d` trả về hộp bao suy biến hẳn về gốc toạ độ. */
const EMPTY_BOUNDS = makeBounds([0, 0, 0], [0, 0, 0]);

const VIEWPORTS = [
  { width: 1440, height: 820 },
  { width: 640, height: 900 },
  { width: 380, height: 300 },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// Chỉ số góc
// ═══════════════════════════════════════════════════════════════════════════

describe('chỉ số góc quay vòng', () => {
  it('quay vòng đúng ở CẢ HAI biên', () => {
    expect(nextAngle(ANGLE_COUNT - 1)).toBe(0);
    expect(prevAngle(0)).toBe(ANGLE_COUNT - 1);
  });

  it('đi một vòng đủ ANGLE_COUNT bước rồi về chỗ cũ, theo cả hai chiều', () => {
    let forward = DEFAULT_ANGLE_INDEX;
    let backward = DEFAULT_ANGLE_INDEX;
    const visited = new Set<number>();
    for (let step = 0; step < ANGLE_COUNT; step += 1) {
      visited.add(forward);
      forward = nextAngle(forward);
      backward = prevAngle(backward);
    }
    expect(forward).toBe(DEFAULT_ANGLE_INDEX);
    expect(backward).toBe(DEFAULT_ANGLE_INDEX);
    // Không góc nào bị bỏ qua và không góc nào tới hai lần trong một vòng.
    expect(visited.size).toBe(ANGLE_COUNT);
  });

  it('chuẩn hoá số âm, số vượt ngưỡng, và số không hữu hạn', () => {
    // `-1 % 8` của JS là `-1`, không phải `7` — đây là chỗ hàm này tồn tại để chữa.
    expect(normalizeAngleIndex(-1)).toBe(ANGLE_COUNT - 1);
    expect(normalizeAngleIndex(-ANGLE_COUNT)).toBe(0);
    expect(normalizeAngleIndex(ANGLE_COUNT)).toBe(0);
    expect(normalizeAngleIndex(ANGLE_COUNT * 3 + 2)).toBe(2);
    expect(normalizeAngleIndex(Number.NaN)).toBe(DEFAULT_ANGLE_INDEX);
    expect(normalizeAngleIndex(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ANGLE_INDEX);
  });

  it('cycleIndex trên danh sách rỗng trả 0 thay vì NaN', () => {
    expect(cycleIndex(0, 0, 1)).toBe(0);
    expect(cycleIndex(5, 0, -1)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Hệ trục
// ═══════════════════════════════════════════════════════════════════════════

describe('hệ trục camera', () => {
  it('ba vec-tơ đơn vị và trực giao từng đôi, ở mọi góc', () => {
    for (const index of ALL_ANGLES) {
      const { direction, right, up } = cameraBasis(index);
      expect(length(direction)).toBeCloseTo(1, 12);
      expect(length(right)).toBeCloseTo(1, 12);
      expect(length(up)).toBeCloseTo(1, 12);
      expect(dot(direction, right)).toBeCloseTo(0, 12);
      expect(dot(direction, up)).toBeCloseTo(0, 12);
      expect(dot(right, up)).toBeCloseTo(0, 12);
    }
  });

  it('camera luôn ở TRÊN điểm ngắm và không bao giờ lộn ngược', () => {
    for (const index of ALL_ANGLES) {
      const { direction, up, right } = cameraBasis(index);
      // Nhìn từ trên xuống: hướng ra camera có thành phần Y dương.
      expect(direction[1]).toBeGreaterThan(0);
      // Trục dọc màn hình cùng chiều trục đứng thế giới — cảnh không bị lật.
      expect(up[1]).toBeGreaterThan(0);
      // Trục ngang màn hình nằm ngang: không có thành phần đứng nào.
      expect(right[1]).toBe(0);
    }
  });

  it('tám góc là tám hướng PHÂN BIỆT', () => {
    const seen = ALL_ANGLES.map((index) =>
      cameraBasis(index)
        .direction.map((n) => n.toFixed(9))
        .join(','),
    );
    expect(new Set(seen).size).toBe(ANGLE_COUNT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Khung-toàn-bộ — ô nghiệm thu chính
// ═══════════════════════════════════════════════════════════════════════════

describe('khung-toàn-bộ', () => {
  it('chứa TRỌN hộp bao ở mọi góc và mọi khổ khung vẽ', () => {
    for (const bounds of [WIDE_BOUNDS, TINY_BOUNDS]) {
      const center = boundsCenter(bounds);
      for (const index of ALL_ANGLES) {
        for (const viewport of VIEWPORTS) {
          const zoom = frameZoom(bounds, index, viewport);
          for (const corner of boundsCorners(bounds)) {
            const [u, v] = projectToScreen(corner, center, index);
            expect(Math.abs(u) * zoom).toBeLessThanOrEqual(viewport.width / 2 + 1e-9);
            expect(Math.abs(v) * zoom).toBeLessThanOrEqual(viewport.height / 2 + 1e-9);
          }
        }
      }
    }
  });

  it('lấp ĐÚNG FRAME_FILL phần khung theo chiều ràng buộc — không co lại thành chấm', () => {
    const bounds = WIDE_BOUNDS;
    const center = boundsCenter(bounds);
    for (const index of ALL_ANGLES) {
      for (const viewport of VIEWPORTS) {
        const zoom = frameZoom(bounds, index, viewport);
        let ratio = 0;
        for (const corner of boundsCorners(bounds)) {
          const [u, v] = projectToScreen(corner, center, index);
          ratio = Math.max(
            ratio,
            (Math.abs(u) * zoom) / (viewport.width / 2),
            (Math.abs(v) * zoom) / (viewport.height / 2),
          );
        }
        expect(ratio).toBeCloseTo(FRAME_FILL, 10);
      }
    }
  });

  it('hộp bao suy biến vẫn cho zoom hữu hạn và dương', () => {
    for (const index of ALL_ANGLES) {
      const zoom = frameZoom(EMPTY_BOUNDS, index, VIEWPORTS[0]);
      expect(Number.isFinite(zoom)).toBe(true);
      expect(zoom).toBeGreaterThan(0);
    }
  });

  it('khung vẽ rỗng (0×0 lúc mới mount) không sinh zoom vô cực hay âm', () => {
    const zoom = frameZoom(WIDE_BOUNDS, DEFAULT_ANGLE_INDEX, { width: 0, height: 0 });
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(0);
  });

  it('hình chiếu của hộp bao đối xứng qua tâm — nửa kích thước là số đo thật', () => {
    const center = boundsCenter(WIDE_BOUNDS);
    for (const index of ALL_ANGLES) {
      const { halfWidth, halfHeight } = screenExtent(WIDE_BOUNDS, index);
      let maxU = 0;
      let maxV = 0;
      for (const corner of boundsCorners(WIDE_BOUNDS)) {
        const [u, v] = projectToScreen(corner, center, index);
        maxU = Math.max(maxU, Math.abs(u));
        maxV = Math.max(maxV, Math.abs(v));
      }
      expect(halfWidth).toBeCloseTo(maxU, 10);
      expect(halfHeight).toBeCloseTo(maxV, 10);
    }
  });

  it('TẤT ĐỊNH: cùng đầu vào cho cùng từng chữ số', () => {
    const first = ALL_ANGLES.map((index) => frameZoom(WIDE_BOUNDS, index, VIEWPORTS[0]));
    const second = ALL_ANGLES.map((index) => frameZoom(WIDE_BOUNDS, index, VIEWPORTS[0]));
    expect(second).toEqual(first);
    expect(cameraBasis(3)).toEqual(cameraBasis(3));
    expect(cameraPosition(3, [1, 2, 3], 10)).toEqual(cameraPosition(3, [1, 2, 3], 10));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Đặt camera
// ═══════════════════════════════════════════════════════════════════════════

describe('vị trí camera', () => {
  it('cách điểm ngắm đúng khoảng cách yêu cầu, ở mọi góc', () => {
    const target: Vec3 = [4, 1, -2];
    for (const index of ALL_ANGLES) {
      expect(distance(cameraPosition(index, target, 17), target)).toBeCloseTo(17, 10);
    }
  });

  it('MỌI đỉnh của cảnh nằm giữa near và far, ở mọi góc', () => {
    /*
     * Đây là câu hỏi thật mà `frameDistance`/`cameraFar` trả lời — và là câu
     * hỏi duy nhất chúng trả lời, vì phép chiếu song song không đổi độ lớn theo
     * khoảng cách. Một đỉnh rơi ra ngoài `near` bị cắt phẳng, và vết cắt đó
     * trông y hệt một lỗi dựng hình.
     */
    for (const bounds of [WIDE_BOUNDS, TINY_BOUNDS, EMPTY_BOUNDS]) {
      const dist = frameDistance(bounds);
      const far = cameraFar(bounds);
      const center = boundsCenter(bounds);
      for (const index of ALL_ANGLES) {
        const { direction } = cameraBasis(index);
        const eye = cameraPosition(index, center, dist);
        for (const corner of boundsCorners(bounds)) {
          // Chiều sâu theo trục nhìn: `direction` hướng từ điểm ngắm ra camera.
          const depth = dot(
            [eye[0] - corner[0], eye[1] - corner[1], eye[2] - corner[2]],
            direction,
          );
          expect(depth).toBeGreaterThan(CAMERA_NEAR);
          expect(depth).toBeLessThan(far);
        }
      }
    }
  });

  it('cảnh rỗng vẫn cho khoảng cách khác 0 — camera không nằm chồng lên điểm ngắm', () => {
    expect(frameDistance(EMPTY_BOUNDS)).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phóng
// ═══════════════════════════════════════════════════════════════════════════

describe('phóng của người chơi', () => {
  it('kẹp trong khoảng, kể cả khi bấm mãi một chiều', () => {
    let scale = 1;
    for (let step = 0; step < 40; step += 1) scale = stepZoomScale(scale, 1);
    expect(scale).toBe(MAX_ZOOM_SCALE);
    for (let step = 0; step < 80; step += 1) scale = stepZoomScale(scale, -1);
    expect(scale).toBe(MIN_ZOOM_SCALE);
  });

  it('một bước lên rồi một bước xuống về đúng chỗ cũ trong vùng không kẹp', () => {
    expect(stepZoomScale(stepZoomScale(1, 1), -1)).toBeCloseTo(1, 12);
    expect(stepZoomScale(1, 1)).toBeCloseTo(ZOOM_STEP, 12);
  });

  it('giá trị không hữu hạn về 1 thay vì lan sang ma trận chiếu', () => {
    expect(clampZoomScale(Number.NaN)).toBe(1);
    expect(clampZoomScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Giảm chấn
// ═══════════════════════════════════════════════════════════════════════════

describe('giảm chấn', () => {
  it('ĐỘC LẬP NHỊP KHUNG: hai nửa bước đi tới đúng chỗ của một bước đủ', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const half = dampFactor(dt / 2);
      const full = dampFactor(dt);
      // Phần đường CÒN LẠI nhân với nhau qua hai lần áp dụng.
      expect((1 - half) * (1 - half)).toBeCloseTo(1 - full, 12);
    }
  });

  it('luôn nằm trong (0, 1] và tăng theo dt', () => {
    let previous = 0;
    for (const dt of [1e-6, 1 / 144, 1 / 60, 1, 10]) {
      const factor = dampFactor(dt);
      expect(factor).toBeGreaterThan(previous);
      expect(factor).toBeLessThanOrEqual(1);
      previous = factor;
    }
  });

  it('ở nhịp khung hình THẬT thì không bao giờ bão hoà thành nhảy cóc', () => {
    /*
     * `dampFactor(10)` làm tròn đúng bằng 1 trong số thực 64-bit, và đó không
     * phải lỗi — 10 giây một khung thì nhảy thẳng tới nơi là câu trả lời đúng.
     * Điều phải giữ là: ở dải nhịp khung hình mà người thật gặp, chuyển động
     * vẫn là chuyển động chứ không phải một cú nhảy.
     */
    for (const dt of [1 / 144, 1 / 60, 1 / 30]) {
      expect(dampFactor(dt)).toBeLessThan(1);
    }
  });

  it('dt không hợp lệ đứng yên chứ không nhảy cóc', () => {
    expect(dampFactor(0)).toBe(0);
    expect(dampFactor(-1)).toBe(0);
    expect(dampFactor(Number.NaN)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// K.9 — teleport tới ref
// ═══════════════════════════════════════════════════════════════════════════

function placedNode(id: string, position: Vec3): Placed3D {
  return {
    id,
    oid: id.slice(id.indexOf(':') + 1),
    repo: id.startsWith('origin:') ? 'origin' : 'local',
    accent: 'normal',
    shortOid: id.slice(id.indexOf(':') + 1),
    message: 'commit',
    position,
    deviation: 0,
    depth: 0,
    lane: 0,
  };
}

function placement(nodes: readonly Placed3D[]): Scene3DPlacement {
  return {
    nodes,
    edges: [],
    plates: [],
    localLaneCount: 1,
    bounds: WIDE_BOUNDS,
    depthDisagreement: 0,
  };
}

function badge(
  over: Partial<SceneRefBadge> & Pick<SceneRefBadge, 'shortName' | 'oid'>,
): SceneRefBadge {
  return {
    name: `refs/heads/${over.shortName}`,
    kind: 'branch',
    repo: 'local',
    isCurrent: false,
    ...over,
  };
}

function viewWith(refs: readonly SceneRefBadge[]): SceneView {
  return {
    nodes: [],
    edges: [],
    refs,
    files: [],
    detached: false,
    hasOrigin: true,
    logicalTime: 0,
  };
}

describe('điểm đến teleport', () => {
  const nodes = placement([
    placedNode('local:aaa', [0, 0, 0]),
    placedNode('local:bbb', [2.4, 0.55, 2]),
    placedNode('origin:aaa', [0, 0, 14]),
  ]);

  it('loại ref không trỏ tới commit nào có chỗ đứng', () => {
    const targets = refTargets(
      viewWith([
        badge({ shortName: 'main', oid: 'aaa' }),
        badge({ shortName: 'ghost', oid: 'zzz' }),
      ]),
      nodes,
    );
    expect(targets.map((t) => t.name)).toEqual(['main']);
  });

  it('nhánh HEAD đang đứng xếp TRƯỚC — phím 1 luôn là chỗ đang làm việc', () => {
    const targets = refTargets(
      viewWith([
        badge({ shortName: 'aaa-sorts-first', oid: 'aaa' }),
        badge({ shortName: 'zzz-is-current', oid: 'bbb', isCurrent: true }),
      ]),
      nodes,
    );
    expect(targets[0]?.name).toBe('zzz-is-current');
  });

  it('phân biệt hai kho có cùng tên ref, và khử trùng theo kho+loại+tên', () => {
    const targets = refTargets(
      viewWith([
        badge({ shortName: 'main', oid: 'aaa' }),
        badge({ shortName: 'main', oid: 'aaa', repo: 'origin', kind: 'remote' }),
        badge({ shortName: 'main', oid: 'aaa' }),
      ]),
      nodes,
    );
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.repo)).toEqual(['local', 'origin']);
    expect(targets.find((t) => t.repo === 'origin')?.position).toEqual([0, 0, 14]);
  });

  it('TẤT ĐỊNH kể cả khi ref vào theo thứ tự khác', () => {
    const a = badge({ shortName: 'feature', oid: 'bbb' });
    const b = badge({ shortName: 'main', oid: 'aaa', isCurrent: true });
    expect(refTargets(viewWith([a, b]), nodes)).toEqual(refTargets(viewWith([b, a]), nodes));
  });

  it('quay vòng danh sách ref ở cả hai biên', () => {
    const targets = refTargets(
      viewWith([badge({ shortName: 'a', oid: 'aaa' }), badge({ shortName: 'b', oid: 'bbb' })]),
      nodes,
    );
    const first = targets[0]?.key ?? null;
    const last = targets[targets.length - 1]?.key ?? null;
    expect(cycleRefKey(targets, last, 1)).toBe(first);
    expect(cycleRefKey(targets, first, -1)).toBe(last);
  });

  it('ref vừa bị xoá thì về đầu danh sách, không đứng im', () => {
    const targets = refTargets(viewWith([badge({ shortName: 'a', oid: 'aaa' })]), nodes);
    expect(cycleRefKey(targets, 'local:branch:da-bi-xoa', 1)).toBe(targets[0]?.key);
    expect(refTargetPosition(targets, 'local:branch:da-bi-xoa')).toBeNull();
  });

  it('không còn ref nào thì teleport trả null — bên gọi rơi về khung-toàn-bộ', () => {
    expect(cycleRefKey([], null, 1)).toBeNull();
    expect(refTargetPosition([], null)).toBeNull();
  });
});
