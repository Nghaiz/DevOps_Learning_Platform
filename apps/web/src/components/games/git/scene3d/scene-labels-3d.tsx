'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

import { layoutLabels, type LabelBox } from '../../../k8s-arena/scene/label-layout.ts';
import { REF_STYLE, accentLabel, cssVar } from '../git-palette.ts';
import {
  laneLabels,
  sceneNodeId,
  type SceneLayout,
  type SceneNodeId,
  type SceneRefKind,
  type SceneRepo,
} from '../../shared/scene-props.ts';
import { nodeHalfExtent } from './accent-3d.ts';
import { refTargets } from './camera-angles.ts';
import {
  LABEL_CHAR_WIDTH,
  LABEL_HALF_HEIGHT,
  LABEL_MAX_NUDGES,
  LABEL_NUDGE_STEP,
  LABEL_PASS_COUNT,
  LABEL_PRIORITY,
  MAX_LABELS_3D,
  MAX_LABEL_CANDIDATES,
  PLATE_STATUS,
  PLATE_ZONE_LABEL,
  commitLabelPriority,
  labelPass,
  laneLabelDepths,
  plateCellTopY,
  refLabelPriority,
  shortenLabel,
  shortenPath,
  type CommitLabelFacts,
} from './label-priority.ts';
import {
  PLATE_CELL_STEP,
  PLATE_Y,
  PLATE_Z,
  X_STEP,
  deviationY,
  laneZ,
  type Scene3DLayerProps,
} from './scene3d-contract.ts';

/**
 * Nhãn của cảnh 3D game Git (K.6) — pool `<span>` DOM chiếu tay.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ LỆCH KHỎI PLAN §K.6 — CÓ CHỦ DỰ ÁN CHỐT, KHÔNG PHẢI TỰ Ý
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Plan viết "dùng `drei <Html>` cho node hover/select + `troika-three-text` cho
 * nhãn tĩnh". Bản này KHÔNG làm vậy. Ba lý do, cả ba đều là ràng buộc cứng của
 * chính repo này chứ không phải sở thích:
 *
 *  1. **`<Html occlude="blending">` bị ẩn khi có postprocessing** — chính plan
 *     cảnh báo điều đó, và cảnh này CÓ bloom. Một nhãn biến mất vì một pass hậu
 *     kỳ là lỗi không lộ ra ở bản dựng dev không bật bloom.
 *  2. **`troika-three-text` chưa có trong repo**, và cổng CI `bundle:check`
 *     đang gác kích thước bundle. Thêm một phụ thuộc dựng atlas chữ để vẽ vài
 *     chục nhãn là cái giá sai.
 *  3. **Chữ DOM sắc nét ở mọi mức phóng và TRÌNH ĐỌC MÀN HÌNH ĐỌC ĐƯỢC.** Đây
 *     là điều kiện của ô nghiệm thu AC-6. Chữ dựng trong texture thì không.
 *
 * Khuôn lấy từ `k8s-arena/scene/scene-labels.tsx`, đã chạy thật trên
 * `/games/k8s`. Bước GIÃN NHÃN thì **import lại** `label-layout.ts` của arena
 * chứ không chép: nó là hàm thuần, hoàn toàn generic, và hai bản sao của một
 * thuật toán xếp chỗ sẽ lệch nhau ở đúng ca hiếm mà không ai thử.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÒNG LẶP VẼ KHÔNG ĐỌC BỐ CỤC VÀ KHÔNG CẤP PHÁT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi khung hình chỉ GHI `style.transform`; kích thước khung lấy từ
 * `useThree(size)` chứ không từ `getBoundingClientRect()`. Đọc bố cục trong
 * `useFrame` ép trình duyệt reflow đồng bộ giữa hai lần vẽ WebGL — nó không
 * làm sai gì cả, nó chỉ làm tụt khung hình ở đúng lúc người chơi đang xoay
 * camera, và triệu chứng đó đọc ra như "máy yếu".
 */

/** Loại nhãn. Quyết định cả ưu tiên lẫn cách tô. */
type Label3DKind =
  | 'plate-zone'
  | 'ref'
  | 'commit'
  | 'lane'
  | 'lane-repeat'
  | 'plate-column'
  | 'plate-cell';

/**
 * Hộp nhãn, mở rộng từ hộp của arena thêm loại để tô đúng kiểu.
 *
 * `refKind` được CHÉP vào hộp thay vì tra ngược về `sources` lúc tô: tra ngược
 * là một lượt quét tuyến tính cho mỗi badge, tức tới 40 lượt quét mỗi khung
 * hình chỉ để lấy một trường đã biết ở lúc đẩy ứng viên.
 */
interface Label3DBox extends LabelBox {
  kind: Label3DKind;
  refKind: SceneRefKind | null;
  /** Câu đọc ra, khi chữ hiện lên màn hình tự nó không đủ nghĩa. */
  aria: string | null;
}

/**
 * Một nhãn ứng viên ở toạ độ THẾ GIỚI, dựng một lần mỗi khi cấu trúc cảnh đổi.
 *
 * Tách khỏi vòng lặp vẽ vì phần đắt (gom ref, dò làn, cắt chuỗi) không phụ
 * thuộc camera — chỉ phép chiếu mới phụ thuộc.
 */
interface LabelSource {
  readonly uid: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: Label3DKind;
  /** Ưu tiên TĨNH. `null` với commit — ưu tiên của nó đổi theo chọn/rê. */
  readonly priority: number | null;
  /** Chỉ commit mới có: id để so với `selectedId`/`hoveredId`. */
  readonly nodeId: SceneNodeId | null;
  /** Chỉ commit mới có: phần sự thật KHÔNG đổi theo tương tác. */
  readonly facts: Omit<CommitLabelFacts, 'selected' | 'hovered'> | null;
  /** Chỉ ref mới có: để tra `REF_STYLE`. */
  readonly refKind: SceneRefKind | null;
  /**
   * Câu đọc ra cho trình đọc màn hình, khi chữ hiện lên tự nó không đủ nghĩa.
   *
   * Cần thật, không phải làm cho đủ: ký tự trạng thái của một ô file là MỘT
   * ký tự (`~`, `+`, `?`). Đọc to "ngã" thì người dùng không biết gì hơn — phải
   * là "README.md, Index, đã sửa". Đây chính là thứ mà chữ dựng trong texture
   * (`troika`) không làm được, và là một trong ba lý do chọn `<span>` DOM.
   */
  readonly aria: string | null;
}

/** Khoảng hở giữa đỉnh một commit và nhãn oid của nó, đơn vị cảnh. */
const LABEL_GAP = 0.45;
/** Bậc chồng giữa các badge ref trên cùng một commit. */
const REF_STACK_STEP = 0.55;
/** Nhãn làn nằm DƯỚI làn — phía trên đã là chỗ của nhãn commit. */
const LANE_LABEL_DROP = 1.1;
/** Nhãn tên mặt phẳng lùi về phía trước cột đầu tiên bao nhiêu. */
const PLATE_ZONE_LEAD = PLATE_CELL_STEP * 1.4;
/** Hàng nhãn tên cột file, đặt CAO HƠN mặt phẳng trên cùng. */
const PLATE_COLUMN_HEADROOM = 1.6;
/** Khoảng hở giữa đỉnh một ô file và chip ký tự trạng thái của nó. */
const PLATE_CELL_SIGIL_GAP = 0.3;

const TMP_PROJECT = new THREE.Vector3();
/** Ứng viên, cấp phát một lần và dùng lại — vòng lặp vẽ không tạo object mới. */
const BOXES: Label3DBox[] = [];

function box(index: number): Label3DBox {
  let existing = BOXES[index];
  if (existing === undefined) {
    existing = {
      uid: '',
      text: '',
      x: 0,
      y: 0,
      priority: 0,
      halfWidth: 0,
      halfHeight: 0,
      visible: false,
      kind: 'commit',
      refKind: null,
      aria: null,
    };
    BOXES[index] = existing;
  }
  return existing;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tô nhãn theo loại
// ═══════════════════════════════════════════════════════════════════════════

const BASE_CLASS =
  'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-sm px-1 py-px ' +
  'font-mono text-[10px] leading-4';

/**
 * Lớp Tailwind theo loại nhãn. **Chỉ class ngữ nghĩa** — không một thang màu
 * Tailwind nào, vì cổng `check-design-tokens` quét cả `apps/web/src/**`.
 *
 * `ring-border` ở đây là đường phân cách trang trí, KHÔNG phải đồ hoạ mang
 * nghĩa: thứ làm nhãn đọc được là cặp `bg-background` / `text-foreground`
 * (10.81 nhánh sáng, 18.15 nhánh tối — bảng đo ở đầu `git-palette.ts`). Phân
 * biệt đó quan trọng, vì cùng bảng đo đó LOẠI `--border` khỏi mọi vai trò mang
 * nghĩa ở tỉ lệ 1.30.
 */
const KIND_CLASS: Readonly<Record<Label3DKind, string>> = {
  'plate-zone': `${BASE_CLASS} bg-background/85 text-foreground font-semibold ring-1 ring-border`,
  ref: `${BASE_CLASS} font-semibold`,
  commit: `${BASE_CLASS} bg-background/80 text-foreground ring-1 ring-border`,
  lane: `${BASE_CLASS} bg-background/70 text-muted-foreground`,
  'lane-repeat': `${BASE_CLASS} bg-background/70 text-muted-foreground`,
  'plate-column': `${BASE_CLASS} bg-background/70 text-muted-foreground`,
  /*
   * Chip ký tự trạng thái tô màu TRUNG TÍNH, không tô màu của trạng thái. Màu
   * đã là kênh của chính khối ô bên dưới; tô lại ở đây chỉ nhân đôi một kênh đã
   * có và bỏ lỡ lý do con chip này tồn tại — nó là kênh cho người KHÔNG đọc
   * được màu đó.
   */
  'plate-cell': `${BASE_CLASS} bg-background/85 text-foreground font-semibold ring-1 ring-border`,
};

/**
 * Kênh HÌNH HỌC của badge ref, dựng bằng CSS.
 *
 * `REF_STYLE` khai bốn `BadgeShape`, và chúng phải thấy được ở đây y như ở
 * renderer 2D — nếu không, cùng một `v1.0` sẽ là hình khía ở bản 2D và hình chữ
 * nhật ở bản 3D, và người chơi phải học hai bảng ký hiệu cho một khái niệm.
 *
 * ⚠ `outline` chứ không phải `border` với `dashed`: `border` làm hộp to thêm
 * 2px, mà bề rộng hộp đã được ƯỚC LƯỢNG từ số ký tự để bước giãn dùng. Lệch
 * giữa bề rộng ước lượng và bề rộng thật làm nhãn đè nhau đúng ở ca chật chội.
 */
function applyRefShape(span: HTMLSpanElement, kind: SceneRefKind): void {
  const style = REF_STYLE[kind];
  span.style.backgroundColor = cssVar(style.fill);
  span.style.color = cssVar(style.text);
  span.style.outline = style.shape === 'dashed' ? `1px dashed ${cssVar(style.text)}` : '';
  span.style.outlineOffset = style.shape === 'dashed' ? '-2px' : '';
  span.style.clipPath =
    style.shape === 'notched' ? 'polygon(5px 0, 100% 0, 100% 100%, 5px 100%, 0 50%)' : '';
  span.style.paddingLeft = style.shape === 'notched' ? '7px' : '';
  // `double` = một vòng ngoài đồng tâm, cách ra bằng một vòng màu nền. Dùng
  // `box-shadow` chứ không thêm phần tử: vòng ngoài không được chiếm chỗ bố cục.
  span.style.boxShadow =
    style.shape === 'double'
      ? `0 0 0 1px ${cssVar('--background')}, 0 0 0 3px ${cssVar(style.fill)}`
      : '';
}

function clearRefShape(span: HTMLSpanElement): void {
  span.style.backgroundColor = '';
  span.style.color = '';
  span.style.outline = '';
  span.style.outlineOffset = '';
  span.style.clipPath = '';
  span.style.paddingLeft = '';
  span.style.boxShadow = '';
}

// ═══════════════════════════════════════════════════════════════════════════
// Dựng ứng viên
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `SceneLayout` giả lập, dựng TỪ `placement` để gọi lại `laneLabels()`.
 *
 * ⚠ **Đây là chỗ hợp đồng thiếu, không phải một mẹo.** `Scene3DLayerProps` chỉ
 * mang `placement` / `view` / `interaction` — không mang `layouts`. Nhưng
 * `laneLabels()` (SSOT của bảng làn→tên, dùng chung với renderer 2D) nhận một
 * `SceneLayout`. Hai đường đi:
 *
 *  - tự suy lại bảng làn→tên ở đây. Phép hoà ("tên nhỏ nhất theo
 *    `localeCompare` thắng") sẽ tồn tại ở HAI chỗ, và lệch nhau ngay lần đầu
 *    một làn có hai nhánh cùng đi qua — đúng thứ docblock của `laneLabels()`
 *    cảnh báo.
 *  - dựng lại hình dạng `SceneLayout` từ dữ liệu đã có rồi gọi CHÍNH hàm đó.
 *
 * Chọn đường hai. `laneLabels()` chỉ đọc `.nodes`, nên `edges: []` là một
 * trường bắt buộc theo kiểu mà hàm không đọc — đã báo lead để hợp đồng mang
 * thêm bảng làn→tên hoặc mang `layouts`.
 *
 * `id` phải là oid THÔ (`laneHints` khoá theo oid), còn `Placed3D.id` là
 * `repo:oid` và `Placed3D` KHÔNG mang `oid`. Nên bảng tra dựng từ `view.nodes`
 * qua `sceneNodeId()` thay vì cắt chuỗi — cắt chuỗi ở đây sẽ im lặng đúng cho
 * tới ngày định dạng id đổi.
 */
function layoutAdapter(
  placement: Scene3DLayerProps['placement'],
  repo: SceneRepo,
  oidOf: ReadonlyMap<SceneNodeId, string>,
): SceneLayout {
  const nodes: SceneLayout['nodes'] = placement.nodes
    .filter((n) => n.repo === repo)
    .map((n) => ({ id: oidOf.get(n.id) ?? n.id, depth: n.depth, lane: n.lane }));
  let laneCount = 0;
  let depthCount = 0;
  for (const n of nodes) {
    if (n.lane + 1 > laneCount) laneCount = n.lane + 1;
    if (n.depth + 1 > depthCount) depthCount = n.depth + 1;
  }
  return { nodes, edges: [], laneCount, depthCount };
}

function buildSources(
  placement: Scene3DLayerProps['placement'],
  view: Scene3DLayerProps['view'],
): readonly LabelSource[] {
  const out: LabelSource[] = [];

  // ── Ba tên mặt phẳng ────────────────────────────────────────────────────
  // Đặt ở mép TRƯỚC hàng ô file, cùng Y với chính mặt phẳng đó, nên nhãn và
  // tầng nó gọi tên cùng lên xuống khi camera xoay.
  let firstColumnX = 0;
  const columnX = new Map<string, number>();
  for (const plate of placement.plates) {
    const [x] = plate.position;
    if (!columnX.has(plate.path)) columnX.set(plate.path, x);
    if (x < firstColumnX) firstColumnX = x;
  }

  for (const zone of ['worktree', 'index', 'head'] as const) {
    out.push({
      uid: `zone:${zone}`,
      text: shortenLabel(PLATE_ZONE_LABEL[zone]),
      x: firstColumnX - PLATE_ZONE_LEAD,
      y: PLATE_Y[zone],
      z: PLATE_Z,
      kind: 'plate-zone',
      priority: LABEL_PRIORITY.plateZone,
      nodeId: null,
      facts: null,
      refKind: null,
      aria: null,
    });
  }

  // ── Tên cột file: MỘT nhãn cho cả ba mặt phẳng ──────────────────────────
  // Cột đã khoá theo đường dẫn (hợp đồng §place3d), nên một cái tên đặt trên
  // đầu cột gọi đúng ô file ở CẢ BA tầng. Lặp tên ba lần ở ba dải Y chỉ thêm
  // chữ mà không thêm thông tin, và lấy mất chỗ của nhãn khác.
  for (const [path, x] of columnX) {
    out.push({
      uid: `col:${path}`,
      text: shortenPath(path),
      x,
      y: PLATE_Y.worktree + PLATE_COLUMN_HEADROOM,
      z: PLATE_Z,
      kind: 'plate-column',
      priority: LABEL_PRIORITY.plateColumn,
      nodeId: null,
      facts: null,
      refKind: null,
      // Đường dẫn bị cắt đầu để vừa màn hình; trình đọc nhận bản ĐẦY ĐỦ.
      aria: path,
    });
  }

  // ── Ký tự trạng thái trên từng ô file ───────────────────────────────────
  // Kênh thứ ba của `PLATE_STATUS`, và là kênh duy nhất sống sót khi người xem
  // không phân biệt được màu VÀ đang nhìn cảnh từ một góc làm phẳng hình khối.
  // Neo ở ĐỈNH ô — `plateCellTopY()` là nguồn chung với `file-plates.tsx`, nên
  // ký tự không bao giờ chui vào trong lòng một ô cao.
  for (const plate of placement.plates) {
    const style = PLATE_STATUS[plate.status];
    out.push({
      uid: `cell:${plate.key}`,
      text: style.sigil,
      x: plate.position[0],
      y: plateCellTopY(plate.position[1], plate.status) + PLATE_CELL_SIGIL_GAP,
      z: plate.position[2],
      kind: 'plate-cell',
      priority: LABEL_PRIORITY.plateCell,
      nodeId: null,
      facts: null,
      refKind: null,
      aria: `${plate.path}, ${PLATE_ZONE_LABEL[plate.zone]}, ${style.label}`,
    });
  }

  // ── Badge ref ───────────────────────────────────────────────────────────
  // `refTargets()` là SSOT của "ref nào có chỗ đứng" (lane K.9 sở hữu). Gọi lại
  // nó thay vì tự lọc `view.refs`: ref trỏ tới một commit không có chỗ đứng mà
  // vẫn được gắn nhãn thì nhãn đó bay lơ lửng ở gốc toạ độ.
  const targets = refTargets(view, placement);
  const refsOnNode = new Map<SceneNodeId, number>();
  const nodeAccent = new Map(placement.nodes.map((n) => [n.id, n.accent] as const));

  for (const target of targets) {
    const index = refsOnNode.get(target.id) ?? 0;
    refsOnNode.set(target.id, index + 1);
    const accent = nodeAccent.get(target.id);
    const lift = accent === undefined ? 0 : nodeHalfExtent(accent);
    const [x, y, z] = target.position;
    out.push({
      uid: `ref:${target.key}`,
      text: shortenLabel(target.isCurrent ? `* ${target.name}` : target.name),
      x,
      y: y + lift + LABEL_GAP + REF_STACK_STEP * (index + 1),
      z,
      kind: 'ref',
      priority: refLabelPriority(target.kind, target.isCurrent),
      nodeId: null,
      facts: null,
      refKind: target.kind,
      // Dấu `*` của nhánh đang đứng là quy ước của `git branch`; nó không đọc
      // ra thành lời, nên câu đọc phải nói thẳng.
      aria: `${REF_STYLE[target.kind].label} ${target.name}${target.isCurrent ? ', đang đứng ở đây' : ''}`,
    });
  }

  // ── Nhãn oid của commit ─────────────────────────────────────────────────
  const mergeIds = new Set<SceneNodeId>();
  const oidOf = new Map<SceneNodeId, string>();
  for (const node of view.nodes) {
    const id = sceneNodeId(node.repo, node.oid);
    oidOf.set(id, node.oid);
    if (node.parents.length >= 2) mergeIds.add(id);
  }

  for (const node of placement.nodes) {
    const [x, y, z] = node.position;
    out.push({
      uid: `node:${node.id}`,
      text: shortenLabel(node.shortOid),
      x,
      y: y + nodeHalfExtent(node.accent) + LABEL_GAP,
      z,
      kind: 'commit',
      priority: null,
      nodeId: node.id,
      facts: {
        hasRef: refsOnNode.has(node.id),
        isHead: node.accent === 'head',
        isMerge: mergeIds.has(node.id),
      },
      refKind: null,
      aria: `commit ${node.shortOid}, ${accentLabel(node.accent)}`,
    });
  }

  // ── Nhãn nhánh, LẶP dọc theo làn ────────────────────────────────────────
  // Nhãn làn nằm DƯỚI làn vì phía trên đã là chỗ của nhãn commit và badge ref.
  // Chiều xuống ở đây không xung đột với nghĩa "mất" của hợp đồng §Y: cái đó
  // nói về CHUYỂN ĐỘNG của thân commit, không về chỗ đặt một mẩu chữ.
  const laneSpan = new Map<string, { repo: SceneRepo; lane: number; min: number; max: number }>();
  for (const node of placement.nodes) {
    const key = `${node.repo}:${String(node.lane)}`;
    const span = laneSpan.get(key);
    if (span === undefined) {
      laneSpan.set(key, { repo: node.repo, lane: node.lane, min: node.depth, max: node.depth });
      continue;
    }
    if (node.depth < span.min) span.min = node.depth;
    if (node.depth > span.max) span.max = node.depth;
  }

  const names: Record<SceneRepo, Readonly<Record<number, string>>> = {
    local: laneLabels(view, layoutAdapter(placement, 'local', oidOf), 'local'),
    origin: laneLabels(view, layoutAdapter(placement, 'origin', oidOf), 'origin'),
  };

  for (const span of laneSpan.values()) {
    const name = names[span.repo][span.lane];
    if (name === undefined) continue;
    const text = shortenLabel(name);
    const y = deviationY(span.lane) - LANE_LABEL_DROP;
    const z = laneZ(span.repo, span.lane, placement.localLaneCount);
    const depths = laneLabelDepths(span.min, span.max);
    depths.forEach((depth, index) => {
      const primary = index === 0;
      out.push({
        uid: `lane:${span.repo}:${String(span.lane)}:${String(depth)}`,
        text,
        x: depth * X_STEP,
        y,
        z,
        kind: primary ? 'lane' : 'lane-repeat',
        priority: primary ? LABEL_PRIORITY.lanePrimary : LABEL_PRIORITY.laneRepeat,
        nodeId: null,
        facts: null,
        refKind: null,
        aria: primary ? `làn nhánh ${name}` : null,
      });
    });
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════

export interface SceneLabels3DProps extends Scene3DLayerProps {
  /**
   * Phần tử chứa nhãn, truyền dưới dạng GIÁ TRỊ chứ không phải ref.
   *
   * ⚠ Một `RefObject` có thể còn `null` đúng lúc effect dựng pool chạy, và
   * effect đó sẽ không bao giờ chạy lại — nhãn biến mất VĨNH VIỄN mà không một
   * lỗi nào được ném. Giá trị thì đánh thức được effect khi nó xuất hiện. Đây
   * là bẫy mà `k8s-arena/scene/scene-labels.tsx` đã ghi lại ở dòng 33-39, và
   * lý do duy nhất nó không cắn ở đây là vì bản này chép đúng cách truyền.
   */
  readonly layer: HTMLDivElement | null;
}

/**
 * Chiếu nhãn ra toạ độ màn hình rồi GIÃN cho không chồng nhau.
 */
export function SceneLabels3D({
  placement,
  view,
  interaction,
  layer,
}: SceneLabels3DProps): null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const poolRef = useRef<HTMLSpanElement[]>([]);
  /** Loại đang được tô ở từng ô pool — để vòng lặp vẽ khỏi ghi lại style thừa. */
  const appliedRef = useRef<(Label3DKind | null)[]>([]);

  const sources = useMemo(() => buildSources(placement, view), [placement, view]);

  /**
   * Phiên bản CẤU TRÚC. Tăng mỗi lần `sources` được dựng lại.
   *
   * Không dùng `sources.length`: hai cấu trúc khác nhau có thể cùng số nhãn
   * (đổi tên một nhánh), và lúc đó khoá bộ nhớ đệm dưới đây không đổi nên nhãn
   * giữ nguyên chữ cũ — sai mà không có triệu chứng nào ngoài chính chữ đó.
   */
  const versionRef = useRef(0);
  const lastSourcesRef = useRef<readonly LabelSource[] | null>(null);
  if (lastSourcesRef.current !== sources) {
    lastSourcesRef.current = sources;
    versionRef.current += 1;
  }

  const cacheRef = useRef({
    key: '',
    world: new THREE.Matrix4(),
    projection: new THREE.Matrix4(),
  });

  useEffect(() => {
    if (layer === null) return;
    const pool: HTMLSpanElement[] = [];
    for (let i = 0; i < MAX_LABELS_3D; i += 1) {
      const span = document.createElement('span');
      span.className = KIND_CLASS.commit;
      span.style.display = 'none';
      span.style.willChange = 'transform';
      layer.appendChild(span);
      pool.push(span);
    }
    poolRef.current = pool;
    appliedRef.current = new Array<Label3DKind | null>(MAX_LABELS_3D).fill(null);
    cacheRef.current.key = '';
    return () => {
      for (const span of pool) span.remove();
      poolRef.current = [];
      appliedRef.current = [];
    };
  }, [layer]);

  useFrame(() => {
    const pool = poolRef.current;
    if (pool.length === 0 || size.width === 0 || size.height === 0) return;

    const cache = cacheRef.current;
    const key = `${String(versionRef.current)}:${String(size.width)}:${String(size.height)}:${interaction.selectedId ?? ''}:${interaction.hoveredId ?? ''}`;
    if (
      key === cache.key &&
      cache.world.equals(camera.matrixWorld) &&
      cache.projection.equals(camera.projectionMatrix)
    ) {
      return;
    }
    cache.key = key;
    cache.world.copy(camera.matrixWorld);
    cache.projection.copy(camera.projectionMatrix);

    let count = 0;

    const push = (source: LabelSource, priority: number): void => {
      if (count >= MAX_LABEL_CANDIDATES) return;
      TMP_PROJECT.set(source.x, source.y, source.z).project(camera);
      // `z > 1` = sau lưng camera hoặc quá mặt phẳng xa. Chiếu một điểm sau lưng
      // cho ra toạ độ màn hình HỢP LỆ nhưng lật ngược — nhãn hiện ở phía đối
      // diện màn hình và trỏ vào một commit khác.
      if (TMP_PROJECT.z > 1) return;
      const target = box(count);
      target.uid = source.uid;
      target.text = source.text;
      target.kind = source.kind;
      target.refKind = source.refKind;
      target.aria = source.aria;
      target.x = (TMP_PROJECT.x * 0.5 + 0.5) * size.width;
      target.y = (-TMP_PROJECT.y * 0.5 + 0.5) * size.height;
      target.halfWidth = (source.text.length * LABEL_CHAR_WIDTH) / 2 + 4;
      target.halfHeight = LABEL_HALF_HEIGHT;
      target.priority = priority;
      count += 1;
    };

    /*
     * Duyệt NHIỀU LƯỢT theo ưu tiên — xem `labelPass()` về vì sao.
     *
     * Tóm tắt: bộ đệm ứng viên bị chặn ở `MAX_LABEL_CANDIDATES`, nên một vòng
     * duyệt tuần tự có thể lấp đầy nó bằng nhãn oid trước khi tới ba tên mặt
     * phẳng, và lúc đó bước sắp xếp không cứu được gì — nó chỉ sắp thứ đã vào
     * được mảng.
     */
    for (let pass = 0; pass < LABEL_PASS_COUNT; pass += 1) {
      for (const source of sources) {
        const priority =
          source.priority ??
          commitLabelPriority({
            hasRef: source.facts?.hasRef ?? false,
            isHead: source.facts?.isHead ?? false,
            isMerge: source.facts?.isMerge ?? false,
            selected: source.nodeId !== null && source.nodeId === interaction.selectedId,
            hovered: source.nodeId !== null && source.nodeId === interaction.hoveredId,
          });
        if (labelPass(priority) !== pass) continue;
        push(source, priority);
      }
    }

    layoutLabels(BOXES, count, {
      maxLabels: MAX_LABELS_3D,
      viewWidth: size.width,
      viewHeight: size.height,
      nudgeStep: LABEL_NUDGE_STEP,
      maxNudges: LABEL_MAX_NUDGES,
    });

    const applied = appliedRef.current;
    let shown = 0;
    for (let i = 0; i < count && shown < pool.length; i += 1) {
      const candidate = BOXES[i];
      if (candidate === undefined || !candidate.visible) continue;
      const span = pool[shown];
      if (span === undefined) break;

      if (applied[shown] !== candidate.kind) {
        applied[shown] = candidate.kind;
        span.className = KIND_CLASS[candidate.kind];
        // Dọn SẠCH kiểu của badge trước khi tô kiểu mới: một ô pool vừa mang
        // một badge `notched` mà giờ mang nhãn oid sẽ giữ nguyên `clip-path` và
        // bị cắt mất một góc — trông như lỗi font, không như lỗi style.
        clearRefShape(span);
        /*
         * Nhãn LẶP bị giấu khỏi trình đọc màn hình. Nó không mang thông tin mới
         * — chỉ là cùng một tên nhánh nhắc lại để mắt khỏi phải nhớ suốt chiều
         * ngang. Đọc to nó bốn lần là tiếng ồn, và tiếng ồn làm người dùng tắt
         * luôn phần đọc mà lẽ ra họ cần.
         */
        if (candidate.kind === 'lane-repeat') span.setAttribute('aria-hidden', 'true');
        else span.removeAttribute('aria-hidden');
      }
      // Tô mỗi khung hình chứ không chỉ khi đổi loại: hai badge khác `kind` ref
      // (`branch` rồi `tag`) có thể rơi vào cùng một ô pool mà `applied` không
      // đổi, và ô đó sẽ giữ nguyên màu của badge trước.
      if (candidate.refKind !== null) applyRefShape(span, candidate.refKind);
      // `aria-label` đổi theo NỘI DUNG chứ không theo loại, nên nó phải được
      // ghi ngoài khối `applied` ở trên: hai ô file khác nhau rơi vào cùng một ô
      // pool sẽ giữ nguyên câu đọc của ô trước, và trình đọc màn hình nói sai
      // tên file mà màn hình thì vẫn đúng.
      if (candidate.aria === null) span.removeAttribute('aria-label');
      else if (span.getAttribute('aria-label') !== candidate.aria) {
        span.setAttribute('aria-label', candidate.aria);
      }
      if (span.textContent !== candidate.text) span.textContent = candidate.text;
      if (span.style.display !== 'block') span.style.display = 'block';
      const transform = `translate3d(${candidate.x.toFixed(1)}px, ${candidate.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      if (span.style.transform !== transform) span.style.transform = transform;
      shown += 1;
    }
    for (let i = shown; i < pool.length; i += 1) {
      const span = pool[i];
      if (span !== undefined && span.style.display !== 'none') span.style.display = 'none';
    }
  });

  return null;
}
