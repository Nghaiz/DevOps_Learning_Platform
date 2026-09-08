/**
 * Hợp đồng giữa lane B (logic: reducer, tick, incidents, predicates) và lane C
 * (nội dung: 30+ level, challenges, chaos).
 *
 * ⛔ Lead sở hữu file này. Hai lane kia code ĐỐI KHÁNG với nó và chạy song song:
 * lane B hiện thực các vị từ mà lane C gọi tên, lane C viết level dùng đúng các
 * kiểu ở đây. Sửa lén một field = một lane biên dịch xanh trong khi lane kia hiểu
 * khác — đúng cái mà `rules/contract-first-integration.md` sinh ra để chặn.
 *
 * Thấy hợp đồng thiếu thứ gì thì BÁO LEAD.
 */

import type { Difficulty } from '../core/types.ts';

// ── Tài nguyên ──────────────────────────────────────────────────────────────

/**
 * 26 loại tài nguyên. Danh sách này là ĐÓNG: game dạy Kubernetes thật nên không
 * được bịa ra loại không tồn tại, và cũng không cần loại thứ 27 để dạy thêm điều
 * gì. Thêm loại = báo lead + cập nhật `resources.ts` + level nào dùng nó.
 */
export type ResourceKind =
  | 'Pod'
  | 'ReplicaSet'
  | 'Deployment'
  | 'StatefulSet'
  | 'DaemonSet'
  | 'Job'
  | 'CronJob'
  | 'Service'
  | 'Ingress'
  | 'ConfigMap'
  | 'Secret'
  | 'PersistentVolume'
  | 'PersistentVolumeClaim'
  | 'StorageClass'
  | 'Namespace'
  | 'Node'
  | 'ServiceAccount'
  | 'Role'
  | 'RoleBinding'
  | 'ClusterRole'
  | 'ClusterRoleBinding'
  | 'NetworkPolicy'
  | 'HorizontalPodAutoscaler'
  | 'PodDisruptionBudget'
  | 'ResourceQuota'
  | 'LimitRange';

// ── Trạng thái pod ──────────────────────────────────────────────────────────

/**
 * ⚠ `phase` và `reason` là HAI TRỤC, cố ý không gộp.
 *
 * Repo đã trả giá đúng ở chỗ này một lần: một cổng chỉ đọc `phase` nên coi pod
 * đang `Terminating` là còn sống, và bỏ lọt đúng cửa sổ 30 giây grace. Một enum
 * gộp `'Running' | 'CrashLoopBackOff' | 'Terminating'` sẽ tái tạo lại y hệt lỗi
 * đó trong mô phỏng — và tệ hơn, sẽ DẠY người học một mô hình sai về Kubernetes,
 * nơi `CrashLoopBackOff` là `reason` của container chứ chưa bao giờ là một phase.
 */
export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Terminating';

/** Lý do container không chạy được. `undefined` = không có vấn đề gì. */
export type PodReason =
  | 'CrashLoopBackOff'
  | 'ImagePullBackOff'
  | 'ErrImagePull'
  | 'OOMKilled'
  | 'CreateContainerConfigError'
  | 'ContainerCreating'
  | 'Evicted'
  | 'Unschedulable'
  | 'NodeAffinityConflict'
  | 'ReadinessProbeFailed'
  | 'LivenessProbeFailed'
  | 'PVCPending'
  | 'Terminated';

// ── Mô tả trạng thái ban đầu của một level ──────────────────────────────────

/**
 * Trạng thái cụm lúc bắt đầu level, dạng KHAI BÁO và serialize được.
 *
 * Đây KHÔNG phải kiểu trạng thái lúc chạy (cái đó ở `model.ts`, lane B sở hữu).
 * Tách hai thứ ra vì level phải diff được trong git và phải so sánh được trong
 * test; trạng thái lúc chạy thì mang cả bộ đếm tick, hàng đợi sự kiện, RNG.
 */
export interface ClusterSpec {
  readonly nodes: readonly NodeSpec[];
  readonly namespaces: readonly string[];
  readonly resources: readonly ResourceSpec[];
}

export interface NodeSpec {
  readonly name: string;
  /** milli-core. 1 core = 1000. */
  readonly cpu: number;
  /** MiB. */
  readonly memory: number;
  readonly ready: boolean;
  readonly labels?: Readonly<Record<string, string>>;
  readonly taints?: readonly string[];
}

export interface ResourceSpec {
  readonly kind: ResourceKind;
  readonly name: string;
  readonly namespace: string;
  /**
   * Phần thân, hình dạng tuỳ `kind`. Cố ý lỏng: 26 loại × mọi field thật của K8s
   * là một cây kiểu khổng lồ mà 30 level chỉ chạm vào một góc. `resources.ts` giữ
   * bộ field mỗi loại THẬT SỰ đọc, và test khẳng định level không đặt field lạ —
   * kiểm bằng dữ liệu, không bằng kiểu.
   */
  readonly spec: Readonly<Record<string, unknown>>;
  /**
   * Sự cố gieo sẵn lúc bắt đầu. Đây là cách một level "hỏng sẵn" cho người chơi
   * chẩn đoán, thay vì bắt lane C mô tả tay từng trạng thái pod.
   */
  readonly seededIncident?: IncidentKind;
}

// ── Sự cố ───────────────────────────────────────────────────────────────────

/**
 * Danh mục sự cố. Mỗi mục là một cặp (triệu chứng người chơi thấy → nguyên nhân
 * thật) mà lane B hiện thực trong `incidents.ts`.
 *
 * Danh sách này là hợp đồng: chaos mode bốc ngẫu nhiên từ đây, level gieo sẵn từ
 * đây, và achievement "chẩn đoán đủ 10 loại sự cố" đếm trên đây.
 */
export type IncidentKind =
  | 'image-tag-sai'
  | 'image-registry-khong-toi-duoc'
  | 'thieu-imagepullsecret'
  | 'memory-limit-qua-thap'
  | 'lenh-entrypoint-sai'
  | 'thieu-configmap'
  | 'thieu-secret'
  | 'key-configmap-sai'
  | 'readiness-probe-sai-cong'
  | 'liveness-probe-qua-gat'
  | 'probe-khong-co-initialdelay'
  | 'service-selector-lech-label'
  | 'service-sai-targetport'
  | 'khong-co-endpoint'
  | 'dns-khong-phan-giai'
  | 'networkpolicy-chan-nham'
  | 'ingress-sai-path'
  | 'pvc-khong-co-pv-khop'
  | 'storageclass-khong-ton-tai'
  | 'pvc-readwriteonce-hai-node'
  | 'node-notready'
  | 'node-het-cpu'
  | 'node-het-memory'
  | 'taint-khong-co-toleration'
  | 'nodeselector-khong-khop'
  | 'resourcequota-chan'
  | 'limitrange-tu-choi'
  | 'rbac-thieu-quyen'
  | 'serviceaccount-khong-ton-tai'
  | 'pdb-chan-drain'
  | 'hpa-khong-co-metrics'
  | 'replica-vuot-quota';

// ── Mục tiêu ────────────────────────────────────────────────────────────────

/**
 * ⚠ `check` là TÊN vị từ (chuỗi), KHÔNG phải một closure.
 *
 * Lý do là ràng buộc cứng, không phải sở thích: level phải serialize được để lưu
 * replay và để test so sánh bằng `toEqual`. Một hàm trong dữ liệu level làm hỏng
 * cả hai, và làm level không diff được trong code review.
 *
 * Lane B giữ bảng tra `PREDICATES: Record<PredicateName, Predicate>` ở
 * `predicates.ts` và một test khẳng định MỌI `check` xuất hiện trong `levels/`
 * đều có mặt trong bảng — cả hai chiều, để một vị từ chết cũng bị phát hiện.
 */
export interface Objective {
  readonly id: string;
  /** Tiếng Việt, một câu, nói người chơi phải làm ĐƯỢC gì (không phải làm THẾ NÀO). */
  readonly label: string;
  readonly check: string;
  /** Tham số truyền cho vị từ, ví dụ `{ name: 'web', minReplicas: 3 }`. */
  readonly args?: Readonly<Record<string, unknown>>;
  /**
   * `true` = không đạt thì không qua level. `false` = mục tiêu thưởng, ăn điểm
   * nhưng không chặn. Mỗi level cần ÍT NHẤT một mục tiêu bắt buộc.
   */
  readonly required: boolean;
}

// ── Level ───────────────────────────────────────────────────────────────────

export interface Level {
  /** `k8s-01-pod-dau-tien` — số thứ tự hai chữ số, rồi slug tiếng Việt không dấu. */
  readonly id: string;
  /** 1..6. Xem `levels/index.ts` để biết chương nào dạy gì. */
  readonly chapter: number;
  readonly title: string;
  /** Markdown tiếng Việt, ≤ 400 từ. Nói bối cảnh + việc cần làm, KHÔNG nói cách làm. */
  readonly brief: string;
  readonly difficulty: Difficulty;
  readonly initialState: ClusterSpec;
  /** Người chơi chỉ tạo/sửa được các loại này ở level đó — cách kiểm soát nhịp dạy. */
  readonly allowedResources: readonly ResourceKind[];
  readonly objectives: readonly Objective[];
  /** Tiếng Việt, thứ tự = thứ tự mở. Gợi ý sau phải cụ thể hơn gợi ý trước. */
  readonly hints: readonly string[];
  /** Số nước đi "chuẩn". Dùng để chấm điểm, không phải để giới hạn. */
  readonly parMoves: number;
  /** Khái niệm K8s level này dạy — dùng để tra cứu chéo và cho trang stats. */
  readonly teaches: readonly string[];
}

/** Thử thách có đồng hồ. Khác level ở chỗ nó tính giờ và không có gợi ý. */
export interface Challenge {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly difficulty: Difficulty;
  readonly initialState: ClusterSpec;
  readonly objectives: readonly Objective[];
  /** Giây. Hết giờ là thua, không phải là "điểm thấp". */
  readonly timeLimitSec: number;
}

/** Một đợt sự cố trong chaos mode. */
export interface ChaosWave {
  readonly wave: number;
  readonly incidents: readonly IncidentKind[];
  /** Giây người chơi có để xử lý đợt này trước khi đợt sau chồng lên. */
  readonly graceSec: number;
}

// ── Ranh giới logic ↔ giao diện ─────────────────────────────────────────────

/**
 * Hình chiếu PHẲNG, sẵn-sàng-vẽ của trạng thái cụm.
 *
 * Đây là ranh giới giữa lane B (logic) và lane D/E (giao diện). Lý do có nó thay
 * vì cho renderer đọc thẳng trạng thái trong `model.ts`: trạng thái lúc chạy mang
 * hàng đợi sự kiện, bộ đếm tick, con trỏ RNG — renderer không cần và không được
 * biết. Có `ClusterView` thì lane B đổi cấu trúc bên trong tuỳ ý mà lane E không
 * phải sửa một dòng.
 */
export interface ClusterView {
  readonly tick: number;
  readonly nodes: readonly NodeView[];
  readonly objects: readonly ObjectView[];
  readonly edges: readonly EdgeView[];
  readonly events: readonly EventView[];
}

export interface NodeView {
  readonly name: string;
  readonly ready: boolean;
  /** 0..1 — phần đã dùng. Renderer hiển thị, KHÔNG tự tính lại. */
  readonly cpuUsed: number;
  readonly memoryUsed: number;
}

export interface ObjectView {
  readonly uid: string;
  readonly kind: ResourceKind;
  readonly name: string;
  readonly namespace: string;
  /** Chỉ có ở Pod. */
  readonly phase?: PodPhase;
  readonly reason?: PodReason;
  /**
   * Đã qua readiness probe. Trục RIÊNG, không suy ra được từ `phase`.
   *
   * Đây là chỗ giá trị sư phạm nằm: một pod `Running` mà `ready: false` vẫn đứng
   * ngoài Endpoints của Service, nên `kubectl get pods` trông hoàn toàn bình
   * thường trong khi traffic không tới nơi. Không đưa trục này ra tới renderer
   * thì người chơi không có cách nào NHÌN ra nguyên nhân, và bài học biến mất.
   *
   * `undefined` cho tài nguyên không phải Pod.
   */
  readonly ready?: boolean;
  /** Cột RESTARTS của `kubectl get`. Số lần restart nói lên chuyện `phase` giấu đi. */
  readonly restartCount?: number;
  /** Tên node đang chạy; `null` = chưa được xếp lịch. */
  readonly nodeName: string | null;
  /** uid của chủ sở hữu (ReplicaSet của Pod, Deployment của ReplicaSet…). */
  readonly ownerUid: string | null;
  /**
   * Token màu ngữ nghĩa, KHÔNG phải mã màu. Renderer tra sang `THREE.Color` bằng
   * `getComputedStyle`. Đây là thứ giữ SSOT màu ở `globals.css` và làm 3D tự đổi
   * theo theme sáng/tối (`phase-14-exec.md` §4.5).
   */
  readonly statusToken: 'success' | 'destructive' | 'warning' | 'status-progress' | 'status-locked';
  /** Tiếng Việt, một dòng, đọc được bằng trình đọc màn hình. */
  readonly ariaLabel: string;
}

/** Quan hệ vẽ được: selector của Service trỏ tới Pod, PVC gắn vào Pod, ... */
export interface EdgeView {
  readonly fromUid: string;
  readonly toUid: string;
  readonly kind: 'owns' | 'selects' | 'mounts' | 'routes';
  /** `false` = quan hệ ĐÁNG LẼ có nhưng đang đứt (selector lệch label) — vẽ nét đứt. */
  readonly healthy: boolean;
}

export interface EventView {
  readonly tick: number;
  readonly level: 'info' | 'warning' | 'error';
  /** Tiếng Việt. Đây cũng là nội dung đẩy vào vùng `aria-live`. */
  readonly message: string;
}

// ── Nhật ký hành động — nền tảng của xác minh chống gian lận ────────────────

/**
 * Mọi thứ người chơi làm đều là một `GameAction` được ghi lại theo thứ tự.
 *
 * ⛔ Đây KHÔNG phải một tiện ích cho tính năng replay. Nó là cơ chế chống gian lận
 * duy nhất thật sự hoạt động trong trình duyệt: điểm số chỉ được công nhận khi
 * chạy lại `actions` qua reducer thuần từ cùng `seed` cho ra đúng kết quả đã khai.
 * Sửa tay `score` trong `localStorage` sẽ không phát lại được.
 *
 * Hệ quả bắt buộc cho lane B: reducer phải TẤT ĐỊNH tuyệt đối. Không
 * `Math.random()`, không `Date.now()`, không `Map` lặp theo thứ tự chèn ở chỗ
 * kết quả phụ thuộc thứ tự. Mọi ngẫu nhiên đi qua `core/rng.ts` có hạt giống.
 */
/**
 * Định danh một tài nguyên. Đây là khoá TỰ NHIÊN của Kubernetes: bộ ba
 * (kind, namespace, name) là duy nhất theo đúng định nghĩa của K8s.
 *
 * ⚠ CỐ Ý không dùng `uid` ở đây, dù `ObjectView` có mang `uid`. Lý do là phát
 * lại: `RunLog` phải sống lâu hơn cách engine sinh uid. Bộ ba này ổn định qua
 * mọi lần refactor engine, và nó ĐỌC ĐƯỢC khi mở một `RunLog` đã lưu ra xem —
 * `uid` thì không. `uid` là chuyện nội bộ của renderer, dùng để tra scene graph.
 */
export interface ResourceRef {
  readonly kind: ResourceKind;
  readonly namespace: string;
  readonly name: string;
}

/**
 * Hình dạng `payload` theo từng `kind`. Union phân biệt, KHÔNG phải
 * `Record<string, unknown>`.
 *
 * Bản đầu của hợp đồng này để `payload` lỏng, và lane E đã đúng khi dừng lại
 * báo lead: hai lane sẽ mỗi bên tự nghĩ ra một hình dạng, CẢ HAI đều typecheck,
 * và chỗ lệch chỉ lộ lúc chạy. Đó đúng là hỏng hóc mà
 * `rules/contract-first-integration.md` sinh ra để chặn.
 */
export type GameAction =
  /** Người chơi gõ vào thanh lệnh. Chuỗi thô, `kubectl.ts` tự phân tích. */
  | { readonly tick: number; readonly kind: 'kubectl'; readonly command: string }
  /** Áp một manifest. Tài nguyên đích nằm trong chính YAML, nên không có `target`. */
  | { readonly tick: number; readonly kind: 'apply'; readonly yaml: string }
  | { readonly tick: number; readonly kind: 'edit'; readonly target: ResourceRef; readonly yaml: string }
  | { readonly tick: number; readonly kind: 'delete'; readonly target: ResourceRef }
  | { readonly tick: number; readonly kind: 'scale'; readonly target: ResourceRef; readonly replicas: number }
  /**
   * Mở gợi ý thứ `index` (đếm từ 0). Không mang `levelId`: một `RunLog` thuộc
   * đúng một level và đã ghi `levelId` ở cấp trên — nhắc lại là một field suy ra
   * được, đúng thứ quy ước của repo cấm.
   */
  | { readonly tick: number; readonly kind: 'hint'; readonly index: number }
  /** Để mô phỏng chạy tiếp mà không làm gì. Đây là cách người chơi "chờ xem". */
  | { readonly tick: number; readonly kind: 'wait'; readonly ticks: number };

/** Rút gọn cho chỗ chỉ cần phân loại. */
export type GameActionKind = GameAction['kind'];


/** Một lượt chơi đầy đủ, đủ để phát lại từ số không. */
export interface RunLog {
  readonly levelId: string;
  readonly seed: number;
  readonly actions: readonly GameAction[];
}

// ── Phiên chơi: ranh giới lane B (engine) ↔ lane D/E (giao diện) ────────────

export type SessionPhase = 'playing' | 'won' | 'lost';

export interface SessionStatus {
  readonly phase: SessionPhase;
  /** id các objective ĐANG đạt. Tính lại mỗi tick — objective có thể đạt rồi mất. */
  readonly objectivesMet: readonly string[];
  readonly hintsRevealed: number;
  readonly movesUsed: number;
}

/**
 * Một phiên chơi. Lane B hiện thực, lane E tiêu thụ. Lane E KHÔNG tự gọi reducer.
 *
 * ⚠ `getView()` phải trả về CÙNG MỘT THAM CHIẾU cho tới khi trạng thái thật sự
 * đổi. React `useSyncExternalStore` so sánh snapshot bằng `Object.is`; trả một
 * object mới mỗi lần gọi sẽ làm React render vô hạn. Đây là cái bẫy kinh điển
 * của API này, ghi ra đây để không ai phải gỡ nó lúc 2 giờ sáng.
 */
export interface K8sSession {
  getView(): ClusterView;
  getStatus(): SessionStatus;
  /** Trả về hàm huỷ đăng ký. */
  subscribe(listener: () => void): () => void;
  dispatch(action: GameAction): void;
  /** Nhật ký đầy đủ để phát lại — nền tảng của xác minh chống gian lận (§8.3). */
  getLog(): RunLog;
  /** Dừng vòng lặp thời gian. Lane E gọi lúc unmount. */
  dispose(): void;
}

export interface CreateSessionOptions {
  readonly level: Level;
  readonly seed: number;
  /** `false` = mô phỏng chỉ tiến khi có action (dùng cho test và cho phát lại). */
  readonly autoTick?: boolean;
}

export type CreateSession = (options: CreateSessionOptions) => K8sSession;
