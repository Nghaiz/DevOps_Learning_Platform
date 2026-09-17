/**
 * Tám góc camera CỐ ĐỊNH — toán thuần, không `three` (19.D.3.2).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ KHÔNG CÓ XOAY TỰ DO, VÀ KHÔNG BAO GIỜ CÓ XOAY KHI NHÀN RỖI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `k8s-arena/scene/camera-rig.tsx:44-50` mang một lệnh cấm đã trả giá: hợp đồng
 * arena từng có `idleSpinAfterMs`, và nó bị gỡ hẳn ngày 2026-09-08 sau khi đo —
 * sau 30 giây nó vẽ liên tục ~14 fps và KHÔNG BAO GIỜ tự dừng, kể cả khi mô
 * phỏng đã tạm dừng. Cảnh này thừa hưởng nguyên lệnh cấm đó.
 *
 * Còn một lý do riêng của game CI/CD để bỏ luôn cả `OrbitControls`: ba trục ở
 * đây **mang nghĩa** (`phase-19-d-exec.md` §2.1) — X là thứ tự phụ thuộc, Z là
 * làn song song, Y là thời gian chờ (chương CI) hoặc dải môi trường (chương CD).
 * Một camera xoay tự do cho phép người chơi dừng ở đúng góc mà hai trục chồng
 * lên nhau, và khi đó đồ thị đọc ra một câu khác hẳn câu nó đang nói — một lỗi
 * đọc mà người chơi không có cách nào biết mình đang mắc. Tám góc chốt sẵn thì
 * ba trục luôn tách được.
 *
 * ## Vì sao tám, và vì sao chỉ một độ cao
 *
 * Tám phương vị cách nhau 45° là số nhỏ nhất còn cho phép nhìn đường ống từ cả
 * hai đầu VÀ nhìn dọc theo làn — bốn góc thì mất hẳn các góc chéo, nơi cả ba
 * trục cùng tách. Độ cao giữ nguyên một giá trị (góc trục lượng, `atan(1/√2)`)
 * vì nó là độ cao duy nhất mà một bước trên mỗi trục chiếu ra cùng một độ dài
 * trên màn hình — tức là độ cao duy nhất mà "đếm ô" đọc được như nhau ở cả ba
 * trục. Cho người chơi chỉnh độ cao là cho họ phá đúng tính chất đó.
 */

/** Góc trục lượng: `atan(1/√2)` ≈ 35.264°. Xem khối đầu file. */
export const CAMERA_ELEVATION = Math.atan(Math.SQRT1_2);

/**
 * **Bốn** góc cố định, không phải tám. Kế hoạch D.3.2 cho khoảng 4–8; đây là lý
 * do phải lấy mức dưới.
 *
 * ⚠ Hai bản trước đều sai, và hai ô test bắt lần lượt từng bản:
 *
 * 1. **Tám góc, gốc 45°** — bốn trong tám rơi đúng vào 90°/180°/270°/360°, tức
 *    nhìn DỌC một trục. Ở 0°/180° camera nằm trên trục Z nên mọi **làn** chồng
 *    lên nhau; ở 90°/270° nó nằm trên trục X nên mọi **tầng phụ thuộc** chồng
 *    lên nhau. Đúng thứ khối đầu file nói phải tránh.
 * 2. **Tám góc, gốc 22.5°** — hết chồng trục, nhưng mất sạch tính trục lượng:
 *    ba trục không còn chiếu ra cùng độ dài, nên "đếm ô" đọc khác nhau theo
 *    từng trục.
 *
 * Hai tính chất đó chỉ cùng đúng ở **đúng bốn hướng**: `(±1, ±1, ±1)/√3`, tức
 * phương vị 45°/135°/225°/315° với độ cao `atan(1/√2)`. Nhiều hơn bốn góc là
 * buộc phải hi sinh một trong hai. Bốn góc đủ để nhìn đồ thị từ cả bốn phía —
 * không phía nào bị khuất.
 */
export const CAMERA_ANGLE_COUNT = 4;

/** Phương vị của góc 0. Xem khối trên: bốn hướng trục lượng bắt đầu từ 45°. */
const BASE_AZIMUTH = Math.PI / 4;

const STEP = (Math.PI * 2) / CAMERA_ANGLE_COUNT;

/** Đưa một chỉ số bất kỳ (âm, vượt trần) về `0..CAMERA_ANGLE_COUNT-1`. */
export function normalizeAngleIndex(index: number): number {
  if (!Number.isFinite(index)) {
    return 0;
  }
  const whole = Math.trunc(index);
  return ((whole % CAMERA_ANGLE_COUNT) + CAMERA_ANGLE_COUNT) % CAMERA_ANGLE_COUNT;
}

/** Phương vị (radian) của một góc. */
export function angleAzimuth(index: number): number {
  return BASE_AZIMUTH + normalizeAngleIndex(index) * STEP;
}

/** Bước sang góc kế tiếp theo chiều `delta` (±1). Quấn vòng. */
export function stepAngle(index: number, delta: number): number {
  return normalizeAngleIndex(normalizeAngleIndex(index) + Math.trunc(delta));
}

/**
 * Nhãn tiếng Việt của từng góc — đi thẳng vào `aria-label` của nút xoay.
 *
 * Canvas WebGL là một ô đen với trình đọc màn hình, nên "đang nhìn từ đâu" chỉ
 * tồn tại nếu có người viết nó ra thành chữ. Tên đặt theo hướng NGƯỜI XEM ĐỨNG,
 * không theo tên trục: "đông bắc" nói được điều gì đó cho người chưa biết trục X
 * là gì, còn "phương vị 45 độ" thì không.
 */
export const CAMERA_ANGLE_LABELS: readonly string[] = [
  'Góc nhìn 1 trên 4, từ hướng đông bắc',
  'Góc nhìn 2 trên 4, từ hướng đông nam',
  'Góc nhìn 3 trên 4, từ hướng tây nam',
  'Góc nhìn 4 trên 4, từ hướng tây bắc',
];

/** Nhãn của một góc. Luôn trả một chuỗi — chỉ số nào cũng quấn về đúng khoảng. */
export function angleLabel(index: number): string {
  return CAMERA_ANGLE_LABELS[normalizeAngleIndex(index)] ?? CAMERA_ANGLE_LABELS[0] ?? '';
}
