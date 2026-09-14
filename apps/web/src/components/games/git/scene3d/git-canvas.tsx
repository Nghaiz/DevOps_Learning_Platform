'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Object3D } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthoCameraRig } from './ortho-camera-rig.tsx';
import {
  DEFAULT_ANGLE_INDEX,
  cycleRefKey,
  nextAngle,
  prevAngle,
  refTargetPosition,
  refTargets,
  stepZoomScale,
  type RefTarget,
} from './camera-angles.ts';
import type { Scene3DPlacement } from './scene3d-contract.ts';
import type { SceneProps } from '../../shared/scene-props.ts';

/**
 * Gốc `<Canvas>` của tầng 3D game Git (17.K, lane A).
 *
 * Thành phần này KHÔNG vẽ gì. Nó dựng bốn thứ mà mọi tầng khác dựa vào, và
 * không thứ nào trong bốn thứ đó đặt đúng chỗ được nếu để mỗi tầng tự lo:
 *
 *  1. Vòng lặp vẽ THEO YÊU CẦU, cùng cái gác đúng cho nó.
 *  2. Camera orthographic tám góc + phép nhảy tới ref (`ortho-camera-rig.tsx`).
 *  3. Bàn phím đủ cho toàn bộ thao tác camera (ô nghiệm thu AC-L).
 *  4. Phần tử dò màu — nguồn DUY NHẤT để mọi tầng đọc token màu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ CẠM BẪY SỐ 1: GÁC `frameloop="demand"` BẰNG SAI TÍN HIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `frameloop="demand"` nghĩa là KHÔNG có gì được vẽ cho tới khi ai đó gọi
 * `invalidate()`. Phản xạ sai — và đã trả giá ở arena — là gác nó bằng
 * `pointerenter`/`pointerleave`: mọi bảng HUD đều bắt sự kiện chuột, nên vừa rê
 * chuột ra khỏi khung 3D là không ai xin khung nữa và **vòng lặp dừng hẳn**,
 * ngay lúc người chơi vẫn đang nhìn thẳng vào cảnh
 * (`k8s-arena/scene/frame-pump.tsx:162-178`).
 *
 * Tín hiệu đúng cho câu hỏi "người dùng có nhìn thấy cảnh không" là
 * `document.visibilityState` (tab bị ẩn) cộng `IntersectionObserver` (canvas
 * cuộn ra khỏi màn hình). Đó là thứ `FramePump` dưới đây gác.
 *
 * Và vì mọi thứ ĐỔI MÀ KHÔNG SINH CHUYỂN ĐỘNG — chọn commit, rê chuột lên một
 * node, đổi theme, đổi góc camera — cũng cần đúng một khung hình, `FramePump`
 * xin một khung sau MỖI lượt render của cây React. Một khung cho một lượt
 * render, không hơn.
 *
 * ⛔ Vì vậy thành phần này **cố tình KHÔNG được bọc `memo`**. Bọc lại thì
 * `FramePump` không render lại khi cha đổi prop, không ai xin khung, và cảnh
 * đứng hình sau mỗi lệnh người chơi gõ — im lặng, không lỗi.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Kênh đo cho ô nghiệm thu AC-7
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Số liệu phát ra ở `globalThis.__dlpGitScene`.
 *
 * ⚠ TÊN NÀY LÀ MỘT HỢP ĐỒNG với bên e2e. Arena đã một lần đổi tên kênh đo mà
 * không đổi bên đọc, và hậu quả là mọi ô hiệu năng báo "không đo được" trong im
 * lặng — một cổng không đỏ, chỉ ngừng đo
 * (`k8s-arena/scene/frame-pump.tsx:15-21`). Đổi ở đây thì phải đổi cả bên kia.
 */
export interface GitSceneStats {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly frames: number;
  readonly objects: number;
  /**
   * Lý do bảng màu phải dùng màu dự phòng, hoặc `null` khi màu đọc được thật.
   *
   * Có mặt ở đây vì "cả cảnh xám ngoét" là một lỗi KHÔNG ném, không đỏ, và tốn
   * nửa ngày để lần ra bằng mắt. Đưa nó vào kênh đo thì một ô e2e khẳng định
   * được `colorsDegraded === null`, tức phép đo màu thật sự đã chạy.
   */
  readonly colorsDegraded: string | null;
}

declare global {
  var __dlpGitScene: (() => GitSceneStats) | undefined;
}

let degradedReason: string | null = null;
const degradedSeen = new Set<string>();

/**
 * Đường báo suy giảm bảng màu. Gốc hợp thành truyền hàm này làm `onDegraded`
 * của `use-git-scene-colors.ts`.
 *
 * Khử trùng theo lý do: hook đọc lại màu qua `MutationObserver` mỗi lần theme
 * đổi, nên một cấu hình hỏng sẽ báo lại ở MỌI lần bật/tắt chế độ tối — và một
 * console đầy cùng một dòng thì bị cuộn qua như nhiễu.
 */
export function reportGitSceneColorsDegraded(reason: string): void {
  degradedReason = reason;
  if (degradedSeen.has(reason)) return;
  degradedSeen.add(reason);
  console.warn(`[git-scene3d] Bảng màu suy giảm, cảnh đang dùng màu dự phòng: ${reason}`);
}

/** Xoá trạng thái suy giảm. Dành cho test — biến cấp module sống qua mọi lần unmount. */
export function resetGitSceneColorsDegraded(): void {
  degradedReason = null;
  degradedSeen.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// Phần tử dò màu
// ═══════════════════════════════════════════════════════════════════════════

const GitSceneProbeContext = createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * Phần tử dò màu của cảnh, cho tầng nằm BÊN TRONG `<Canvas>`.
 *
 * React context được `<Canvas>` bắc cầu sang bộ dựng của R3F, nên một tầng con
 * đọc được ref này y như một component DOM bình thường. Gốc hợp thành nằm NGOÀI
 * canvas thì dùng prop `probeRef` thay vì hook này.
 */
export function useGitSceneProbe(): RefObject<HTMLElement | null> | null {
  return useContext(GitSceneProbeContext);
}

// ═══════════════════════════════════════════════════════════════════════════
// Lệnh camera
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lệnh camera cho HUD (nút bấm) — bàn phím đi thẳng vào trạng thái bên trong.
 *
 * ⚠ Là SỰ KIỆN có dấu thời gian, không phải trạng thái. Bấm "xoay phải" hai lần
 * liên tiếp phải xoay hai lần, mà hai prop trạng thái giống hệt nhau thì lần thứ
 * hai rơi vào hư không — cùng lý do arena chọn hình dạng này
 * (`k8s-arena/scene/camera-rig.tsx:40-42`).
 */
export type GitCameraCommand =
  | { readonly kind: 'rotate'; readonly direction: number; readonly issuedAt: number }
  | { readonly kind: 'zoom'; readonly direction: number; readonly issuedAt: number }
  | { readonly kind: 'frame-all'; readonly issuedAt: number }
  | { readonly kind: 'teleport'; readonly refKey: string; readonly issuedAt: number };

/** Trạng thái camera báo ngược lên cho HUD vẽ nút và danh sách ref. */
export interface GitCameraView {
  readonly angleIndex: number;
  readonly zoomScale: number;
  readonly focusKey: string | null;
  readonly targets: readonly RefTarget[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════════════

export interface GitCanvasProps {
  /** Kết quả `place3d()`, gọi ĐÚNG MỘT LẦN ở gốc hợp thành (hợp đồng §Scene3DLayerProps). */
  readonly placement: Scene3DPlacement;
  readonly view: SceneProps['view'];
  /** Nhãn đọc ra cho cả đồ thị, tiếng Việt. */
  readonly label?: string | undefined;
  /** Ép "giảm chuyển động"; bỏ trống thì tự đọc từ thiết lập hệ điều hành. */
  readonly reducedMotion?: boolean | undefined;
  readonly maxPixelRatio?: number | undefined;
  /**
   * Ref của phần tử dò màu. Gốc hợp thành truyền vào rồi tự gọi
   * `useGitSceneColors(probeRef, reportGitSceneColorsDegraded)`; bỏ trống thì
   * thành phần này vẫn dựng phần tử dò, chỉ không ai đọc.
   */
  readonly probeRef?: RefObject<HTMLElement | null> | undefined;
  /**
   * Số hiệu bảng màu từ `useGitSceneColors`. Tăng một đơn vị là "theme vừa
   * đổi" — xem khối ghi chú ở `FramePump`.
   */
  readonly colorsVersion?: number | undefined;
  readonly command?: GitCameraCommand | null | undefined;
  readonly onCameraChange?: ((state: GitCameraView) => void) | undefined;
  readonly children?: ReactNode | undefined;
}

/** Trần tỉ lệ pixel. Trên 2 thì số pixel tăng gấp bội mà mắt gần như không thấy khác. */
const DEFAULT_MAX_PIXEL_RATIO = 2;

const DIGIT_KEY = /^[1-9]$/;

export function GitCanvas({
  placement,
  view,
  label,
  reducedMotion,
  maxPixelRatio,
  probeRef,
  colorsVersion,
  command,
  onCameraChange,
  children,
}: GitCanvasProps): ReactElement {
  const helpId = useId();
  const internalProbe = useRef<HTMLElement | null>(null);
  const systemReducedMotion = usePrefersReducedMotion();

  const [angleIndex, setAngleIndex] = useState(DEFAULT_ANGLE_INDEX);
  const [zoomScale, setZoomScale] = useState(1);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const targets = useMemo(() => refTargets(view, placement), [view, placement]);
  const target = useMemo(() => refTargetPosition(targets, focusKey), [targets, focusKey]);

  const resetCamera = useCallback((): void => {
    setAngleIndex(DEFAULT_ANGLE_INDEX);
    setZoomScale(1);
    setFocusKey(null);
  }, []);

  /*
   * Lệnh từ HUD. Không mảng phụ thuộc, chốt theo `issuedAt` — xem chú thích của
   * `GitCameraCommand` về lý do lệnh là sự kiện chứ không phải trạng thái.
   */
  const handledRef = useRef(-1);
  useEffect(() => {
    if (command === null || command === undefined || command.issuedAt === handledRef.current) {
      return;
    }
    handledRef.current = command.issuedAt;
    if (command.kind === 'rotate') {
      setAngleIndex(command.direction < 0 ? prevAngle : nextAngle);
    } else if (command.kind === 'zoom') {
      setZoomScale((scale) => stepZoomScale(scale, command.direction));
    } else if (command.kind === 'frame-all') {
      resetCamera();
    } else {
      setFocusKey(command.refKey);
    }
  });

  useEffect(() => {
    onCameraChange?.({ angleIndex, zoomScale, focusKey, targets });
  }, [angleIndex, zoomScale, focusKey, targets, onCameraChange]);

  /**
   * Bàn phím — đây là TOÀN BỘ đường điều khiển camera, không phải một lối tắt
   * thêm vào. AC-L đòi mọi thao tác làm được bằng bàn phím, và vì lane này cấm
   * xoay bằng chuột nên nếu chỗ này thiếu một thao tác thì thao tác đó không
   * tồn tại cho ai cả.
   *
   * Không nuốt phím có phím bổ trợ: `Ctrl+0` là "về cỡ chữ gốc" của trình duyệt,
   * và cướp nó là cướp một thứ người ta đã có từ trước.
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      let handled = true;

      if (key === 'q' || key === 'Q') {
        setAngleIndex(prevAngle);
      } else if (key === 'e' || key === 'E') {
        setAngleIndex(nextAngle);
      } else if (key === '+' || key === '=') {
        setZoomScale((scale) => stepZoomScale(scale, 1));
      } else if (key === '-' || key === '_') {
        setZoomScale((scale) => stepZoomScale(scale, -1));
      } else if (key === '0') {
        resetCamera();
      } else if (key === 't') {
        setFocusKey((current) => cycleRefKey(targets, current, 1));
      } else if (key === 'T') {
        setFocusKey((current) => cycleRefKey(targets, current, -1));
      } else if (DIGIT_KEY.test(key)) {
        // `0` đã là "khung-toàn-bộ", nên danh sách ref bắt đầu từ phím `1`.
        const picked = targets[Number(key) - 1];
        if (picked === undefined) handled = false;
        else setFocusKey(picked.key);
      } else {
        handled = false;
      }

      if (handled) event.preventDefault();
    },
    [targets, resetCamera],
  );

  /*
   * Hai object này PHẢI ổn định theo tham chiếu: `<Canvas>` gọi lại
   * `configure()` ở mỗi lượt render (effect của nó không có mảng phụ thuộc), và
   * một literal mới mỗi lượt là một lần cấu hình lại bộ đổ hoạ cho mỗi lần
   * người chơi gõ một lệnh.
   */
  const glOptions = useMemo(
    () => ({ antialias: true, alpha: true, powerPreference: 'high-performance' as const }),
    [],
  );
  const dpr = useMemo(
    (): [number, number] => [1, maxPixelRatio ?? DEFAULT_MAX_PIXEL_RATIO],
    [maxPixelRatio],
  );

  const probe = probeRef ?? internalProbe;

  return (
    <GitSceneProbeContext.Provider value={probe}>
      <div
        data-testid="git-scene3d"
        /*
         * Focus được, và bàn phím gắn ở ĐÂY chứ không gắn lên `<Canvas>`: R3F
         * chuyển mọi prop lạ xuống một `<div>` bọc ngoài (đã đọc mã nguồn
         * `react-three-fiber` 9.7.0), nên `role="img"` và `tabIndex` sẽ rơi vào
         * CÙNG một phần tử — một "hình ảnh" focus được là thứ trình đọc màn hình
         * không biết phải nói gì. Tách ra: khối ngoài là nhóm điều khiển, khối
         * trong là hình ảnh.
         */
        role="group"
        tabIndex={0}
        aria-label="Khung nhìn 3D, điều khiển bằng bàn phím"
        aria-describedby={helpId}
        /*
         * ⚠ Phải liệt kê ĐỦ, kể cả `1`–`9`.
         *
         * `onKeyDown` ngay dưới và đoạn trợ giúp `sr-only` ngay trên đều nhận
         * `1`–`9` (nhảy thẳng tới ref thứ N), nhưng thuộc tính này từng bỏ sót
         * chúng. Người dùng trình đọc màn hình nghe thuộc tính này chứ không
         * đọc `onKeyDown`, nên thiếu ở đây là thiếu với đúng nhóm mà nó phục vụ
         * — và không cổng nào so được hai danh sách đó với nhau.
         */
        aria-keyshortcuts="Q E Shift+T T 0 + - 1 2 3 4 5 6 7 8 9"
        onKeyDown={onKeyDown}
        className="relative h-full w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        {/*
          Phần tử dò màu. Nằm NGOÀI `<Canvas>` và trong cây DOM đang mang theme,
          nên `getComputedStyle` trả về màu đã được `.dark` phân giải.

          ⛔ KHÔNG `display: none`, KHÔNG `visibility: hidden`. Phần tử không được
          bố trí thì vài trình duyệt trả chuỗi rỗng cho thuộc tính màu, và cả cảnh
          rơi về màu dự phòng xám. Đẩy ra ngoài màn hình là cách duy nhất vừa ẩn
          vừa còn đọc được — khuôn mẫu đã chạy ở
          `k8s-arena/scene/arena-scene.tsx:77-81`.
        */}
        <span
          ref={(node) => {
            probe.current = node;
          }}
          aria-hidden="true"
          className="pointer-events-none fixed -top-[9999px] h-px w-px opacity-0"
        />

        <p id={helpId} className="sr-only">
          Q và E xoay qua tám góc nhìn cố định. Dấu cộng và dấu trừ phóng to, thu nhỏ. Phím 0 đưa
          camera về khung nhìn toàn cảnh. Phím T nhảy tới ref kế tiếp, Shift T nhảy ngược lại. Các
          phím số từ 1 đến 9 nhảy thẳng tới ref tương ứng; ref của nhánh đang đứng luôn là phím 1.
        </p>

        <Canvas
          // Vẽ THEO YÊU CẦU: không có gì đổi thì không khung hình nào được vẽ.
          frameloop="demand"
          dpr={dpr}
          gl={glOptions}
          role="img"
          aria-label={label ?? 'Sơ đồ 3D của kho Git'}
        >
          <FramePump colorsVersion={colorsVersion} />
          <OrthoCameraRig
            bounds={placement.bounds}
            angleIndex={angleIndex}
            target={target}
            zoomScale={zoomScale}
            reducedMotion={reducedMotion ?? systemReducedMotion}
          />
          {children}
        </Canvas>
      </div>
    </GitSceneProbeContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bộ đập nhịp
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ưu tiên `useFrame` của bộ đập nhịp — âm nhất trong cảnh, để `gl.info.reset()`
 * là việc ĐẦU TIÊN của mỗi khung hình.
 *
 * ⚠ Phải ÂM. Trong R3F, một ưu tiên DƯƠNG tắt phép vẽ tự động và giao việc gọi
 * `gl.render()` cho bạn — cảnh đen thui mà không một lỗi nào được ném.
 */
const PUMP_FRAME_PRIORITY = -3;

const RENDERABLE_TYPES = new Set(['Mesh', 'Line', 'LineSegments', 'LineLoop', 'Points', 'Sprite']);

function countRenderables(root: Object3D): number {
  let total = 0;
  // `traverseVisible` bỏ qua cả nhánh con của một vật đang ẩn — đúng nghĩa "đang
  // có mặt trên màn hình", chứ không phải "đang có mặt trong cây cảnh".
  root.traverseVisible((object) => {
    if (RENDERABLE_TYPES.has(object.type)) total += 1;
  });
  return total;
}

function FramePump({ colorsVersion }: { readonly colorsVersion: number | undefined }): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const framesRef = useRef(0);
  /** Canvas có còn nằm trong tầm nhìn không. Khởi tạo `true`: cảnh vào khung ngay lúc mở màn. */
  const visibleRef = useRef(true);

  useEffect(() => {
    /*
     * Bộ đếm phải cộng dồn qua MỌI lượt vẽ trong một khung hình. Để `autoReset`
     * bật thì `calls` chỉ còn là số của lượt CUỐI — một con số nhỏ, trông đẹp, và
     * không đo cái gì cả (`k8s-arena/scene/frame-pump.tsx:85-88`).
     */
    gl.info.autoReset = false;
  }, [gl]);

  const requestFrame = useCallback((): void => {
    if (!visibleRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onVisibility = (): void => {
      // Quay lại tab: mọi thay đổi bị nén lại lúc ẩn giờ mới được vẽ. Gọi thẳng
      // `invalidate()` chứ không qua `requestFrame` — cái gác vừa mới mở ra.
      if (document.visibilityState === 'visible') invalidate();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) invalidate();
      },
      // Ngưỡng 0: còn thấy một pixel là còn vẽ.
      { threshold: 0 },
    );
    observer.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [gl, invalidate]);

  /*
   * MỘT khung cho MỖI lượt render của cây React — không mảng phụ thuộc.
   *
   * Đây là chỗ những thay đổi "thấy được nhưng không tự sinh chuyển động" được
   * vẽ ra: chọn commit, rê chuột lên một node, đổi theme (`colorsVersion` tăng),
   * đổi góc camera. Không có dòng này thì bật chế độ tối xong cảnh vẫn giữ
   * nguyên màu cũ cho tới lần nào đó có thứ khác xin một khung — im lặng, không
   * lỗi, và không tái hiện được theo ý muốn.
   *
   * `colorsVersion` đọc ra ở đây chỉ để nói rõ nó thuộc nhóm nào; hiệu lực đến
   * từ chính việc effect này chạy lại sau mỗi lượt render.
   */
  useEffect(() => {
    void colorsVersion;
    requestFrame();
  });

  useFrame(() => {
    framesRef.current += 1;
    /*
     * Đặt lại ở ĐẦU khung, không ở cuối: three cộng dồn số lượt vẽ TRONG lúc
     * render, mà `useFrame` chạy TRƯỚC render. Đọc ở đây tức là đọc số của khung
     * vừa xong — đúng thứ ô AC-7 cần.
     */
    gl.info.reset();
  }, PUMP_FRAME_PRIORITY);

  useEffect(() => {
    globalThis.__dlpGitScene = (): GitSceneStats => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      frames: framesRef.current,
      objects: countRenderables(scene),
      colorsDegraded: degradedReason,
    });
    return () => {
      // Gán `undefined` chứ không `delete`: cửa sổ đo NGỪNG hoạt động, chứ không
      // phải chưa từng tồn tại — và `delete` trên một `var` toàn cục là lỗi kiểu.
      globalThis.__dlpGitScene = undefined;
    };
  }, [gl, scene]);

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Thiết lập hệ điều hành
// ═══════════════════════════════════════════════════════════════════════════

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listen = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  return reduced;
}
