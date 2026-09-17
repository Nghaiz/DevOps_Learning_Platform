/**
 * Nhật ký hành động DÙNG CHUNG cho mọi game của trụ cột ③.
 *
 * ⛔ File này do lead sở hữu — cùng hạng với `core/types.ts`. Một game mới thêm
 * variant của mình vào `GameAction` thì BÁO LEAD, vì mọi game khác đọc union này.
 *
 * VÌ SAO NÓ CHUYỂN LÊN ĐÂY (17.A.2)
 * ---------------------------------
 * `RunLog` và `GameAction` nằm trong `k8s/contract.ts` cho tới 2026-09-14, và
 * `GameAction.kind` là union ĐÓNG của K8s (`'apply' | 'delete' | 'scale' |
 * 'edit' | 'kubectl' | 'hint' | 'wait'`). Hệ quả đã được `docs/games/pipeline.md`
 * §2.2 ghi lại và không ai sửa: **cơ chế chống gian lận bằng phát lại tất định
 * chỉ dùng được cho đúng một game.** Game thứ hai không chạm được vào
 * `core/verify.ts`, `core/integrity.ts`, hay `apps/web/src/server/problems/replay.ts`
 * — ba thứ vốn đã là hạ tầng chung, chỉ bị một kiểu K8s ghim xuống.
 *
 * PHÂN BIỆT BẰNG `gameId`, KHÔNG BẰNG `kind`
 * ------------------------------------------
 * Hôm nay `kind` của K8s và của Git không trùng chữ nào, nên phân biệt bằng
 * `kind` sẽ *chạy được*. Đó chính là cái bẫy: ngày nào game thứ ba có một
 * `kind: 'apply'` (một game Terraform/GitOps là chuyện rất dễ xảy ra ở nền tảng
 * này) thì hai variant khác game bỗng khớp nhau, `replay.ts` đọc `action.index`
 * của một action không có `index`, và TypeScript không đỏ ở đâu cả vì union vẫn
 * hợp lệ. `gameId` là khoá phân biệt duy nhất KHÔNG BAO GIỜ đụng nhau.
 *
 * Phần còn lại của mỗi variant CHÍNH LÀ payload của game đó. Không bọc thêm một
 * lớp `payload: {...}`: lớp đó không mang thêm thông tin nào (`gameId` đã phân
 * biệt xong), nhưng bắt mọi chỗ đọc phải viết `action.payload.command`, và với
 * 79 chỗ dựng action đang có thì đó là 79 cơ hội sai vì một lý do trang trí.
 *
 * VÌ SAO `core/` KHÔNG `import` TỪ `k8s/`
 * --------------------------------------
 * Union phải đóng lại ở một chỗ biết mọi game, và chỗ đó là đây. Nhưng
 * `k8s/contract.ts` cần `RunLog` (cho `K8sSession.getLog()`), nên một `import`
 * ngược từ đây xuống `k8s/` là một VÒNG — chạy được (type-only bị xoá lúc biên
 * dịch) nhưng xoá mất chính thứ việc chuyển file lên đây để đạt: `core/` phải
 * đứng độc lập thì game thứ ba mới cắm vào được mà không kéo theo cả K8s.
 *
 * Cách gỡ: `K8sActionShape<Ref>` khai ở đây dưới dạng **generic trên kiểu tham
 * chiếu tài nguyên**, và `k8s/contract.ts` đóng generic đó lại bằng `ResourceRef`
 * thật (`K8sGameAction = K8sActionShape<ResourceRef>`). `core/` biết action K8s
 * có một `target` ba trường; nó KHÔNG biết `ResourceKind` là gì, và không cần
 * biết — nó chỉ đọc `tick` và `kind`.
 *
 * Ràng buộc kiến trúc kế thừa từ `core/types.ts`: KHÔNG `import` `node:*`,
 * không DOM API, không React.
 */

import type { GameId } from './types.ts';

// ── Phần chung của mọi action, mọi game ─────────────────────────────────────

/**
 * Ba trường mà MỌI action của MỌI game phải có.
 *
 * `tick` là **đồng hồ logic**, không phải đồng hồ treo tường. Ở K8s nó là số
 * tick mô phỏng; ở Git nó là số lệnh đã chạy. Điểm chung — và là lý do nó nằm ở
 * đây — là cả hai TẤT ĐỊNH: phát lại cùng chuỗi action cho ra cùng dãy `tick`.
 * Một `Date.now()` lọt vào đây là hỏng thẳng khả năng chấm lại phía máy chủ
 * (xem `core/verify.ts`).
 */
export interface GameActionBase {
  readonly gameId: GameId;
  readonly tick: number;
  readonly kind: string;
}

// ── Action của game K8s ─────────────────────────────────────────────────────

/**
 * Hình dạng tối thiểu của một tham chiếu tài nguyên, đủ cho `core/` mà không
 * cần biết `ResourceKind`.
 *
 * `k8s/contract.ts` thu hẹp `kind` xuống union thật khi nó đóng generic —
 * `ResourceKind extends string` nên phép thu hẹp đó hợp lệ, và `K8sGameAction`
 * gán được vào `GameAction` theo chiều cần thiết.
 */
export interface ResourceRefLike {
  readonly kind: string;
  readonly namespace: string;
  readonly name: string;
}

/**
 * Hình dạng giữ NGUYÊN từ `k8s/contract.ts`, chỉ thêm `gameId: 'k8s'`.
 *
 * Tham số `Ref` để `k8s/` đóng lại bằng `ResourceRef` chính xác; `core/` dùng
 * `ResourceRefLike`. Xem khối "VÌ SAO `core/` KHÔNG `import` TỪ `k8s/`" ở đầu file.
 */
export type K8sActionShape<Ref extends ResourceRefLike = ResourceRefLike> =
  /** Người chơi gõ vào thanh lệnh. Chuỗi thô, `kubectl.ts` tự phân tích. */
  | { readonly gameId: 'k8s'; readonly tick: number; readonly kind: 'kubectl'; readonly command: string }
  /** Áp một manifest. Tài nguyên đích nằm trong chính YAML, nên không có `target`. */
  | { readonly gameId: 'k8s'; readonly tick: number; readonly kind: 'apply'; readonly yaml: string }
  | {
      readonly gameId: 'k8s';
      readonly tick: number;
      readonly kind: 'edit';
      readonly target: Ref;
      readonly yaml: string;
    }
  | { readonly gameId: 'k8s'; readonly tick: number; readonly kind: 'delete'; readonly target: Ref }
  | {
      readonly gameId: 'k8s';
      readonly tick: number;
      readonly kind: 'scale';
      readonly target: Ref;
      readonly replicas: number;
    }
  /**
   * Mở gợi ý thứ `index` (đếm từ 0). Không mang `levelId`: một `RunLog` thuộc
   * đúng một level và đã ghi `levelId` ở cấp trên — nhắc lại là một trường suy ra
   * được, đúng thứ quy ước của repo cấm.
   */
  | { readonly gameId: 'k8s'; readonly tick: number; readonly kind: 'hint'; readonly index: number }
  /** Để mô phỏng chạy tiếp mà không làm gì. Đây là cách người chơi "chờ xem". */
  | { readonly gameId: 'k8s'; readonly tick: number; readonly kind: 'wait'; readonly ticks: number };

// ── Action của game Git ─────────────────────────────────────────────────────

/**
 * Game Git chỉ có HAI loại action, và sự nghèo nàn đó là chủ ý.
 *
 * Toàn bộ tương tác của người chơi là **gõ một dòng lệnh** (quyết định #7 của
 * design doc: "gõ lệnh thật là chính, 3D là màn hình quan sát"). Không có
 * palette kéo-thả, không có nút "scale", không có `wait` — thời gian ở game Git
 * chỉ nhích khi có lệnh chạy, nên "chờ xem" không phải một hành động.
 *
 * Hệ quả tốt cho việc chấm lại: một `RunLog` của game Git là một **script shell
 * đọc được bằng mắt**. Mở ra xem là biết người chơi đã làm gì, không cần công cụ.
 */
export type GitGameAction =
  /** Một dòng lệnh thô, đúng như người chơi gõ. `git/parser.ts` tự phân tích. */
  | { readonly gameId: 'git'; readonly tick: number; readonly kind: 'command'; readonly command: string }
  /** Mở gợi ý thứ `index` (đếm từ 0). Cùng quy ước không-mang-`levelId` như K8s. */
  | { readonly gameId: 'git'; readonly tick: number; readonly kind: 'hint'; readonly index: number };

/**
 * Bảng núm của người chơi, ở độ chính xác `core/` cần — cùng vai `ResourceRefLike`.
 *
 * `cicd/hydrate.ts` đóng generic lại bằng `CicdPlayerOverrides` thật, nơi giá trị
 * cache là một `CicdCacheChoice` có cấu trúc. `core/` chỉ cần biết đây là hai bảng
 * tra theo id, và cố tình KHÔNG biết một "lựa chọn cache" gồm những gì.
 *
 * ⚠ Bound phải là một hình dạng CÓ TÊN, không thể là `Readonly<Record<string, unknown>>`:
 * `CicdPlayerOverrides` là một `interface`, và interface trong TypeScript KHÔNG có
 * index signature ngầm — một bound dạng `Record` sẽ không nhận nó, và lỗi hiện ra
 * ở tận chỗ đóng generic chứ không ở đây.
 */
export interface CicdOverridesLike {
  readonly retries?: Readonly<Record<string, number>>;
  readonly cache?: Readonly<Record<string, unknown>>;
}

/**
 * Chính sách CD, ở độ chính xác `core/` cần. Ba khối vì có ba bộ mô phỏng
 * (`cicd/cd-contract.ts` §4); `core/` không biết một chính sách phát hành gồm gì.
 *
 * Thêm một bộ mô phỏng thứ tư KHÔNG bắt phải sửa chỗ này: một trường thừa vẫn
 * thoả quan hệ `extends`, nên `CicdCdPolicies` mở rộng được mà bound vẫn đúng.
 */
export interface CicdCdPoliciesLike {
  readonly release?: unknown;
  readonly gitops?: unknown;
  readonly masking?: unknown;
}

/**
 * Game CI/CD cũng chỉ có HAI loại action, vì lý do khác hẳn game Git.
 *
 * Người chơi không điều khiển từng tick. Họ **soạn một `WorkflowSpec`** rồi bấm
 * chạy, và engine chạy trọn `EvaluationSpec.passes` lượt có seed. Nên một hành
 * động là "nộp bản workflow này để chấm", không phải một thao tác trong cảnh.
 *
 * `source` là văn bản YAML thô người chơi gõ, KHÔNG phải `WorkflowSpec` đã phân
 * tích. Hai lý do: bản thô là thứ duy nhất tái lập được nguyên vẹn (một
 * `WorkflowSpec` đã chuẩn hoá làm mất chú thích và thứ tự khoá, nên phát lại sẽ
 * không ra đúng thứ người chơi thấy), và nó giữ `core/` khỏi phải biết hình
 * dạng `WorkflowSpec` — thứ chỉ `cicd/contract.ts` mới được biết.
 *
 * ── ⚠ BA MẢNH, KHÔNG PHẢI MỘT (19.J.1.1) ──
 *
 * YAML một mình KHÔNG đủ để tái lập một lượt chấm, và đó là một lỗi đã đo chứ
 * không phải một chỗ thiếu trên lý thuyết. Bảng núm retries/cache và bảng chính
 * sách CD đều đổi kết quả mô phỏng, mà cả hai đều KHÔNG đi qua văn bản YAML —
 * `hydrate.ts` và `cd-run.ts` nhận chúng như hai đường vào riêng. Một `evaluate`
 * chỉ chở `source` vì thế là một bản ghi phát lại ra **một lượt chơi khác** với
 * lượt người ta thật sự chơi.
 *
 * ⛔ Cả ba trường BẮT BUỘC, không trường nào tuỳ chọn. Một `overrides?` sẽ không
 * phân biệt được "người chơi không xoay núm nào" với "client quên gửi", và hai
 * thứ đó chấm ra hai kết quả khác nhau. `cd` mang `null` TƯỜNG MINH khi bài
 * không có kịch bản CD — một giá trị nói ra, không phải một khoá vắng mặt.
 */
export type CicdActionShape<
  Overrides extends CicdOverridesLike = CicdOverridesLike,
  Cd extends CicdCdPoliciesLike = CicdCdPoliciesLike,
> =
  /** Nộp một bản YAML để chấm. Engine tự chạy đủ số lượt theo `EvaluationSpec`. */
  | {
      readonly gameId: 'cicd';
      readonly tick: number;
      readonly kind: 'evaluate';
      readonly source: string;
      /** Bảng núm retries + cache đang đặt lúc bấm chạy. `{}` = chưa xoay núm nào. */
      readonly overrides: Overrides;
      /** Chính sách CD đang đặt. `null` = bài không có khối `cd` nào. */
      readonly cd: Cd | null;
    }
  /** Mở gợi ý thứ `index` (đếm từ 0). Cùng quy ước không-mang-`levelId` như hai game kia. */
  | { readonly gameId: 'cicd'; readonly tick: number; readonly kind: 'hint'; readonly index: number };

// ── Union mở ────────────────────────────────────────────────────────────────

/**
 * Mọi action của mọi game, ở độ chính xác mà `core/` cần.
 *
 * Thêm game là thêm một nhánh, và mọi `switch (action.gameId)` chưa xử nhánh mới
 * sẽ ĐỎ ở phép kiểm vét cạn — đó là cổng gác mà bản cũ (`kind` đóng của K8s)
 * không có.
 *
 * ⚠ Nhánh `cicd` khai NGAY TẠI ĐÂY chứ không `import` từ `cicd/contract.ts`,
 * đúng lối hai game trước. `core/` không được biết `WorkflowSpec` hay
 * `ClusterSpec`; nó chỉ cần biết hình dạng của một dòng nhật ký. Một `import`
 * ngược từ `core/` xuống thư mục game sẽ phá đúng ranh giới mà
 * `problem-plugins.ts` đang gác bằng cách sống ở gốc `src/` thay vì trong
 * `core/`.
 *
 * ⛔ 19.J: nhánh `cicd` dùng dạng MỞ (`CicdActionShape` với tham số mặc định),
 * y như `K8sActionShape`. Bản đóng — `CicdGameAction` ở `cicd/action.ts` — gán
 * được vào đây vì mọi trường là `readonly` nên hiệp biến. Đừng nhập bản đóng
 * vào file này để "cho gọn": `cicd/contract.ts` nhập `RunLog` từ đây, nên đó là
 * đúng cái VÒNG mà khối chú thích đầu file mô tả.
 */
export type GameAction = K8sActionShape | GitGameAction | CicdActionShape;

/** Rút gọn cho chỗ chỉ cần phân loại. */
export type GameActionKind = GameAction['kind'];

// ── Nhật ký ─────────────────────────────────────────────────────────────────

/**
 * Một lượt chơi đầy đủ, đủ để phát lại từ số không.
 *
 * ⛔ Đây KHÔNG phải một tiện ích cho tính năng replay. Nó là cơ chế chống gian
 * lận duy nhất thật sự hoạt động trong trình duyệt: điểm số chỉ được công nhận
 * khi chạy lại `actions` qua reducer thuần từ cùng `seed` cho ra đúng kết quả đã
 * khai. Sửa tay `score` trong `localStorage` sẽ không phát lại được.
 *
 * Tham số `A` cho phép một game thu hẹp về đúng action của nó
 * (`K8sRunLog = RunLog<K8sGameAction>`) mà `core/verify.ts` vẫn làm việc được
 * trên dạng rộng: mảng `readonly` là hiệp biến, nên `RunLog<K8sGameAction>` gán
 * được vào `RunLog`.
 *
 * `gameId` THÊM MỚI ở 17.A và nó không phải trường suy ra được: `levelId` là
 * chuỗi tự do do từng game đặt, nên không có phép chiếu nào từ `levelId` về
 * `gameId` mà không phải một bảng tra cứng. Bên chấm cần biết nạp engine nào
 * TRƯỚC khi đọc được action đầu tiên.
 *
 * ⚠ Nhật ký này KHÔNG được lưu xuống Postgres — xem chú thích ở
 * `apps/web/src/server/db/schema.ts` § `problemSubmissions`. Nó sống đúng một
 * vòng đời: client dựng → gửi lên → máy chủ phát lại → vứt. Nên thêm một trường
 * ở đây không có bài toán di trú dữ liệu.
 */
export interface RunLog<A extends GameActionBase = GameAction> {
  readonly gameId: GameId;
  readonly levelId: string;
  /** Hạt giống PRNG. Có nó thì phát lại được đúng lượt chơi đó. */
  readonly seed: number;
  readonly actions: readonly A[];
}
