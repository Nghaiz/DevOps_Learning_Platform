/**
 * Phép THUẦN của tầng nhãn 3D (K.6) và bảng kênh của ô file (K.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG `three`, KHÔNG DOM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cùng ba lý do mà `scene3d-contract.ts` đã ghi, cộng một lý do riêng: phép
 * XẾP ƯU TIÊN là chỗ duy nhất của tầng nhãn có thể sai mà **không ai nhìn thấy**.
 * Một nhãn đặt lệch 3px thì mắt bắt được ngay; một nhãn `main` bị 20 nhãn oid
 * đẩy ra khỏi trần thì màn hình vẫn đầy chữ và trông hoàn toàn bình thường —
 * chỉ có thứ quan trọng nhất là biến mất. Loại lỗi đó phải bắt bằng test, và
 * test chỉ chạy được ở env `node` nếu file này sạch `three` lẫn DOM.
 *
 * ⚠ **Bảng `PLATE_STATUS` nằm ở đây là CÓ Ý, dù tên file nói về nhãn.** Lane này
 * sở hữu đúng bốn file, và ba file còn lại đều `import 'three'`. Đặt bảng kênh
 * của ô file vào một trong ba file đó là tự tay biến bất biến "≥2 kênh ngoài
 * màu" thành một lời khai trong chú thích: không test nào chạm tới được nó mà
 * không kéo WebGL vào env `node`. Một cái tên file hơi rộng rẻ hơn một bất biến
 * không có cổng gác.
 */

import type { ColorToken } from '../git-palette.ts';
import type { SceneFileCell, SceneFileStatus, SceneRefKind } from '../../shared/scene-props.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. TRẦN SỐ NHÃN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Số nhãn tối đa hiện cùng lúc. **40**, không phải 64 như arena.
 *
 * Trần này KHÔNG phải để tiết kiệm — nó là giới hạn ĐỌC ĐƯỢC, và hai cảnh có
 * hai giới hạn khác nhau vì hình học của chúng khác nhau:
 *
 *  - Arena rải ~200 pod trên một mặt SÀN rộng, camera nhìn chếch xuống. Nhãn
 *    trải ra hai chiều nên 64 nhãn vẫn còn chỗ trống giữa chúng.
 *  - DAG git nằm trong một DẢI NGANG mỏng (Y chỉ mang độ lệch nhánh, tối đa vài
 *    bậc — xem `scene3d-contract.ts` §BA TRỤC). Cùng một số nhãn ở đây phải
 *    chen trong một phần nhỏ của màn hình, nên ngưỡng bão hoà đến sớm hơn nhiều.
 *
 * Đếm thật của một màn học: ~25 commit + ≤8 ref + ~6 làn × ~4 lần lặp + 3 tên
 * mặt phẳng + ~12 cột file ≈ 72 ứng viên. Trần 40 nghĩa là khoảng một nửa bị
 * cắt — và đó chính là lý do thứ tự ưu tiên dưới đây phải đúng, chứ không phải
 * lý do để nâng trần. Nâng lên 64 không làm hiện thêm thông tin: bước giãn
 * (`label-layout.ts` của arena) hết chỗ trống và bắt đầu ẩn hàng loạt, nên phần
 * "thêm" chỉ là nhãn chồng nhãn.
 */
export const MAX_LABELS_3D = 40;

/**
 * Trần số ỨNG VIÊN, gấp đôi trần hiện.
 *
 * Gấp đôi vì bước giãn cần dư chỗ để chọn: một ứng viên không đặt được sẽ nhường
 * chỗ cho ứng viên sau. Không gấp nhiều hơn vì phép sắp xếp chạy mỗi khung hình.
 * 80 phủ được con số ~72 ở trên; phần vượt là việc của `labelPass()`.
 */
export const MAX_LABEL_CANDIDATES = MAX_LABELS_3D * 2;

/** Nửa chiều cao hộp bao nhãn, pixel. Khớp `text-[10px]` + padding dọc. */
export const LABEL_HALF_HEIGHT = 9;
/** Bề rộng ước lượng mỗi ký tự ở `text-[10px]` font mono, pixel. */
export const LABEL_CHAR_WIDTH = 5.4;
/** Bước lệch dọc mỗi lần thử khi hai nhãn đè nhau, pixel. */
export const LABEL_NUDGE_STEP = 15;
/** Số nấc lệch tối đa trước khi bỏ cuộc và ẩn nhãn. */
export const LABEL_MAX_NUDGES = 8;

/** Số ký tự tối đa của một nhãn thường (oid, tên nhánh, tên mặt phẳng). */
export const MAX_LABEL_CHARS = 22;
/** Số ký tự tối đa của một nhãn ĐƯỜNG DẪN. Rộng hơn vì phần đuôi mới mang nghĩa. */
export const MAX_PATH_CHARS = 26;

// ═══════════════════════════════════════════════════════════════════════════
// 2. THANG ƯU TIÊN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thang ưu tiên nhãn. Càng lớn càng được giữ chỗ trước.
 *
 * ⚠ **Thứ tự ở đây LỆCH khỏi arena một cách có chủ ý, và lệch ở đúng một chỗ:
 * nhãn ref đứng TRÊN nhãn của node đang chọn.** Ở arena, "đang chọn" là đỉnh
 * thang. Ở đây không, vì hai thứ đó có số kênh khác nhau:
 *
 *  - Node đang chọn / đang rê **đã có kênh thứ hai**: chính cái mesh sáng lên.
 *    Mất nhãn của nó thì người chơi vẫn biết mình đang chọn cái nào.
 *  - Một ref thì **chỉ có nhãn**. `main`, `HEAD`, `v1.0` không phải trang trí —
 *    chúng LÀ cơ chế mà cả game dạy ("nhánh là một con trỏ"). Một cảnh git
 *    không hiện chữ `main` là một cảnh không dạy được gì, dù người chơi đang
 *    chọn commit nào.
 *
 * Khoảng cách giữa các bậc để rộng (20–60) để còn chèn được bậc mới về sau mà
 * không phải đánh số lại cả thang.
 */
export const LABEL_PRIORITY = {
  /** Tên ba mặt phẳng HEAD/Index/Worktree. Mất nó thì cả K.3 mất nghĩa. */
  plateZone: 1000,
  /** Badge `HEAD` — nói người chơi đang ĐỨNG ở đâu, câu hỏi số một của mọi bài. */
  refHead: 960,
  /** Badge của nhánh đang đứng (`isCurrent`). */
  refCurrent: 940,
  /** Badge ref còn lại: nhánh khác, remote, tag. */
  refOther: 920,
  /** Oid của một commit CÓ ref trỏ tới — vẫn đáng giữ, nhưng dưới chính badge đó. */
  commitRefAnchor: 880,
  commitSelected: 820,
  commitHovered: 780,
  /** Commit mang accent `head`. Dưới badge `HEAD` vì badge nói cùng một điều, rõ hơn. */
  commitHead: 740,
  /** Nhãn nhánh ở ĐẦU làn. */
  lanePrimary: 680,
  /** Commit merge — chỗ hai nhánh gặp nhau, thông tin chính của mọi bài merge. */
  commitMerge: 620,
  /** Tên cột file, một lần cho cả ba mặt phẳng. */
  plateColumn: 560,
  /** Ký tự trạng thái trên một ô file — kênh thứ ba của `PLATE_STATUS`. */
  plateCell: 540,
  commitPlain: 480,
  /** Nhãn nhánh LẶP dọc theo làn. Trợ giúp định hướng, không mang thông tin mới. */
  laneRepeat: 420,
} as const;

export type LabelPriority = (typeof LABEL_PRIORITY)[keyof typeof LABEL_PRIORITY];

/** Sự thật về một commit, đủ để xếp ưu tiên. Không kèm toạ độ — đó là việc của tầng vẽ. */
export interface CommitLabelFacts {
  /** Có ít nhất một ref trỏ tới commit này (`refsAt()` trả về mảng không rỗng). */
  readonly hasRef: boolean;
  readonly selected: boolean;
  readonly hovered: boolean;
  /** Accent `head` — HEAD đang ở đúng commit này. */
  readonly isHead: boolean;
  /** Từ hai cha trở lên. */
  readonly isMerge: boolean;
}

/**
 * Ưu tiên cho nhãn oid của một commit.
 *
 * Kiểm theo đúng thứ tự đã khai ở `LABEL_PRIORITY`; điều kiện đầu tiên đúng là
 * điều kiện thắng. `hasRef` đứng trước `selected` — xem lý do ở khối trên.
 */
export function commitLabelPriority(facts: CommitLabelFacts): number {
  if (facts.hasRef) return LABEL_PRIORITY.commitRefAnchor;
  if (facts.selected) return LABEL_PRIORITY.commitSelected;
  if (facts.hovered) return LABEL_PRIORITY.commitHovered;
  if (facts.isHead) return LABEL_PRIORITY.commitHead;
  if (facts.isMerge) return LABEL_PRIORITY.commitMerge;
  return LABEL_PRIORITY.commitPlain;
}

/** Ưu tiên cho một badge ref. `head` > nhánh đang đứng > phần còn lại. */
export function refLabelPriority(kind: SceneRefKind, isCurrent: boolean): number {
  if (kind === 'head') return LABEL_PRIORITY.refHead;
  if (isCurrent) return LABEL_PRIORITY.refCurrent;
  return LABEL_PRIORITY.refOther;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DUYỆT NHIỀU LƯỢT
// ═══════════════════════════════════════════════════════════════════════════

export const LABEL_PASS_COUNT = 3;

/**
 * Lượt duyệt mà một ưu tiên thuộc về. 0 = quan trọng nhất.
 *
 * ⚠ **Nhiều lượt KHÔNG phải để sắp xếp** — `layoutLabels()` đã sắp theo ưu tiên
 * giảm dần rồi. Nhiều lượt là để bảo vệ **BỘ ĐỆM ỨNG VIÊN**: mảng ứng viên bị
 * chặn ở `MAX_LABEL_CANDIDATES`, nên nếu vòng đẩy đi tuần tự qua 25 commit
 * thường trước khi tới 3 tên mặt phẳng, bộ đệm đầy và ba cái tên đó **không bao
 * giờ vào được mảng để mà sắp**. Sắp xếp một tập đã mất phần tử quan trọng thì
 * xếp kiểu gì cũng sai.
 *
 * Đây là lỗi rất khó thấy vì nó chỉ xuất hiện trên màn ĐÔNG — đúng những màn
 * người chơi cần nhãn nhất, và không phải màn ai mở ra để chụp ảnh kiểm tra.
 */
export function labelPass(priority: number): number {
  if (priority >= LABEL_PRIORITY.commitHead) return 0;
  if (priority >= LABEL_PRIORITY.plateCell) return 1;
  return 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CẮT CHUỖI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cắt ĐUÔI, thêm dấu lược. Dùng cho oid, tên nhánh, tên mặt phẳng — thứ mà
 * phần ĐẦU mang nghĩa.
 */
export function shortenLabel(text: string, max: number = MAX_LABEL_CHARS): string {
  if (max < 1) throw new RangeError(`shortenLabel: max phải >= 1, nhận ${String(max)}`);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Cắt ĐẦU đường dẫn, giữ phần đuôi.
 *
 * Cắt đuôi như `shortenLabel` là sai với đường dẫn, và sai theo kiểu tệ nhất —
 * vẫn ra một chuỗi trông hợp lý: `src/components/games/gi…` giữ đúng phần mà
 * MỌI file trong màn đều giống nhau và vứt đúng phần phân biệt chúng. Ba ô file
 * khác nhau sẽ mang ba nhãn giống hệt nhau, và ô AC "nhìn thấy file rơi từ
 * Worktree xuống Index" trở thành không kiểm được bằng mắt.
 *
 * Giữ nguyên tên file cuối cùng kể cả khi riêng nó đã vượt trần: một tên file
 * bị cắt vẫn đọc ra được, còn một đường dẫn không có tên file thì không.
 */
export function shortenPath(path: string, max: number = MAX_PATH_CHARS): string {
  if (max < 1) throw new RangeError(`shortenPath: max phải >= 1, nhận ${String(max)}`);
  if (path.length <= max) return path;
  const slash = path.lastIndexOf('/');
  const tail = slash === -1 ? path : path.slice(slash + 1);
  if (tail.length + 1 >= max) return `…${tail.slice(Math.max(0, tail.length - (max - 1)))}`;
  return `…/${tail}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LẶP NHÃN LÀN
// ═══════════════════════════════════════════════════════════════════════════

/** Lặp nhãn làn sau mỗi bao nhiêu cột. Cùng con số với renderer 2D. */
export const LANE_LABEL_EVERY = 3;

/**
 * Các mốc `depth` đặt nhãn của một làn. Phần tử ĐẦU là nhãn chính, phần còn lại
 * là các lần lặp.
 *
 * Yêu cầu tường minh của K.6 là nhãn nhánh **lặp lại dọc theo làn**, không chỉ
 * hiện một lần ở đầu. Lý do nằm ở `laneLabels()` (`shared/scene-props.ts`):
 * nghịch lý đo được của VR-Git là một nhãn duy nhất ở đầu làn RỐI HƠN nhiều
 * nhãn lặp, vì nó bắt người đọc nhớ "làn thứ ba là nhánh nào" suốt chiều ngang
 * màn hình — mà ở 3D chiều ngang đó còn có thể xoay đi.
 */
export function laneLabelDepths(
  minDepth: number,
  maxDepth: number,
  every: number = LANE_LABEL_EVERY,
): readonly number[] {
  if (every < 1) throw new RangeError(`laneLabelDepths: every phải >= 1, nhận ${String(every)}`);
  if (maxDepth < minDepth) return [];
  const out: number[] = [];
  for (let d = minDepth; d <= maxDepth; d += every) out.push(d);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. KÊNH CỦA Ô FILE (K.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hình khối của một ô file. Kênh HÌNH HỌC — sáu giá trị, sáu khối khác nhau
 * thấy được cả khi in đen trắng lẫn khi người xem không phân biệt được màu.
 */
export type PlateShape =
  /** Tấm mỏng phẳng, không gờ. */
  | 'flat'
  /** Dày hơn, có gờ nổi viền quanh mép trên. */
  | 'ridged'
  /** Khối CAO hẳn lên khỏi mặt phẳng. */
  | 'risen'
  /** CHÌM xuống dưới mặt phẳng — hướng xuống đã mang nghĩa "mất" (hợp đồng §Y). */
  | 'sunken'
  /** Chỉ khung viền, ruột rỗng — "chưa được git biết tới". */
  | 'hollow'
  /** Hai nửa TÁCH RỜI theo một khe ở giữa — hai phiên bản không hoà được. */
  | 'split';

export interface PlateStyle {
  /** Nền ô. */
  readonly fill: ColorToken;
  /** Chữ trên nền đó. Cặp `fill`/`text` đã được đo ở `git-palette.ts`. */
  readonly text: ColorToken;
  readonly shape: PlateShape;
  /** Một ký tự. Kênh thứ ba, và là kênh sống sót qua `prefers-reduced-motion`. */
  readonly sigil: string;
  /** Chiều dày ô, bội số của chiều dày cơ sở. */
  readonly height: number;
  /** Lệch Y so với mặt phẳng, bội số chiều dày cơ sở. Âm = chìm xuống. */
  readonly lift: number;
  /** Đọc ra cho trình đọc màn hình. Tiếng Việt, một cụm danh từ. */
  readonly label: string;
}

/**
 * Sáu trạng thái file, mỗi trạng thái **≥2 kênh ngoài màu** (`shape` + `sigil`).
 *
 * Cùng kỷ luật với `ACCENT_STYLE` ở `git-palette.ts`, và với cùng lý do: ba
 * trong sáu trạng thái ở đây là đỏ / xanh lá / xanh dương — đúng bộ ba mà
 * deuteranopia và protanopia làm nhoè vào nhau.
 *
 * **Cặp màu không được chọn tự do.** Mọi cặp `fill`/`text` dưới đây đã có mặt
 * trong `ACCENT_STYLE` hoặc `REF_STYLE`, tức đã nằm trong bảng đo tương phản
 * hai theme ở đầu `git-palette.ts`. `label-priority.test.ts` gác đúng điều đó —
 * nên "các cặp này đạt AA" là hệ quả của một cổng đang chạy, không phải một câu
 * viết trong chú thích.
 *
 * ⚠ Ba sigil TRÙNG với `ACCENT_STYLE` (`+`, `?`, `!`) và đó là CÓ Ý: chúng mang
 * cùng một nghĩa ở cả hai mặt (`+` mới, `?` git chưa biết tới, `!` xung đột).
 * Đổi chúng cho "khỏi trùng" sẽ bắt người học nhớ hai bảng ký hiệu cho một khái
 * niệm — đắt hơn nhiều so với cái lợi của việc trùng.
 *
 * `satisfies Record<SceneFileStatus, PlateStyle>` là cổng lúc BIÊN DỊCH: hợp
 * đồng thêm một `FileStatus` mà bảng này chưa có ⇒ đỏ ở typecheck, thay vì một
 * ô file màu xám không ai giải thích được.
 */
export const PLATE_STATUS = {
  unchanged: {
    fill: '--card',
    text: '--card-foreground',
    shape: 'flat',
    sigil: '·',
    height: 1,
    lift: 0,
    label: 'không đổi',
  },
  modified: {
    fill: '--status-progress',
    text: '--status-progress-foreground',
    shape: 'ridged',
    sigil: '~',
    height: 1.6,
    lift: 0.3,
    label: 'đã sửa',
  },
  added: {
    fill: '--success',
    text: '--success-foreground',
    shape: 'risen',
    sigil: '+',
    height: 2.4,
    lift: 0.7,
    label: 'mới thêm',
  },
  deleted: {
    fill: '--muted',
    text: '--muted-foreground',
    shape: 'sunken',
    sigil: '-',
    height: 0.8,
    lift: -0.9,
    label: 'đã xoá',
  },
  untracked: {
    fill: '--warning',
    text: '--warning-foreground',
    shape: 'hollow',
    sigil: '?',
    height: 1.2,
    lift: 0.1,
    label: 'git chưa theo dõi',
  },
  conflicted: {
    fill: '--destructive',
    text: '--destructive-foreground',
    shape: 'split',
    sigil: '!',
    height: 2,
    lift: 0.5,
    label: 'đang xung đột',
  },
} as const satisfies Record<SceneFileStatus, PlateStyle>;

/** Câu tiếng Việt mô tả trạng thái một ô file, dùng trong `aria-label`. */
export function plateStatusLabel(status: SceneFileStatus): string {
  return PLATE_STATUS[status].label;
}

/**
 * Chiều dày CƠ SỞ của một ô file, đơn vị cảnh. `height`/`lift` là bội số của nó.
 *
 * Nhỏ hơn nhiều so với `PLATE_CELL_STEP` (1.6): ô file là một tấm, không phải
 * một khối lập phương. Ô cao nhất (`added`, height 2.4) dày 0.53 — vẫn mỏng hơn
 * khoảng cách giữa hai mặt phẳng (2.5), nên không mặt phẳng nào đâm vào mặt kia.
 */
export const PLATE_CELL_BASE = 0.22;

/** Bề rộng ô file, tính theo bội số của `PLATE_CELL_STEP`. Chừa khe giữa hai cột. */
export const PLATE_CELL_FOOTPRINT = 0.62;

/**
 * Tâm Y của một ô file trên mặt phẳng ở `planeY`.
 *
 * ⚠ **Hàm này phải là nguồn DUY NHẤT**, và đó là lý do nó nằm ở một file thuần
 * thay vì trong component dựng mesh. Hai bên cần nó: bên vẽ khối, và bên đặt
 * nhãn ký tự trạng thái lên trên khối đó. Một bản sao lệch nửa bước làm ký tự
 * `+` trôi vào trong lòng ô `added` (ô cao nhất) và biến mất — tức kênh thứ ba
 * mất đúng ở trạng thái cần nó nhất, mà không ai thấy gì sai.
 */
export function plateCellCenterY(planeY: number, status: SceneFileStatus): number {
  const style = PLATE_STATUS[status];
  return planeY + (style.lift + style.height / 2) * PLATE_CELL_BASE;
}

/** Đỉnh Y của một ô file — chỗ neo nhãn ký tự trạng thái. */
export function plateCellTopY(planeY: number, status: SceneFileStatus): number {
  const style = PLATE_STATUS[status];
  return planeY + (style.lift + style.height) * PLATE_CELL_BASE;
}

/**
 * Tên ba mặt phẳng, hiện ra màn hình.
 *
 * `HEAD` giữ nguyên tiếng Anh — nó là một định danh của git, không phải một từ
 * cần dịch; phần chú giải mới là tiếng Việt. Cùng luật với `Index` / `Worktree`.
 */
export const PLATE_ZONE_LABEL = {
  worktree: 'Worktree · đang sửa',
  index: 'Index · đã stage',
  head: 'HEAD · đã cam kết',
} as const satisfies Record<SceneFileCell['zone'], string>;
