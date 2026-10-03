import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { STATION_COUNT } from '../journey-timeline';

/**
 * Hình học của thế giới 3D: tuyến đỏ (trục chính), sáu ga bên phải tuyến, sáu tuyến màu tách ra
 * từ bó tuyến để đổ về ga của mình, giá máy sandbox ở cuối tuyến, vòng ∞ ở rất xa.
 *
 * Mọi hàm nhận `out` để tái dùng vector: camera gọi chúng mỗi khung, và cấp phát Vector3 mới ở
 * 60 khung/giây là rác cho GC dọn đúng lúc người dùng đang cuộn.
 */

const UP = new Vector3(0, 1, 0);

export const TRUNK = new CatmullRomCurve3(
  [
    new Vector3(0, 0, 18),
    new Vector3(0, 0, -10),
    new Vector3(-7, 1.2, -44),
    new Vector3(5, 0, -78),
    new Vector3(-4, -0.8, -112),
    new Vector3(7, 0.8, -146),
    new Vector3(0, 0, -180),
    new Vector3(-6, 0.4, -214),
    new Vector3(0, 0, -246),
  ],
  false,
  'centripetal',
);

/** Tham số dọc tuyến đỏ (0..1) của sáu ga, theo thứ tự `STATION_IDS`. */
export const STATION_U: readonly number[] = [0.14, 0.27, 0.4, 0.53, 0.66, 0.79];
/** Ga đặt lệch sang phải tuyến ngần này đơn vị. */
export const STATION_SIDE = 7.5;
export const RACK_U = 0.93;
export const INFINITY_CENTER = new Vector3(0, 70, -340);

export interface Frame {
  readonly point: Vector3;
  readonly tangent: Vector3;
  readonly right: Vector3;
}

export const makeFrame = (): Frame => ({ point: new Vector3(), tangent: new Vector3(), right: new Vector3() });

/*
  Bảng tra dọc tuyến đỏ, dựng một lần khi module nạp. `Curve.getTangentAt` của three cấp phát hai
  Vector3 mỗi lần gọi, và camera gọi `frameAt` vài lần mỗi khung: tra bảng rồi nội suy tuyến tính
  thì không cấp phát gì (sai số dưới 1 phần nghìn đơn vị với 4096 mẫu trên ~280 đơn vị tuyến).
*/
const LUT_SIZE = 4096;
const LUT_POINTS: readonly Vector3[] = Array.from({ length: LUT_SIZE + 1 }, (_, i) => TRUNK.getPointAt(i / LUT_SIZE));
const LUT_TANGENTS: readonly Vector3[] = Array.from({ length: LUT_SIZE + 1 }, (_, i) => TRUNK.getTangentAt(i / LUT_SIZE));

export function frameAt(u: number, out: Frame = makeFrame()): Frame {
  const x = MathUtils.clamp(u, 0, 1) * LUT_SIZE;
  const i = Math.min(LUT_SIZE - 1, Math.floor(x));
  const f = x - i;
  const p0 = LUT_POINTS[i];
  const p1 = LUT_POINTS[i + 1];
  const t0 = LUT_TANGENTS[i];
  const t1 = LUT_TANGENTS[i + 1];
  if (p0 === undefined || p1 === undefined || t0 === undefined || t1 === undefined) {
    throw new RangeError(`frameAt: LUT index ${i} out of range`);
  }
  out.point.lerpVectors(p0, p1, f);
  out.tangent.lerpVectors(t0, t1, f).normalize();
  out.right.crossVectors(out.tangent, UP).normalize();
  return out;
}

const scratch = makeFrame();

export function stationCenter(index: number, out = new Vector3()): Vector3 {
  const frame = frameAt(STATION_U[index] ?? 0, scratch);
  return out.copy(frame.point).addScaledVector(frame.right, STATION_SIDE);
}

/** Góc quay quanh trục y để ga nhìn ngược về phía camera đang tới, hơi nghiêng vào tuyến. */
export function stationYaw(index: number): number {
  const frame = frameAt(STATION_U[index] ?? 0, scratch);
  const facing = frame.tangent.clone().negate().addScaledVector(frame.right, -0.55).normalize();
  return Math.atan2(facing.x, facing.z);
}

export function rackCenter(out = new Vector3()): Vector3 {
  const frame = frameAt(RACK_U, scratch);
  return out.copy(frame.point).addScaledVector(frame.right, 4.5);
}

/** Độ lệch ngang của tuyến màu thứ `index` so với tuyến đỏ khi còn chạy chung bó. */
export const lineOffset = (index: number): number => 1.35 + index * 0.62;

/**
 * Tuyến màu của ga `index`: chạy song song tuyến đỏ từ đầu tuyến, tới gần ga thì tách ra và cong
 * về đúng mép sân ga. Càng về sau bó tuyến càng mỏng, vì mỗi ga đã lấy đi tuyến của nó.
 */
export function stationLine(index: number): CatmullRomCurve3 {
  const end = STATION_U[index] ?? 0;
  const offset = lineOffset(index);
  const points: Vector3[] = [];
  const frame = makeFrame();
  for (let u = 0; u < end - 0.05; u += 0.012) {
    frameAt(u, frame);
    points.push(frame.point.clone().addScaledVector(frame.right, offset).addScaledVector(UP, 0.02 * index));
  }
  frameAt(end - 0.022, frame);
  points.push(frame.point.clone().addScaledVector(frame.right, offset + 1.8));
  const center = stationCenter(index);
  frameAt(end, frame);
  points.push(center.clone().addScaledVector(frame.right, -3.1).addScaledVector(UP, 0.1));
  return new CatmullRomCurve3(points, false, 'centripetal');
}

export interface Pose {
  readonly position: Vector3;
  readonly target: Vector3;
}

export const makePose = (): Pose => ({ position: new Vector3(), target: new Vector3() });

export function heroPose(out: Pose): Pose {
  out.position.set(-15, 6.2, 12);
  out.target.set(-5.5, 2.6, -58);
  return out;
}

/** Tham số tuyến nơi camera đứng khi dừng ở ga `index` (-1 là đầu tuyến). */
const cameraU = (index: number): number => (index < 0 ? 0.012 : (STATION_U[index] ?? 0) - 0.046);

function stopPose(index: number, out: Pose): Pose {
  const frame = frameAt(cameraU(index), scratch);
  out.position.copy(frame.point).addScaledVector(UP, index < 0 ? 3.4 : 2.9).addScaledVector(frame.right, -2.3);
  if (index < 0) {
    frameAt(0.07, scratch);
    out.target.copy(scratch.point).addScaledVector(UP, 0.6).addScaledVector(scratch.right, 2);
  } else {
    stationCenter(index, out.target).addScaledVector(UP, 1.6);
    frameAt((STATION_U[index] ?? 0) + 0.01, scratch);
    out.target.lerp(scratch.point, 0.32);
  }
  return out;
}

/** Tham số tuyến đỏ của camera ở vị trí đường ray `track`; đoàn tàu chạy ngay phía trước nó. */
export function trackU(track: number): number {
  const clamped = MathUtils.clamp(track, -1, STATION_COUNT - 1);
  const from = Math.floor(clamped);
  const to = Math.min(STATION_COUNT - 1, from + 1);
  return MathUtils.lerp(cameraU(from), cameraU(to), clamped - from);
}

const poseA = makePose();
const poseB = makePose();

/**
 * Camera theo vị trí đường ray `track` (-1..5, lấy từ `trackAt`). Giữa hai ga, vị trí đi theo
 * đúng đường cong của tuyến (nội suy tham số u) chứ không cắt thẳng qua khúc quanh.
 */
export function trackPose(track: number, out: Pose): Pose {
  const clamped = MathUtils.clamp(track, -1, STATION_COUNT - 1);
  const from = Math.floor(clamped);
  const to = Math.min(STATION_COUNT - 1, from + 1);
  const f = clamped - from;
  stopPose(from, poseA);
  stopPose(to, poseB);
  const frame = frameAt(trackU(clamped), scratch);
  const lift = MathUtils.lerp(from < 0 ? 3.4 : 2.9, 2.9, f) + Math.sin(f * Math.PI) * 1.4;
  out.position.copy(frame.point).addScaledVector(UP, lift).addScaledVector(frame.right, -2.3);
  out.target.copy(poseA.target).lerp(poseB.target, MathUtils.smoothstep(f, 0, 1));
  return out;
}

/** Quỹ đạo quanh giá máy sandbox theo tiến độ terminal: camera lượn từ trái sang phải giá. */
const rackScratch = new Vector3();
const backScratch = new Vector3();

export function rackPose(progress: number, out: Pose): Pose {
  const center = rackCenter(rackScratch);
  const frame = frameAt(RACK_U, scratch);
  const back = backScratch.copy(frame.tangent).negate();
  const angle = MathUtils.lerp(-0.5, 0.3, progress);
  out.position
    .copy(center)
    .addScaledVector(back, Math.cos(angle) * 17)
    .addScaledVector(frame.right, Math.sin(angle) * 17)
    .addScaledVector(UP, 2.4 + progress * 0.8);
  /* Nhìn lệch sang trái giá máy: giá nằm nửa phải màn hình, sau khung terminal, chỉ chóp pod
     sáng ló lên trên khung. Chữ ở cột trái không còn đè lên khối 3D. */
  out.target.copy(center).addScaledVector(UP, 1.6).addScaledVector(frame.right, -4);
  return out;
}

export function infinityPose(progress: number, out: Pose): Pose {
  out.position.set(Math.sin(progress * 0.8 - 0.4) * 5, 2 - progress * 3, 30 - progress * 6).add(INFINITY_CENTER);
  out.target.copy(INFINITY_CENTER);
  return out;
}
