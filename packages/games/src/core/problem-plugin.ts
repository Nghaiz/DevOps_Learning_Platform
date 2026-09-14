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
      /** Van an toàn — xem khối chú thích trên. Dùng có chừng mực. */
      readonly kind: 'json';
      readonly path: string;
      readonly label: string;
      readonly help?: string;
      readonly required: boolean;
    };

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
    readonly actions: readonly A[];
    readonly testcases: readonly Testcase[];
    readonly seed: number | null;
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
 * ⚠ Kiểu này cố ý dùng `GameProblemPlugin<never>` chứ không phải
 * `GameProblemPlugin<unknown>` hay `<any>`.
 *
 * Bảng đăng ký giữ nhiều plugin có `Spec` KHÁC nhau, nên tại chỗ tra bảng ta
 * không biết `Spec` là gì — và đó là sự thật, đừng che nó bằng `any`. Chỗ nào
 * cần kiểu cụ thể thì tra plugin theo hằng đã biết kiểu (`K8S_PROBLEM_PLUGIN`),
 * không tra qua bảng. Bảng dành cho việc **liệt kê** (dựng dropdown chọn game,
 * kiểm mã bài, kiểm chủ đề) — những việc chỉ chạm phần không phụ thuộc `Spec`.
 */
export type ProblemPluginRegistry = Readonly<
  Partial<Record<GameId, GameProblemPlugin<never, GameAction>>>
>;

/**
 * Phần của plugin đọc được mà KHÔNG cần biết `Spec`.
 *
 * Tách ra để tầng UI liệt kê game / kiểm mã / kiểm chủ đề mà không phải ép kiểu.
 */
export type ProblemPluginMeta = Pick<
  GameProblemPlugin<never, GameAction>,
  'gameId' | 'codePrefix' | 'topics' | 'predicateNames' | 'authorFields'
>;
