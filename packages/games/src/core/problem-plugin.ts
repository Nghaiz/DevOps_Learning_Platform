/**
 * Hợp đồng plugin — §18.A.3. Chỗ một game cắm phần riêng của mình vào hệ OJ.
 *
 * ⛔ HAI RÀNG BUỘC CỨNG, cả hai đều đã có ô nghiệm thu đo tận nơi:
 *
 * 1. **Không JSX ở đây.** `authorFields` là **mô tả form dạng DỮ LIỆU**, không
 *    phải component. Plan A.3 nói thẳng lý do: JSX ở `core/` kéo React vào một
 *    package cấm React. Nhưng cái giá thật còn nặng hơn một dòng import —
 *    `packages/games` khai `sideEffects: false` và chạy TRONG bundle client; P17
 *    đã một lần rò engine sang 6 route không liên quan chỉ vì một barrel
 *    (`44f8e39`, 631KB ở hai chỗ). Tầng UI đọc mô tả này rồi tự dựng widget.
 *
 * 2. **Không `import node:*`.** `packages/games/tsconfig` bỏ `types: ["node"]`
 *    cố ý, để một lần lạc tay là đỏ ngay ở typecheck. Đọc khối `//exports` trong
 *    `packages/games/package.json` về lý do.
 *
 * ── Vì sao là plugin chứ không phải `switch (gameId)` ──
 *
 * Một `switch` sẽ nằm rải ở tầng UI, tầng chấm, tầng soạn bài, tầng seed — và
 * thêm game thứ ba nghĩa là tìm cho đủ mọi chỗ đã `switch`. Cái nào sót thì
 * không đỏ, chỉ im lặng rơi vào nhánh `default` của game khác. Một bảng đăng ký
 * thì thiếu một nhánh là **thiếu một khoá**, và đó là thứ kiểu dữ liệu bắt được.
 */

import type { GameAction } from './run-log.ts';
import type { GameId } from './types.ts';
import type { GradeResult, ProblemTopicOption, Testcase } from './problem.ts';

// ── Mô tả form soạn bài ─────────────────────────────────────────────────────

/**
 * Một trường trong form soạn `initialState`.
 *
 * ⚠ Đây KHÔNG phải một hệ form tổng quát, và đừng để nó lớn thành một hệ như
 * vậy. Phạm vi của nó đúng bằng phần **trạng thái ban đầu riêng của game** —
 * mọi trường chung của bài (tiêu đề, đề, độ khó, chủ đề, tag, gợi ý, testcase)
 * đã có form viết tay ở tầng UI và KHÔNG đi qua đây. Trang soạn bài K8s hiện có
 * (`apps/web/src/app/author/problems/`, 33 file) là bằng chứng rằng viết tay cho
 * phần chung là đúng chỗ; cái thiếu chỉ là phần đổi theo game.
 *
 * Nhánh `json` là van an toàn có chủ ý: một `WorldSpec` của git có cây commit
 * lồng nhau, và ép nó thành widget trực quan sẽ hỏng trước khi hữu ích. Level
 * Builder (§18.E) mới là câu trả lời cho phần đó — và plan §18.E đã ghi rõ giới
 * hạn của Builder, nên đừng lặng lẽ đẩy trách nhiệm đó sang đây.
 */
export type AuthorField =
  | {
      readonly kind: 'text';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly required: boolean;
      readonly maxLength?: number;
    }
  | {
      readonly kind: 'number';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly required: boolean;
      readonly min?: number;
      readonly max?: number;
      /** `true` ⇒ chỉ nhận số nguyên. Số pod, số replica đều là loại này. */
      readonly integer: boolean;
    }
  | {
      readonly kind: 'boolean';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
    }
  | {
      readonly kind: 'select';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly required: boolean;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      /** `true` ⇒ chọn nhiều. Tầng UI dựng checkbox thay vì dropdown. */
      readonly multiple: boolean;
    }
  | {
      /** Danh sách lặp của một nhóm trường con — node, container, remote… */
      readonly kind: 'list';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly itemLabel: string;
      readonly fields: readonly AuthorField[];
      readonly minItems?: number;
      readonly maxItems?: number;
    }
  | {
      /**
       * Danh sách chuỗi phẳng — `ClusterSpec.namespaces` là ca đã gặp thật.
       *
       * Thêm 2026-09-14 theo báo cáo lane 18.A.4. Không dựng được bằng `list`
       * (nhánh đó lặp một NHÓM trường con, còn đây mỗi phần tử là một chuỗi
       * trần), và ép qua `json` thì bắt người soạn gõ `["default","kube-system"]`
       * đúng cú pháp JSON cho một thứ đáng lẽ là một ô nhập có nút thêm/xoá.
       */
      readonly kind: 'string-list';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly itemLabel: string;
      readonly minItems?: number;
      readonly maxItems?: number;
    }
  | {
      /** Van an toàn — xem khối chú thích trên. Dùng có chừng mực. */
      readonly kind: 'json';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly required: boolean;
    };

// ── Tham số của vị từ ───────────────────────────────────────────────────────

/**
 * Kiểu giá trị của một tham số, đặt theo ĐÚNG hàm mà engine dùng để đọc nó.
 *
 * `lines` là dạng `argLines` của game Git: nhận cả một chuỗi (tự cắt theo xuống
 * dòng) lẫn một mảng chuỗi. Giao diện cho gõ nhiều dòng rồi gửi đi dạng mảng.
 */
export type ProblemArgKind = 'string' | 'number' | 'boolean' | 'lines';

/**
 * Một tham số mà vị từ chấm ĐỌC RA.
 *
 * ⛔ Đây là thứ giao diện soạn bài cần để dựng ô nhập, và nó tồn tại vì một lỗi
 * đã đo: mọi engine đọc tham số qua `arg*(args, '<tên>')` và **im lặng** khi
 * thiếu — vị từ trả `false`, người soạn thấy một mục tiêu không bao giờ đạt mà
 * không có lấy một dòng nói vì sao.
 */
export interface ProblemArgSpec {
  readonly name: string;
  readonly kind: ProblemArgKind;
  /**
   * Engine có giá trị mặc định cho tham số này, nên bỏ trống vẫn chấm được.
   * Thiếu một tham số BẮT BUỘC thì vị từ trả `false` vĩnh viễn.
   */
  readonly optional: boolean;
  /** Tập giá trị hợp lệ, cho tham số là enum. Vắng ⇒ nhận mọi giá trị đúng kiểu. */
  readonly oneOf?: readonly string[];
}

/** Bảng tham số của cả một game: tên vị từ → những tham số nó đọc. */
export type ProblemPredicateArgs = Readonly<Record<string, readonly ProblemArgSpec[]>>;

// ── Plugin ──────────────────────────────────────────────────────────────────

/**
 * Phần riêng của một game trong hệ OJ.
 *
 * `Spec` = kiểu trạng thái ban đầu (`ClusterSpec` ở k8s, `WorldSpec` ở git).
 * `A`    = kiểu hành động ghi trong nhật ký phát lại.
 */
export interface GameProblemPlugin<Spec, A extends GameAction = GameAction> {
  readonly gameId: GameId;

  /**
   * Tiền tố mã bài — `K8S`, `GIT`. Xem `isProblemCode` ở `problem.ts` về lý do
   * nó được khai chứ không suy từ `gameId`.
   */
  readonly codePrefix: string;

  /**
   * Tập chủ đề ĐÓNG của game này. Cổng kiểm: mọi `topic` của một bài phải nằm
   * trong tập của plugin theo `gameId` của bài.
   */
  readonly topics: readonly ProblemTopicOption[];

  /**
   * Tên mọi vị từ hợp lệ cho `Testcase.check` của game này.
   *
   * ⚠ Phải khẳng định HAI CHIỀU bằng test: mọi tên ở đây có hiện thực, **và**
   * mọi hiện thực có tên ở đây. Một chiều thôi thì vị từ chết sống mãi — đây là
   * đúng bài học `k8s/predicate-names.ts` đã ghi lại và nó vẫn đúng ở tầng này.
   */
  readonly predicateNames: readonly string[];

  /**
   * Tham số mà TỪNG vị từ của game này đọc — §P20.
   *
   * ⛔ BẮT BUỘC, và nó tồn tại vì một lỗi đã đo (2026-09-17): trang soạn bài
   * dựng ô chọn vị từ bằng `PREDICATE_NAMES` của RIÊNG K8s và đọc đặc tả tham số
   * từ một bảng cũng chỉ-K8s, nên **không soạn được testcase cho bất kỳ game nào
   * khác** — bài Git lẫn bài CI/CD đều dừng ở *"Chưa chọn vị từ kiểm tra"*. Đợt
   * 18.D mở đa-game ở BIÊN GHI mà không mở ở ô chọn, và khoảng hở đó sống im
   * lặng vì `predicateNames` một mình không đủ cho giao diện dựng ô nhập.
   *
   * Phủ ĐÚNG `predicateNames` — không thiếu, không thừa; `problem-plugins.test.ts`
   * ghim hai chiều. Một tên có mặt ở đây mà vắng ở kia là một vị từ giao diện
   * chào mời nhưng bộ chấm không biết.
   *
   * ⚠ Bảng này là bản sao của thứ engine THẬT SỰ đọc, và bản sao đó phải trả
   * giá: mỗi game giữ một ô gác đọc thẳng mã engine rồi đối chiếu (game Git làm
   * từ 18.E.2 — xem `git/predicate-args.ts`). Không có ô đó thì bảng trôi khỏi
   * engine trong im lặng, và triệu chứng lại đúng là cái bẫy nó sinh ra để chặn.
   */
  readonly predicateArgs: ProblemPredicateArgs;

  /**
   * Trạng thái ban đầu cho một bài MỚI trong trang soạn bài.
   *
   * Là hàm chứ không phải hằng: trả một hằng dùng chung thì hai tab soạn bài sẽ
   * cùng trỏ vào một object, và sửa tab này đổi luôn tab kia. Hàm cũng giữ
   * `sideEffects: false` trung thực — không có object nào được dựng ở tầng module.
   */
  initialSpec(): Spec;

  /** Mô tả form cho phần `initialState`. Xem `AuthorField`. */
  readonly authorFields: readonly AuthorField[];

  /**
   * Chấm một lượt — **hàm thuần, tất định**. Đây là trái tim của §18.C.
   *
   * ⛔ Cùng đầu vào PHẢI cho cùng đầu ra, ở cả trình duyệt lẫn Node, từng byte.
   * Không `Date.now()`, không `Math.random()`, không lặp trên `Set`/`Map` theo
   * thứ tự chèn. §17.J đã dựng năm test riêng cho engine Git về đúng chuyện này
   * (`git/determinism.test.ts` + `determinism.jsdom.test.ts`), và cổng CI
   * `scripts/check-git-determinism.mjs` gác phần grep.
   *
   * Nếu bất biến này hỏng thì verdict của client khác verdict của server, và
   * người làm bị từ chối một bài họ giải ĐÚNG. Plan gọi đó là điều kiện sống còn
   * của chế độ thi — không phải một lời nói quá.
   */
  grade(input: {
    readonly initialState: Spec;
    /** Cây đích, chỉ với bài chấm bằng so hình dạng. Xem `ProblemBase.targetState`. */
    readonly targetState?: Spec;
    readonly actions: readonly A[];
    readonly testcases: readonly Testcase[];
    /**
     * Số THẬT, không bao giờ `null`.
     *
     * ⛔ ĐÍNH CHÍNH 2026-09-14: bản đầu khai `number | null` và bắt mỗi plugin
     * tự chọn một hằng thay cho `null`. Lý do đầy đủ ở `Submission.seed` trong
     * `problem.ts` — tóm tắt: hai hằng đó đã lệch nhau ngay (0 và 1), và hai
     * seed khác nhau là hai thế giới đầu khác nhau trước cả lệnh đầu tiên.
     */
    readonly seed: number;
  }): GradeResult;

  /**
   * Sinh đề theo seed. **Chỉ có mặt khi game hỗ trợ** — `undefined` nghĩa là mọi
   * bài của game này buộc phải `seedable: false`.
   *
   * ⚠ Đây là nửa còn lại của cổng §18.G.3. Một bài khai `seedable: true` trong
   * khi plugin của nó không có `seedSpec` là một bài sẽ phát cùng một đề cho mọi
   * sinh viên trong một kỳ thi `per-student` — và không ai nhận ra, vì nó không
   * lỗi, chỉ im lặng không sinh gì. Cổng kiểm phải đo CẢ HAI vế.
   */
  seedSpec?(base: Spec, seed: number): Spec;
}

// ── Bảng đăng ký ────────────────────────────────────────────────────────────

/**
 * Plugin ở dạng **đã xoá kiểu `Spec`** — hình dạng mà một bảng đăng ký chứa
 * nhiều game có thể giữ.
 *
 * ⛔ ĐÍNH CHÍNH 2026-09-14. Bản đầu khai bảng là
 * `Partial<Record<GameId, GameProblemPlugin<never, GameAction>>>` kèm một lời
 * giải thích tự tin rằng `never` là chỗ chặn. Lane 18.A.4 đo lại và **`tsc` nói
 * khác**: lỗi là `TS2375`, về `exactOptionalPropertyTypes` ở thuộc tính tuỳ chọn
 * `seedSpec?` — cả hai plugin đều cố ý không khai nó. Vế `never` vẫn đáng ngờ
 * nhưng chưa tách ra đo riêng được, vì `tsc` dừng ở lỗi đầu.
 *
 * Hệ quả thực tế: bảng kiểu đó **không nhận nổi plugin nào**, và lane buộc phải
 * rải `as unknown as` ở chỗ dùng. Một hợp đồng bắt người dùng nó phải ép kiểu để
 * thoả mãn chính nó là một hợp đồng sai, không phải một người dùng cẩu thả.
 *
 * ── Vì sao phép ép KHÔNG thể bỏ hẳn ──
 *
 * Xoá kiểu ở đây là thật, không phải lười: `grade` nhận `initialState: Spec`, và
 * tham số thì **nghịch biến** — một hàm nhận `ClusterSpec` không gán được vào
 * chỗ đòi hàm nhận `unknown`. Không có cách khai nào làm biến mất điều đó.
 *
 * Nên hợp đồng **thừa nhận** phép ép thay vì giả vờ không cần: `eraseProblemPlugin`
 * là chỗ DUY NHẤT được ép, nó có tên, và nó nói rõ mình đang đánh đổi gì. Phép ép
 * rải rác thì mỗi chỗ là một cơ hội ép nhầm thứ; phép ép có tên thì chỉ có một
 * chỗ để đọc lại.
 *
 * Điều này KHÔNG mất an toàn: `K8S_PROBLEM_PLUGIN` / `GIT_PROBLEM_PLUGIN` vẫn
 * được khai bằng kiểu ĐẦY ĐỦ tại file của chúng, nên mọi sai lệch hợp đồng vẫn
 * đỏ tại nơi sinh ra. Bảng chỉ dùng để **liệt kê** và để `gradeProblemRun` tra —
 * cả hai đều ép lại về kiểu cụ thể ngay sau khi biết `gameId`.
 */
export interface ErasedProblemPlugin {
  readonly gameId: GameId;
  readonly codePrefix: string;
  readonly topics: readonly ProblemTopicOption[];
  readonly predicateNames: readonly string[];
  readonly predicateArgs: ProblemPredicateArgs;
  readonly authorFields: readonly AuthorField[];
  initialSpec(): unknown;
  grade(input: {
    readonly initialState: never;
    readonly targetState?: never;
    readonly actions: readonly GameAction[];
    readonly testcases: readonly Testcase[];
    readonly seed: number;
  }): GradeResult;
  seedSpec?(base: never, seed: number): unknown;
}

/**
 * Chỗ DUY NHẤT được phép ép kiểu khi đưa một plugin vào bảng đăng ký.
 *
 * Nhận plugin ở kiểu đầy đủ (nên sai hợp đồng vẫn đỏ ở chỗ gọi), trả về dạng đã
 * xoá `Spec`. Đọc khối chú thích của `ErasedProblemPlugin` về lý do phép ép này
 * không bỏ được.
 */
export function eraseProblemPlugin<S, A extends GameAction>(
  plugin: GameProblemPlugin<S, A>,
): ErasedProblemPlugin {
  return plugin as unknown as ErasedProblemPlugin;
}

export type ProblemPluginRegistry = Readonly<Partial<Record<GameId, ErasedProblemPlugin>>>;

/**
 * Phần của plugin đọc được mà KHÔNG cần biết `Spec`.
 *
 * Tách ra để tầng UI liệt kê game / kiểm mã / kiểm chủ đề mà không phải ép kiểu.
 */
export type ProblemPluginMeta = Pick<
  GameProblemPlugin<never, GameAction>,
  'gameId' | 'codePrefix' | 'topics' | 'predicateNames' | 'predicateArgs' | 'authorFields'
>;
