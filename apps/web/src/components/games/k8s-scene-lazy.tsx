'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ClusterView } from '@devops-platform/games';
import { PLATFORM_DEPTH, PLATFORM_HEIGHT, PLATFORM_WIDTH, computeLayout } from './scene-layout';
import {
  DEATH_DURATION_S,
  SPAWN_DURATION_S,
  bobOffset,
  clamp01,
  easeInQuad,
  easeOutBack,
  phaseFromId,
  pulse01,
  transitionDuration,
} from './scene-motion';
import {
  SCENE_TOKEN_NAMES,
  createCanvasColorResolver,
  fallbackSceneColors,
  readSceneColors,
  type SceneTokenName,
  type StatusToken,
} from './scene-tokens';
import {
  TIER_FEATURES,
  createTierController,
  detectRendererString,
  tierFromRenderer,
  type QualityChoice,
  type QualityTier,
} from './scene-quality';

/**
 * ⛔ **FILE DUY NHẤT trong repo được `import 'three'`** (§4.3, §9.6).
 *
 * Nó dài hơn trần 200 dòng của `code-conventions.md`, và đó là một đánh đổi CÓ Ý
 * THỨC chứ không phải cẩu thả: hợp đồng nói ranh giới `three` phải là **một**
 * file, nên tách nhỏ ra sẽ nhân ranh giới đó lên và làm ô AC bundle không còn
 * kiểm được bằng một phép grep. Mọi phần KHÔNG cần `three` đã được đẩy ra ngoài
 * và có test riêng: `scene-layout` (toạ độ), `scene-motion` (easing, pha),
 * `scene-tokens` (màu), `scene-quality` (bậc chất lượng). Còn lại ở đây đúng là
 * phần chỉ chạy được khi có WebGL.
 *
 * ## Sáu ràng buộc hiệu năng của §11, và chỗ chúng nằm trong file này
 *
 * 1. **Draw call** — mọi pod/object dùng CHUNG một `InstancedMesh`; bệ node một
 *    cái; hào quang một cái; edge hai cái (liền / đứt); hạt một cái; sàn một cái.
 *    Tổng ~7 lệnh vẽ dù có 200 pod hay 2 pod.
 * 2. **Không cấp phát trong vòng lặp** — mọi `Vector3`/`Matrix4`/`Color` tạm đều
 *    dựng sẵn ở `TMP_*` và dùng lại. Đây là luật dễ vi phạm nhất vì mã vi phạm
 *    trông hoàn toàn vô hại.
 * 3. **React ngoài vòng lặp** — component này KHÔNG nhận `view` qua prop. Nó
 *    nhận `subscribe`/`getView` và tự nghe, nên một tick mô phỏng không kéo theo
 *    một lượt reconciliation. React ở đây chỉ dựng đúng hai thẻ và không bao giờ
 *    render lại vì trạng thái game.
 * 4. **Bóng đổ không tính lại mỗi frame** — `shadowMap.autoUpdate = false`, chỉ
 *    bật `needsUpdate` đúng frame có vật sinh/mất/đổi chỗ.
 * 5. **Kẹp pixel ratio** — theo bảng `TIER_FEATURES`.
 * 6. **Không đọc layout trong vòng lặp** — kích thước khung lấy từ callback của
 *    `ResizeObserver` và nhớ vào biến; nhãn DOM chỉ GHI `transform`.
 */

export interface K8sSceneProps {
  /** Nghe thẳng engine, không qua React. Trả hàm huỷ đăng ký. */
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getView: () => ClusterView;
  readonly selectedUid: string | null;
  readonly quality: QualityChoice;
  readonly onTierChange?: (tier: QualityTier) => void;
  /** Gọi khi không đọc được màu từ design token — vỏ game hiện cảnh báo. */
  readonly onDegradedColors?: () => void;
}

/** Số instance cấp phát sẵn. Vượt thì nhân đôi, và KHÔNG BAO GIỜ thu lại. */
const INITIAL_CAPACITY = 256;
/** Nhãn DOM tối đa. Quá số này thì chữ chồng lên nhau và không đọc được nữa. */
const MAX_LABELS = 40;
/** Số hạt trên mỗi edge khoẻ. */
const PARTICLES_PER_EDGE = 3;
const MAX_PARTICLES = 360;
/** Tốc độ hạt chạy dọc edge, đơn vị "phần đường mỗi giây". */
const PARTICLE_SPEED = 0.35;

// ── Vật tạm dùng chung, dựng MỘT LẦN ở tầm module (§11.1 mục 2) ─────────────
const TMP_MATRIX = new THREE.Matrix4();
const TMP_POS = new THREE.Vector3();
const TMP_SCALE = new THREE.Vector3();
const TMP_PROJECT = new THREE.Vector3();
const TMP_COLOR = new THREE.Color();
const TMP_HSL = { h: 0, s: 0, l: 0 };
const IDENTITY_QUAT = new THREE.Quaternion();

interface Entry {
  uid: string;
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  token: StatusToken;
  terminating: boolean;
  failing: boolean;
  label: string;
  /** 0..1 — tiến trình xuất hiện. */
  appear: number;
  /** 0..1 — tiến trình biến mất. `0` = đang sống. */
  dying: number;
  /** `true` khi object đã rời `ClusterView` và chỉ còn tồn tại để chạy nốt hiệu ứng. */
  doomed: boolean;
}

interface NodeEntry {
  name: string;
  x: number;
  ready: boolean;
  load: number;
}

/**
 * Cửa sổ đọc số liệu cho cổng đo §11.3.
 *
 * ⚠ Chỉ có bộ ĐẾM, không có dữ liệu game. Lane F cần đọc `renderer.info` từ bên
 * ngoài để kiểm "≤ 25 draw call với 200 pod" và "0 frame vẽ khi cảnh tĩnh 3
 * giây" — hai ô đó đo NGUYÊN NHÂN của giật, và không có đường nào khác chạm tới
 * chúng từ Playwright. Đo fps thay thế sẽ chỉ đo được máy chạy CI.
 */
export interface SceneStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  frames: number;
  tier: QualityTier;
  objects: number;
}

declare global {
  var __dlpK8sScene: (() => SceneStats) | undefined;
}

export default function K8sSceneLazy({
  subscribe,
  getView,
  selectedUid,
  quality,
  onTierChange,
  onDegradedColors,
}: K8sSceneProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(selectedUid);
  const subscribeRef = useRef(subscribe);
  const getViewRef = useRef(getView);
  const onTierChangeRef = useRef(onTierChange);
  const onDegradedRef = useRef(onDegradedColors);

  subscribeRef.current = subscribe;
  getViewRef.current = getView;
  onTierChangeRef.current = onTierChange;
  onDegradedRef.current = onDegradedColors;

  useEffect(() => {
    selectedRef.current = selectedUid;
  }, [selectedUid]);

  useEffect(() => {
    const host = hostRef.current;
    const labelLayer = labelLayerRef.current;
    if (host === null || labelLayer === null) {
      return;
    }

    // ── Renderer ────────────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      // Không có WebGL (GPU bị chặn, driver hỏng). Lớp DOM ở §4.4 là giao diện
      // chính thức và vẫn đầy đủ, nên đây không phải lỗi chặn đường — im lặng
      // không dựng cảnh còn hơn ném và làm trắng cả trang game.
      return;
    }

    const gl = renderer.getContext();
    const detectedTier = tierFromRenderer(detectRendererString(gl));
    let tier: QualityTier = quality === 'auto' ? detectedTier : quality;
    let features = TIER_FEATURES[tier];

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Phơi sáng nhích lên trên 1.0: ACES kéo vùng sáng xuống theo thiết kế, và ở
    // đúng 1.0 một phòng điều khiển tối đọc ra là "ảnh bị thiếu sáng".
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = features.shadows;
    /*
     * ⚠ **KHÔNG dùng `PCFSoftShadowMap`** — §9.1 mục 2 gọi đích danh nó, nhưng
     * three 0.185 đã BỎ nó và âm thầm thay bằng `PCFShadowMap`:
     *
     *   WebGLShadowMap.js — `if ( this.type === PCFSoftShadowMap ) { warn(…);
     *   this.type = PCFShadowMap; }`
     *
     * Nó chỉ cảnh báo trong console rồi ghi đè `this.type`, nên bậc "cao" vẫn
     * chạy nhưng KHÔNG hề có bóng mềm — đúng loại hỏng hóc im lặng mà §4.6 bắt
     * phải chạy thật mới kết luận. Phát hiện 2026-09-08 khi mở `/games/k8s`
     * trên `next start`: console in đúng dòng cảnh báo trên.
     *
     * `VSMShadowMap` là đường bóng mềm còn sống ở bản này, và là đường DUY NHẤT
     * mà `shadow.radius` còn có tác dụng (với PCF thường, `radius` bị bỏ qua).
     */
    renderer.shadowMap.type = features.softShadows ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    // §11.1 mục 4 — cảnh gần như tĩnh; chỉ vẽ lại shadow map khi topology đổi.
    renderer.shadowMap.autoUpdate = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, features.maxPixelRatio));
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    // Canvas KHÔNG nhận focus (§4.4). Nó là hình minh hoạ; đường đi bàn phím
    // nằm trọn ở các panel DOM, và một canvas focus được sẽ thêm một điểm dừng
    // Tab dẫn tới hư không.
    renderer.domElement.tabIndex = -1;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    // ── Scene, camera, ánh sáng ba điểm (§9.1 mục 2) ────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 120);
    camera.position.set(0, 7.5, 13);
    const cameraTarget = new THREE.Vector3(0, 0.6, 0);
    const cameraGoal = camera.position.clone();
    camera.lookAt(cameraTarget);

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(6, 11, 7);
    key.castShadow = features.shadows;
    key.shadow.mapSize.set(features.softShadows ? 2048 : 1024, features.softShadows ? 2048 : 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.02;
    if (features.softShadows) {
      // Chỉ VSM đọc hai giá trị này. `radius` là độ nhoè mép bóng — thứ tạo ra
      // "bóng mềm"; `blurSamples` là số mẫu làm mờ. Để mặc định thì VSM cho ra
      // bóng gần như cứng, tức đổi API mà không đổi kết quả.
      key.shadow.radius = 4;
      key.shadow.blurSamples = 12;
    }
    scene.add(key);

    // ⚠ Hai vế của hemisphere light CÓ khác nhau lúc chạy, dù dòng khởi tạo dưới
    // đây trông như không: `applyColors()` ghi `groundColor` từ token nền, và nó
    // chạy TRƯỚC frame đầu tiên, nên giá trị dựng ở đây không bao giờ lên màn
    // hình. Giữ được đúng cái làm nên hemisphere light — sáng từ trên so với dội
    // từ dưới, tức phần đổ bóng đứng mà §9.1 tính là một trong bốn thứ tạo cảm
    // giác "được thiết kế".
    //
    // ⚠ `groundColor` KHÔNG được để đen cứng: nó là ánh sáng dội lên từ sàn, và
    // sàn mang màu nền. Để đen thì mặt dưới mọi vật tối đen trên theme SÁNG —
    // đúng lỗi §4.5 tồn tại để chặn, và là lỗi không một test nào hiện có bắt
    // được vì không có phép đo nào chạm tới màu đã render. `applyColors()` ghi
    // đè cả hai giá trị dưới đây từ token.
    const fill = new THREE.HemisphereLight(0xffffff, new THREE.Color(), 0.55);
    scene.add(fill);

    // Rim: hắt từ SAU và THẤP, đúng chỗ bắt được góc bo của khối (§9.1 mục 4).
    // Không có nó thì khối bo trông y hệt khối cạnh sắc, và cả công đoạn bo góc
    // trở thành vô nghĩa.
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(-7, 2.5, -8);
    scene.add(rim);

    // ⚠ Ba đèn trên dùng 0xffffff — đây KHÔNG phải vi phạm §4.5. Màu TRẮNG của
    // một nguồn sáng nghĩa là "không nhuộm", tức là để vật liệu (vốn lấy màu từ
    // token) hiện đúng màu của nó. Nhuộm đèn theo token thương hiệu sẽ nhân màu
    // hai lần và làm mọi trạng thái ngả về cùng một sắc.

    // ── Môi trường sinh tại chỗ (§9.1 mục 3) ────────────────────────────────
    let envTexture: THREE.Texture | null = null;
    if (features.environment) {
      // `pmrem` là biến CỤC BỘ trong khối này, không phải biến của cả effect:
      // nó chết ngay sau khi sinh xong texture, nên không có gì để dọn lúc
      // unmount và không có biến sống thừa để ai đó dùng nhầm về sau.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envTexture = pmrem.fromScene(room, 0.04).texture;
      scene.environment = envTexture;
      room.dispose();
      // Giải phóng bộ sinh NGAY: nó giữ render target và material làm mờ chỉ
      // dùng một lần, còn texture kết quả sống độc lập. Giữ tới lúc unmount là
      // chiếm bộ nhớ GPU suốt phiên chơi để đổi lấy không gì cả.
      pmrem.dispose();
    }

    // ── Màu từ design token ─────────────────────────────────────────────────
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.position = 'fixed';
    probe.style.top = '-9999px';
    probe.style.width = '1px';
    probe.style.height = '1px';
    probe.style.opacity = '0';
    probe.style.pointerEvents = 'none';
    host.appendChild(probe);

    const resolveColor = createCanvasColorResolver(document);
    const tokenColors = {} as Record<SceneTokenName, THREE.Color>;
    for (const name of SCENE_TOKEN_NAMES) {
      tokenColors[name] = new THREE.Color();
    }
    let reportedDegraded = false;

    function applyColors(): void {
      const result =
        typeof window === 'undefined'
          ? { colors: fallbackSceneColors(), degraded: true }
          : readSceneColors(probe, (el) => window.getComputedStyle(el).color, resolveColor);
      for (const name of SCENE_TOKEN_NAMES) {
        const rgb = result.colors[name];
        // `SRGBColorSpace` bắt buộc: token là màu sRGB, còn không gian làm việc
        // của three là linear. Bỏ tham số này thì mọi màu ra nhạt và bợt — đúng
        // triệu chứng mà §9.1 mục 1 gọi là "trông rẻ tiền".
        tokenColors[name].setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
      }
      if (result.degraded && !reportedDegraded) {
        reportedDegraded = true;
        console.warn('[k8s-scene] không đọc được màu từ design token, đang dùng màu xám dự phòng');
        onDegradedRef.current?.();
      }
      scene.background = tokenColors.background;
      fog.color.copy(tokenColors.background);
      groundMaterial.color.copy(tokenColors.background);
      // Ánh sáng dội lên từ sàn — cùng màu với sàn, đổi theo theme.
      fill.groundColor.copy(tokenColors.background);
    }

    // Màu dựng rỗng rồi để `applyColors()` điền: fog PHẢI trùng màu nền, nếu
    // không vật ở xa chìm về một màu khác màu trang và mép cảnh lộ ra như một
    // vệt bẩn. Đen chỉ đúng ở theme tối.
    const fog = new THREE.Fog(new THREE.Color(), 14, 46);
    scene.fog = fog;

    // ── Hình học dùng chung ─────────────────────────────────────────────────
    // MỘT geometry cho mọi object, MỘT cho mọi bệ. Đây là điều kiện của
    // instancing: khác nhau chỉ ở ma trận và màu instance.
    const seg = TIER_FEATURES[tier].roundedSegments;
    const objectGeometry = new RoundedBoxGeometry(1, 1, 1, seg, 0.18);
    const platformGeometry = new RoundedBoxGeometry(PLATFORM_WIDTH, PLATFORM_HEIGHT, PLATFORM_DEPTH, seg, 0.1);
    const groundGeometry = new THREE.PlaneGeometry(90, 90);

    const objectMaterial = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.12 });
    const platformMaterial = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.55 });
    // Hào quang: `MeshBasicMaterial` ở đây KHÔNG vi phạm lệnh cấm của §9.1 mục 3
    // ("cấm cho vật thể chính") — nó không phải vật thể, nó là ánh sáng. Cộng
    // dồn + không ghi depth để nó chồng lên nhau như quầng sáng thật, và đây
    // cũng chính là thứ nuôi bloom ở §9.4.
    const glowMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const groundMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -PLATFORM_HEIGHT / 2 - 0.01;
    ground.receiveShadow = features.shadows;
    scene.add(ground);

    let capacity = INITIAL_CAPACITY;
    let objectMesh = createInstanced(objectGeometry, objectMaterial, capacity, features.shadows);
    let glowMesh = createInstanced(objectGeometry, glowMaterial, capacity, false);
    const platformMesh = createInstanced(platformGeometry, platformMaterial, 32, features.shadows);
    scene.add(objectMesh, glowMesh, platformMesh);

    function createInstanced(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      count: number,
      shadows: boolean,
    ): THREE.InstancedMesh {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = false;
      mesh.count = 0;
      // Gọi một lần để three cấp phát `instanceColor`; sau đó chỉ ghi đè.
      mesh.setColorAt(0, TMP_COLOR.setRGB(1, 1, 1));
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      return mesh;
    }

    // ── Edge + hạt ──────────────────────────────────────────────────────────
    const solidGeometry = new THREE.BufferGeometry();
    const dashedGeometry = new THREE.BufferGeometry();
    const solidMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55, toneMapped: false });
    const dashedMaterial = new THREE.LineDashedMaterial({
      dashSize: 0.22,
      gapSize: 0.16,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const solidLines = new THREE.LineSegments(solidGeometry, solidMaterial);
    const dashedLines = new THREE.LineSegments(dashedGeometry, dashedMaterial);
    solidLines.frustumCulled = false;
    dashedLines.frustumCulled = false;
    scene.add(solidLines, dashedLines);

    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(MAX_PARTICLES * 3);
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.09,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.frustumCulled = false;
    particles.visible = features.particles;
    scene.add(particles);

    /** Đầu mút của các edge khoẻ, để hạt chạy dọc. Ghi lại khi topology đổi. */
    let flowEdges: { ax: number; ay: number; az: number; bx: number; by: number; bz: number }[] = [];
    const particleT = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      particleT[i] = i / MAX_PARTICLES;
    }

    // ── Hậu kỳ ──────────────────────────────────────────────────────────────
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (features.bloom) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // Ngưỡng CAO (§9.4): chỉ phần phát sáng vượt qua. Bloom tràn lan là cách
      // nhanh nhất biến "có không khí" thành "mờ nhoè".
      bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.35, 0.85);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    // ── Nhãn DOM (§9.2) ─────────────────────────────────────────────────────
    const labelPool: HTMLSpanElement[] = [];
    for (let i = 0; i < MAX_LABELS; i += 1) {
      const span = document.createElement('span');
      span.className =
        'pointer-events-none absolute left-0 top-0 rounded bg-card/80 px-1 py-px font-mono text-[10px] text-foreground';
      span.style.display = 'none';
      span.style.willChange = 'transform';
      labelLayer.appendChild(span);
      labelPool.push(span);
    }

    // ── Trạng thái mô phỏng ↔ cảnh ──────────────────────────────────────────
    const entries = new Map<string, Entry>();
    let nodeEntries: NodeEntry[] = [];
    let topologyDirty = true;
    let needsRender = true;
    let pointerInside = false;
    let width = 1;
    let height = 1;

    const tierController = createTierController(tier);

    function syncFromView(): void {
      const view = getViewRef.current();
      const layout = computeLayout(view);
      const byUid = new Map(view.objects.map((o) => [o.uid, o]));

      nodeEntries = layout.nodes.map((n) => ({
        name: n.name,
        x: n.position.x,
        ready: n.ready,
        load: Math.max(n.cpuUsed, n.memoryUsed),
      }));

      const seen = new Set<string>();
      for (const placement of layout.objects) {
        const object = byUid.get(placement.uid);
        if (object === undefined) {
          continue;
        }
        seen.add(placement.uid);
        let entry = entries.get(placement.uid);
        if (entry === undefined) {
          entry = {
            uid: placement.uid,
            x: placement.position.x,
            y: placement.position.y,
            z: placement.position.z,
            size: placement.size,
            phase: phaseFromId(placement.uid),
            token: object.statusToken,
            terminating: false,
            failing: false,
            label: `${object.kind.toLowerCase()}/${object.name}`,
            appear: 0,
            dying: 0,
            doomed: false,
          };
          entries.set(placement.uid, entry);
        }
        entry.x = placement.position.x;
        entry.y = placement.position.y;
        entry.z = placement.position.z;
        entry.size = placement.size;
        entry.token = object.statusToken;
        /*
         * `phase` và `reason` là HAI TRỤC (hợp đồng `contract.ts`), và cảnh 3D
         * phải tôn trọng điều đó: `Terminating` là một PHASE (chìm xuống, mờ
         * đi), còn `CrashLoopBackOff` là một REASON (nhấp nháy theo nhịp thở).
         * Một pod có thể đang `Running` mà vẫn lỗi — gộp hai trục lại ở đây sẽ
         * vẽ ra một mô hình Kubernetes sai, đúng thứ hợp đồng cảnh báo.
         */
        entry.terminating = object.phase === 'Terminating';
        entry.failing = object.statusToken === 'destructive' || object.statusToken === 'warning';
        entry.label = `${object.kind.toLowerCase()}/${object.name}`;
        entry.doomed = false;
        entry.dying = 0;
      }

      for (const entry of entries.values()) {
        if (!seen.has(entry.uid)) {
          entry.doomed = true;
        }
      }

      // Edge: dựng buffer MỘT LẦN mỗi lần topology đổi, không phải mỗi frame.
      const positionOf = new Map(layout.objects.map((o) => [o.uid, o.position]));
      const solid: number[] = [];
      const dashed: number[] = [];
      flowEdges = [];
      for (const edge of layout.edges) {
        const a = positionOf.get(edge.fromUid);
        const b = positionOf.get(edge.toUid);
        if (a === undefined || b === undefined) {
          continue;
        }
        const target = edge.healthy ? solid : dashed;
        target.push(a.x, a.y, a.z, b.x, b.y, b.z);
        if (edge.healthy) {
          flowEdges.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z });
        }
      }
      solidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(solid, 3));
      dashedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dashed, 3));
      dashedLines.computeLineDistances();
      solidGeometry.computeBoundingSphere();
      dashedGeometry.computeBoundingSphere();

      // Camera lùi ra vừa đủ ôm trọn cụm, rồi để giảm chấn đưa tới (§9.3).
      const distance = Math.max(11, layout.radius * 1.75);
      cameraGoal.set(0, distance * 0.55, distance);

      topologyDirty = true;
      needsRender = true;
    }

    function ensureCapacity(needed: number): void {
      if (needed <= capacity) {
        return;
      }
      while (capacity < needed) {
        capacity *= 2;
      }
      scene.remove(objectMesh, glowMesh);
      objectMesh.dispose();
      glowMesh.dispose();
      // Geometry và material được DÙNG LẠI, không dựng mới — nhờ vậy
      // `renderer.info.memory.geometries` đứng yên qua mọi chu kỳ sinh/xoá, đúng
      // ô đo thứ hai và thứ ba của §11.3.
      objectMesh = createInstanced(objectGeometry, objectMaterial, capacity, features.shadows);
      glowMesh = createInstanced(objectGeometry, glowMaterial, capacity, false);
      scene.add(objectMesh, glowMesh);
    }

    function bodyColor(entry: Entry, selected: boolean): THREE.Color {
      TMP_COLOR.copy(tokenColors[entry.token]);
      // Pha về phía màu mặt thẻ: một khối tô nguyên màu trạng thái đọc ra là một
      // ô màu, không phải một vật có chất liệu. Vật đang chọn giữ màu đậm hơn.
      return TMP_COLOR.lerp(tokenColors.card, selected ? 0.1 : 0.4);
    }

    function writeInstances(elapsed: number, dt: number, bobActive: boolean): void {
      ensureCapacity(entries.size);
      const selected = selectedRef.current;
      let index = 0;
      let animating = false;

      for (const entry of entries.values()) {
        const spawnStep = dt / transitionDuration(SPAWN_DURATION_S, reducedMotion);
        const deathStep = dt / transitionDuration(DEATH_DURATION_S, reducedMotion);

        if (entry.doomed) {
          entry.dying = clamp01(entry.dying + deathStep);
        } else if (entry.appear < 1) {
          entry.appear = clamp01(entry.appear + spawnStep);
        }
        if (entry.appear < 1 || (entry.doomed && entry.dying < 1)) {
          animating = true;
        }

        const die = entry.doomed ? easeInQuad(entry.dying) : 0;
        const grow = easeOutBack(entry.appear);
        const scale = entry.size * Math.max(0, grow) * (1 - die);
        if (scale <= 0.0005) {
          continue;
        }

        const bob = bobActive ? bobOffset(elapsed, entry.phase) : 0;
        // `Terminating` chìm xuống và co lại — nói bằng CHUYỂN ĐỘNG chứ không
        // bằng màu, đúng §9.2. Dùng độ trong suốt sẽ đẹp hơn nhưng kéo theo bài
        // toán sắp thứ tự vẽ cho vật trong suốt trên `InstancedMesh`, và một
        // cảnh sắp sai thứ tự trông tệ hơn hẳn một cảnh không có alpha.
        const sink = entry.terminating ? -0.22 : 0;
        TMP_POS.set(entry.x, entry.y + bob + sink - die * 0.45, entry.z);
        TMP_SCALE.setScalar(scale * (entry.terminating ? 0.82 : 1));
        TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
        objectMesh.setMatrixAt(index, TMP_MATRIX);
        objectMesh.setColorAt(index, bodyColor(entry, entry.uid === selected));

        // Hào quang: khoẻ thì sáng đều, lỗi thì thở, đang tắt thì lịm dần.
        let intensity = 0.28;
        if (entry.failing) {
          intensity = bobActive ? 0.22 + pulse01(elapsed, entry.phase) * 0.75 : 0.7;
          if (bobActive) {
            animating = true;
          }
        }
        if (entry.token === 'status-locked') {
          intensity = 0.08;
        }
        if (entry.terminating || entry.doomed) {
          intensity *= 1 - die;
        }
        if (entry.uid === selected) {
          intensity = Math.max(intensity, 0.85);
        }
        TMP_SCALE.setScalar(scale * 1.28);
        TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
        glowMesh.setMatrixAt(index, TMP_MATRIX);
        TMP_COLOR.copy(entry.uid === selected ? tokenColors.primary : tokenColors[entry.token]).multiplyScalar(intensity);
        glowMesh.setColorAt(index, TMP_COLOR);

        index += 1;
      }

      objectMesh.count = index;
      glowMesh.count = index;
      objectMesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
      if (objectMesh.instanceColor !== null) {
        objectMesh.instanceColor.needsUpdate = true;
      }
      if (glowMesh.instanceColor !== null) {
        glowMesh.instanceColor.needsUpdate = true;
      }

      // Dọn vật đã biến mất hẳn. Làm SAU vòng lặp: xoá khỏi Map trong lúc đang
      // duyệt nó là hành vi không xác định ở nhiều engine JS.
      for (const [uid, entry] of entries) {
        if (entry.doomed && entry.dying >= 1) {
          entries.delete(uid);
        }
      }

      for (let i = 0; i < nodeEntries.length; i += 1) {
        const node = nodeEntries[i];
        if (node === undefined) {
          continue;
        }
        TMP_POS.set(node.x, 0, 0);
        TMP_SCALE.setScalar(1);
        TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
        platformMesh.setMatrixAt(i, TMP_MATRIX);
        TMP_COLOR.copy(tokenColors.card);
        if (!node.ready) {
          // NotReady: TỤT ĐỘ BÃO HOÀ và tối đi, KHÔNG đổi sang màu khác (§9.2).
          // Mất sức sống đọc ra đúng nghĩa "node chết" hơn là một màu cảnh báo,
          // và nó chừa màu đỏ lại cho pod đang thật sự lỗi.
          TMP_COLOR.getHSL(TMP_HSL);
          TMP_COLOR.setHSL(TMP_HSL.h, TMP_HSL.s * 0.15, TMP_HSL.l * 0.55);
        }
        platformMesh.setColorAt(i, TMP_COLOR);
      }
      platformMesh.count = nodeEntries.length;
      platformMesh.instanceMatrix.needsUpdate = true;
      if (platformMesh.instanceColor !== null) {
        platformMesh.instanceColor.needsUpdate = true;
      }

      solidMaterial.color.copy(tokenColors['muted-foreground']);
      dashedMaterial.color.copy(tokenColors.destructive);
      particleMaterial.color.copy(tokenColors['status-progress']);

      if (animating) {
        needsRender = true;
      }
    }

    function writeParticles(elapsed: number, dt: number): void {
      if (!features.particles || flowEdges.length === 0) {
        particles.visible = false;
        return;
      }
      particles.visible = true;
      const count = Math.min(MAX_PARTICLES, flowEdges.length * PARTICLES_PER_EDGE);
      for (let i = 0; i < count; i += 1) {
        const edge = flowEdges[i % flowEdges.length];
        if (edge === undefined) {
          continue;
        }
        let t = (particleT[i] ?? 0) + dt * PARTICLE_SPEED;
        if (t > 1) {
          t -= 1;
        }
        particleT[i] = t;
        const base = i * 3;
        particlePositions[base] = edge.ax + (edge.bx - edge.ax) * t;
        // Vồng nhẹ lên giữa đường: một hạt đi thẳng trên một đường thẳng thì
        // không phân biệt được với chính đường đó.
        particlePositions[base + 1] = edge.ay + (edge.by - edge.ay) * t + Math.sin(t * Math.PI) * 0.22;
        particlePositions[base + 2] = edge.az + (edge.bz - edge.az) * t;
      }
      particleGeometry.setDrawRange(0, count);
      particleGeometry.attributes['position']!.needsUpdate = true;
      needsRender = true;
      void elapsed;
    }

    function writeLabels(): void {
      let shown = 0;
      for (const entry of entries.values()) {
        if (shown >= MAX_LABELS || entry.doomed) {
          continue;
        }
        const span = labelPool[shown];
        if (span === undefined) {
          break;
        }
        TMP_PROJECT.set(entry.x, entry.y + entry.size * 0.9, entry.z).project(camera);
        if (TMP_PROJECT.z > 1) {
          span.style.display = 'none';
          continue;
        }
        // ⚠ CHỈ GHI. `width`/`height` lấy từ callback của `ResizeObserver`, nên
        // vòng lặp không bao giờ gọi `getBoundingClientRect` (§11.1 mục 6).
        const x = (TMP_PROJECT.x * 0.5 + 0.5) * width;
        const y = (-TMP_PROJECT.y * 0.5 + 0.5) * height;
        if (span.textContent !== entry.label) {
          span.textContent = entry.label;
        }
        span.style.display = 'block';
        span.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        shown += 1;
      }
      for (let i = shown; i < labelPool.length; i += 1) {
        const span = labelPool[i];
        if (span !== undefined && span.style.display !== 'none') {
          span.style.display = 'none';
        }
      }
    }

    // ── Vòng lặp ────────────────────────────────────────────────────────────
    let last = 0;
    let elapsed = 0;

    function frame(timeMs: number): void {
      const dt = last === 0 ? 1 / 60 : Math.min((timeMs - last) / 1000, 0.1);
      const frameMs = last === 0 ? 16 : timeMs - last;
      last = timeMs;
      elapsed += dt;

      /*
       * §11.2 — bồng bềnh CHỈ khi tab đang hiện VÀ con trỏ ở trong khung, và
       * không bao giờ ở bậc thấp. Đây là chỗ giải mâu thuẫn giữa §9.3 (cảnh phải
       * sống) và §11.2 (cảnh tĩnh không được vẽ): ambience có giá của nó, và giá
       * đó chỉ đáng trả khi người dùng đang thật sự nhìn vào khung.
       */
      const bobActive = pointerInside && document.visibilityState === 'visible' && tier !== 'low' && !reducedMotion;

      // Camera giảm chấn (§9.3) — không cắt cảnh đột ngột.
      const damp = 1 - Math.exp(-dt * 3.2);
      if (camera.position.distanceToSquared(cameraGoal) > 1e-5) {
        camera.position.lerp(cameraGoal, damp);
        camera.lookAt(cameraTarget);
        needsRender = true;
      }

      writeInstances(elapsed, dt, bobActive);
      if (bobActive) {
        writeParticles(elapsed, dt);
      }

      if (!needsRender) {
        return;
      }
      needsRender = false;

      if (topologyDirty && features.shadows) {
        renderer.shadowMap.needsUpdate = true;
        topologyDirty = false;
      }

      if (composer !== null) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
      writeLabels();

      const nextTier = tierController.observe(frameMs);
      if (nextTier !== null && quality === 'auto') {
        tier = nextTier;
        features = TIER_FEATURES[tier];
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, features.maxPixelRatio));
        renderer.shadowMap.enabled = features.shadows;
        particles.visible = features.particles;
        onTierChangeRef.current?.(tier);
      }
    }

    // ── Kích thước ──────────────────────────────────────────────────────────
    const observer = new ResizeObserver((entriesList) => {
      const rect = entriesList[0]?.contentRect;
      if (rect === undefined || rect.width === 0 || rect.height === 0) {
        return;
      }
      // Đây là chỗ DUY NHẤT hình học của khung được đọc, và nó nằm trong callback
      // của ResizeObserver — nơi trình duyệt đã tính layout xong.
      width = rect.width;
      height = rect.height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      composer?.setSize(width, height);
      bloomPass?.setSize(width, height);
      needsRender = true;
    });
    observer.observe(host);

    const onPointerEnter = (): void => {
      pointerInside = true;
    };
    const onPointerLeave = (): void => {
      pointerInside = false;
    };
    const onVisibility = (): void => {
      needsRender = true;
    };
    host.addEventListener('pointerenter', onPointerEnter);
    host.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    /*
     * Theme đổi ⇒ đọc lại token. Nghe MutationObserver trên `<html>` chứ không
     * dùng `useTheme()`: lớp `.dark` cũng bị đổi bởi script khởi tạo sớm và bởi
     * đường "theo hệ thống", hai đường mà context React không đi qua. Nghe đúng
     * thứ thật sự thay đổi thì không bỏ lỡ đường nào.
     */
    const themeObserver = new MutationObserver(() => {
      applyColors();
      needsRender = true;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    applyColors();
    syncFromView();
    const unsubscribe = subscribeRef.current(syncFromView);
    renderer.setAnimationLoop(frame);

    globalThis.__dlpK8sScene = (): SceneStats => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      frames: renderer.info.render.frame,
      tier,
      objects: objectMesh.count,
    });

    return () => {
      renderer.setAnimationLoop(null);
      unsubscribe();
      observer.disconnect();
      themeObserver.disconnect();
      host.removeEventListener('pointerenter', onPointerEnter);
      host.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      // Gán `undefined` chứ không `delete`: một `var` khai ở global scope không
      // phải thuộc tính tuỳ chọn, nên `delete` là lỗi kiểu (TS2790) — và gán
      // `undefined` cũng đúng hơn về ý: cửa sổ đọc số liệu ngừng hoạt động, chứ
      // không phải chưa từng tồn tại.
      globalThis.__dlpK8sScene = undefined;

      for (const span of labelPool) {
        span.remove();
      }
      probe.remove();
      objectMesh.dispose();
      glowMesh.dispose();
      platformMesh.dispose();
      objectGeometry.dispose();
      platformGeometry.dispose();
      groundGeometry.dispose();
      solidGeometry.dispose();
      dashedGeometry.dispose();
      particleGeometry.dispose();
      objectMaterial.dispose();
      platformMaterial.dispose();
      glowMaterial.dispose();
      groundMaterial.dispose();
      solidMaterial.dispose();
      dashedMaterial.dispose();
      particleMaterial.dispose();
      envTexture?.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // `quality` trong deps: đổi bậc bằng tay dựng lại renderer với cấu hình khác.
    // Đây là thao tác hiếm (người dùng bấm), nên dựng lại đơn giản và chắc chắn
    // hơn là vá từng thuộc tính — và vá từng thuộc tính là chỗ dễ để sót một cái.
  }, [quality]);

  return (
    <div ref={hostRef} aria-hidden="true" className="relative h-full w-full overflow-hidden">
      {/*
        Lớp nhãn cũng `aria-hidden`: nó LẶP LẠI nội dung của bảng "Tài nguyên".
        Để nó lộ ra thì trình đọc màn hình đọc mọi tài nguyên hai lần — một lần ở
        đây không có thứ tự nào, một lần ở danh sách. §9.2 đặt nhãn vào DOM để
        chữ SẮC NÉT và theo đúng font hệ thiết kế, không phải để nó thành lớp a11y;
        lớp a11y là các panel bên phải.
      */}
      <div ref={labelLayerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
