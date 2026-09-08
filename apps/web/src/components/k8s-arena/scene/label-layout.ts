/**
 * Bước GIÃN NHÃN — toán thuần, không `three`, không DOM.
 *
 * Đây là chỗ bản của k8sgames.com sai rõ nhất: họ tắt kiểm tra chiều sâu cho
 * nhãn nhưng không có bước giãn nào, nên hai pod cạnh nhau cho ra hai chuỗi đè
 * lên nhau và đọc thành một dòng vô nghĩa. Thà THIẾU một nhãn còn hơn hai nhãn
 * cùng không đọc được.
 *
 * Thuật toán: xếp theo độ ưu tiên giảm dần, mỗi nhãn thử vị trí gốc rồi các
 * nấc lệch DỌC luân phiên trên/dưới; nhãn nào không tìm được chỗ trống thì ẩn.
 * Lệch dọc chứ không lệch ngang vì nhãn rộng hơn cao nhiều lần — đẩy ngang phải
 * đi rất xa mới thoát va chạm, và lúc đó nó đã trỏ nhầm sang vật bên cạnh.
 *
 * ⚠ Hàm này chạy MỖI KHUNG HÌNH, nên nó sửa tại chỗ mảng do bên gọi cấp và
 * không cấp phát gì: mảng chỉ số dùng để sắp xếp nằm ở tầm module, và phép sắp
 * là chèn trực tiếp (n ≤ vài chục, không đáng gọi `Array.sort` để phải cấp một
 * mảng mới mỗi khung hình).
 */

export interface LabelBox {
  uid: string;
  text: string;
  /** Toạ độ tâm mong muốn, đơn vị pixel trong khung canvas. */
  x: number;
  y: number;
  /** Càng lớn càng được ưu tiên giữ chỗ. */
  priority: number;
  halfWidth: number;
  halfHeight: number;
  /** Kết quả: nhãn có được hiện hay không. */
  visible: boolean;
}

export interface LabelLayoutOptions {
  readonly maxLabels: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Bước lệch dọc mỗi lần thử, pixel. */
  readonly nudgeStep: number;
  /** Số nấc lệch tối đa trước khi bỏ cuộc và ẩn nhãn. */
  readonly maxNudges: number;
}

/** Chỉ số đã sắp theo ưu tiên. Ở tầm module để vòng lặp vẽ không cấp phát. */
const ORDER: number[] = [];
/** Hộp bao đã chốt chỗ, phẳng: [left, right, top, bottom] × n. */
const TAKEN: number[] = [];

function overlaps(left: number, right: number, top: number, bottom: number, count: number): boolean {
  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    if (
      left < (TAKEN[base + 1] ?? 0) &&
      right > (TAKEN[base] ?? 0) &&
      top < (TAKEN[base + 3] ?? 0) &&
      bottom > (TAKEN[base + 2] ?? 0)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Sắp `count` phần tử đầu của `boxes` theo ưu tiên giảm dần rồi đặt chỗ.
 *
 * Trả về số nhãn được hiện. Mọi phần tử `boxes[i]` với `i < count` đều có
 * `visible` được ghi, và `y` của nhãn được đẩy lệch có thể đã đổi.
 */
export function layoutLabels(boxes: LabelBox[], count: number, options: LabelLayoutOptions): number {
  ORDER.length = 0;
  for (let i = 0; i < count; i += 1) {
    const box = boxes[i];
    if (box === undefined) {
      continue;
    }
    box.visible = false;
    // Chèn trực tiếp theo ưu tiên giảm dần. Bằng điểm thì giữ thứ tự vào —
    // thứ tự đó là thứ tự `uid`, nên nó ổn định qua các khung hình và nhãn
    // không nhấp nháy đổi chỗ cho nhau.
    let at = ORDER.length;
    while (at > 0) {
      const other = boxes[ORDER[at - 1] ?? 0];
      if (other === undefined || other.priority >= box.priority) {
        break;
      }
      ORDER[at] = ORDER[at - 1] ?? 0;
      at -= 1;
    }
    ORDER[at] = i;
  }

  TAKEN.length = 0;
  let placed = 0;

  for (let k = 0; k < ORDER.length && placed < options.maxLabels; k += 1) {
    const box = boxes[ORDER[k] ?? 0];
    if (box === undefined) {
      continue;
    }

    for (let step = 0; step <= options.maxNudges; step += 1) {
      // 0, -1, +1, -2, +2 … : ưu tiên đẩy LÊN vì nhãn vốn đặt trên đầu vật, và
      // đẩy lên tiếp thì nó vẫn nằm về phía "của mình".
      const dir = step === 0 ? 0 : step % 2 === 1 ? -Math.ceil(step / 2) : Math.ceil(step / 2);
      const y = box.y + dir * options.nudgeStep;
      const left = box.x - box.halfWidth;
      const right = box.x + box.halfWidth;
      const top = y - box.halfHeight;
      const bottom = y + box.halfHeight;

      if (left < 0 || right > options.viewWidth || top < 0 || bottom > options.viewHeight) {
        continue;
      }
      if (overlaps(left, right, top, bottom, placed)) {
        continue;
      }

      box.y = y;
      box.visible = true;
      const base = placed * 4;
      TAKEN[base] = left;
      TAKEN[base + 1] = right;
      TAKEN[base + 2] = top;
      TAKEN[base + 3] = bottom;
      placed += 1;
      break;
    }
  }

  return placed;
}

/** Điểm neo nhãn của một bệ node, trong toạ độ world. */
export interface NodeAnchor {
  readonly x: number;
  readonly z: number;
}

/**
 * Góc XA CAMERA của một bệ node — chỗ duy nhất nhãn node không đè lên thứ gì.
 *
 * Ba lần đo trên `/games/k8s` ngày 2026-09-08, ba kết quả:
 *  - mép trước (`+z` cố định): mép trước là mép GẦN camera, mà camera nhìn chếch
 *    từ trên xuống nên nó chiếu ra thành cạnh DƯỚI bệ — nhãn nằm bên dưới cái
 *    nó gọi tên.
 *  - mép xa, canh giữa: lên đúng phía trên bệ, nhưng rơi thẳng vào cột màn hình
 *    của pod đứng giữa, nên tên node xếp chồng ngay trên tên pod và đọc ra như
 *    hai cái tên của CÙNG một vật.
 *  - góc xa (bản này): lệch cả ra sau lẫn sang bên nên nó thoát khỏi mọi thứ
 *    đứng trên mặt bệ mà vẫn kề bệ.
 *
 * Cả hai hướng đều suy từ vị trí camera nên chúng đúng ở mọi góc xoay; một hằng
 * số `-z` cũng đúng, cho tới lúc người dùng xoay camera 180°.
 */
export function nodeLabelAnchor(
  nodeX: number,
  cameraX: number,
  cameraZ: number,
  back: number,
  side: number,
): NodeAnchor {
  const dx = cameraX - nodeX;
  const away = Math.hypot(dx, cameraZ) || 1;
  const towardX = dx / away;
  const towardZ = cameraZ / away;
  // `(-towardZ, towardX)` là vector vuông góc của hướng-về-camera trong mặt phẳng XZ.
  return {
    x: nodeX - towardX * back - towardZ * side,
    z: -towardZ * back + towardX * side,
  };
}
