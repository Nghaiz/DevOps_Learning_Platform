import { t } from '@devops-platform/copy';
import {
  PROBLEM_PLUGINS,
  problemPluginMeta,
  type AuthorField,
  type GameId,
  type ProblemTopicOption,
} from '@devops-platform/games';

/**
 * Tầng DỊCH giữa hợp đồng plugin (`packages/games`) và trang soạn bài — §18.A.6.
 *
 * ## Vì sao có file này chứ không đọc thẳng `problemPluginMeta` ở mỗi component
 *
 * Trang soạn bài cần bốn thứ theo game: tập chủ đề, bảng vị từ, biểu mẫu trạng
 * thái ban đầu, và tên game để hiện lên ô chọn. Ba thứ đầu tới từ plugin; thứ
 * tư là chữ hiển thị, mà `packages/games` cố ý không giữ (nó cấm React và giữ
 * `sideEffects: false`). Gom phép ghép đó vào một chỗ để mỗi component nhận một
 * object đã đủ, thay vì mỗi component tự tra bảng rồi tự bù phần thiếu: bù ở
 * bốn chỗ là bốn cơ hội bù lệch nhau.
 *
 * ## Cảnh báo: `null` là câu trả lời HỢP LỆ
 *
 * `problemPluginMeta` trả `null` khi game chưa có plugin, và hợp đồng nói rõ đó
 * là "game này chưa có bài tập" chứ không phải lỗi. `pluginViewFor` giữ nguyên
 * hình dạng đó. Tầng UI hiện một trạng thái rỗng đọc được; không ném.
 */

// -- Ten game ---------------------------------------------------------------

/**
 * Tên hiển thị của SÁU `GameId`, không phải của hai game có plugin.
 *
 * `Record<GameId, string>` TOÀN PHẦN là chủ ý: `GameId` có sáu giá trị và chỉ
 * hai trong số đó có plugin hôm nay. Khai thiếu bốn cái kia thành `Partial` thì
 * ngày `pipeline` có plugin, ô chọn game sẽ hiện một dòng trống, im lặng, vì
 * một nhãn thiếu không ném. Khai đủ thì thêm `GameId` thứ bảy là một lỗi biên
 * dịch ngay tại đây.
 */
export const GAME_NAME: Readonly<Record<GameId, string>> = {
  k8s: t('author.problem.game.name.k8s'),
  git: t('author.problem.game.name.git'),
  pipeline: t('author.problem.game.name.pipeline'),
  netpol: t('author.problem.game.name.netpol'),
  dockerfile: t('author.problem.game.name.dockerfile'),
  cicd: t('author.problem.game.name.cicd'),
};

/**
 * Thứ tự hiện trên ô chọn, SUY từ `GAME_NAME` chứ không khai lần thứ hai.
 *
 * Một mảng viết tay song song sẽ thiếu đúng vào lần ai đó thêm một `GameId`, và
 * thiếu ở đây nghĩa là game mới có plugin nhưng không bao giờ hiện ra để chọn.
 * Suy từ record toàn phần thì tầng kiểu đã ép nó đủ.
 */
const GAME_ORDER = Object.keys(GAME_NAME) as readonly GameId[];

// -- Trinh soan initialState ------------------------------------------------

/**
 * `cluster` = biểu mẫu K8s viết tay đang có (`cluster-fields.tsx` và bạn bè).
 * `generic` = biểu mẫu dựng từ `authorFields` của plugin.
 */
export type SpecEditorKind = 'cluster' | 'generic';

/**
 * Game nào dùng biểu mẫu viết tay riêng.
 *
 * ## Đây là một BẢNG ĐĂNG KÝ, không phải một `switch (gameId)` trá hình
 *
 * `core/problem-plugin.ts` cấm `switch (gameId)` vì một lý do rất cụ thể: một
 * nhánh bị sót thì im lặng rơi vào `default` của game khác. Bảng này KHÔNG có
 * tính chất đó. Thiếu một khoá nghĩa là game đó dùng biểu mẫu dựng từ
 * `authorFields`, tức là hành vi ĐÚNG cho một game chưa có biểu mẫu riêng, chứ
 * không phải hành vi của một game khác.
 *
 * Vì sao K8s không dùng luôn đường `generic`: biểu mẫu viết tay của nó giàu hơn
 * hẳn `authorFields` mô tả được (tab dán JSON có phân tích ngược, ô chọn 26
 * `ResourceKind`, phép kiểm namespace chéo giữa tài nguyên và danh sách đã
 * khai). Plan mục 0 gọi những file đó là tài sản, không phải nợ; thay chúng
 * bằng một biểu mẫu tổng quát nghèo hơn là một bước lùi có thật, đo được bằng
 * số ô người soạn mất đi.
 */
const SPEC_EDITOR_BY_GAME: Readonly<Partial<Record<GameId, SpecEditorKind>>> = {
  k8s: 'cluster',
};

/*
 * ⛔ `PERSISTABLE_GAMES` ĐÃ XOÁ 2026-09-15. Ghi lại vì nó là một danh sách cố ý
 * tự huỷ, không phải một cờ tính năng ai đó quên dọn.
 *
 * Nó liệt kê game LƯU được, và hôm đó chỉ có K8s: biên ghi khai
 * `initialState: clusterSpecSchema` và không có ô nào cho `gameId`, nên một bài
 * Git soạn xong sẽ trượt Zod ở máy chủ. Chú thích cũ hẹn *"xoá đi khi §18.D đưa
 * `gameId` cùng `initialState` đa-game vào hợp đồng lưu trữ, và lúc đó nó phải
 * xoá HẲN chứ không phải thêm dần từng game vào"*. Đó chính là đợt này.
 *
 * Điều kiện lưu được nay trùng khít với điều kiện soạn được — CÓ PLUGIN — và
 * `pluginViewFor` đã trả `null` cho ca không có plugin. Một danh sách thứ hai
 * nói cùng điều đó là một chỗ để trôi.
 */

// -- Hinh dang tra ve -------------------------------------------------------

export interface AuthorableGame {
  readonly gameId: GameId;
  readonly codePrefix: string;
  readonly label: string;
}

export interface GamePluginView {
  readonly gameId: GameId;
  readonly codePrefix: string;
  readonly label: string;
  /** Tập chủ đề ĐÓNG của game này. Không còn chín chủ đề K8s dùng chung. */
  readonly topics: readonly ProblemTopicOption[];
  readonly predicateNames: readonly string[];
  readonly authorFields: readonly AuthorField[];
  readonly specEditor: SpecEditorKind;
  /** Nhãn tab trạng thái ban đầu. Khác nhau giữa các game, và cố ý vậy. */
  readonly specTabLabel: string;
  /**
   * §18.D.6 — plugin của game này có SINH ĐƯỢC đề theo seed không.
   *
   * ⚠ Hôm nay là `false` cho MỌI game: `GameProblemPlugin.seedSpec` là tuỳ chọn
   * và không plugin nào khai nó (`core/problem-plugin.ts` nói thẳng vậy). Nên
   * ô đánh dấu `seedable` trên biểu mẫu bị vô hiệu hoá ở khắp nơi, và đó là mô
   * tả đúng tình trạng chứ không phải một tính năng chưa bật.
   *
   * Đọc từ `PROBLEM_PLUGINS` chứ không từ một danh sách viết tay: ngày một
   * plugin khai `seedSpec`, ô đánh dấu tự mở ra mà không ai phải nhớ sửa thêm
   * chỗ thứ hai. Một danh sách song song thì sẽ quên, và quên ở đây nghĩa là
   * một năng lực có thật mà không ai dùng được.
   */
  readonly canSeed: boolean;
}

/**
 * Danh sách game CÓ bài tập, để dựng ô chọn.
 *
 * Đọc từ `PROBLEM_PLUGINS` chứ không khai tay: thêm một plugin là nó tự hiện ra
 * ở ô chọn, không phải sửa thêm một danh sách thứ hai ở đây.
 */
export const AUTHORABLE_GAMES: readonly AuthorableGame[] = GAME_ORDER.flatMap((gameId) => {
  const meta = problemPluginMeta(gameId);
  return meta === null ? [] : [{ gameId, codePrefix: meta.codePrefix, label: GAME_NAME[gameId] }];
});

/** Game mặc định khi mở một bài mới. Mọi bài đang có trong DB đều là K8s. */
export const DEFAULT_AUTHOR_GAME: GameId = 'k8s';

export function pluginViewFor(gameId: GameId): GamePluginView | null {
  const meta = problemPluginMeta(gameId);
  if (meta === null) {
    return null;
  }
  const specEditor = SPEC_EDITOR_BY_GAME[gameId] ?? 'generic';
  // `problemPluginMeta` cố ý KHÔNG chở `seedSpec` (nó là `Pick` của phần đọc
  // được mà không cần biết `Spec`), nên phải tra bảng đăng ký một lượt nữa.
  const canSeed = PROBLEM_PLUGINS[gameId]?.seedSpec !== undefined;
  return {
    gameId,
    codePrefix: meta.codePrefix,
    label: GAME_NAME[gameId],
    topics: meta.topics,
    predicateNames: meta.predicateNames,
    authorFields: meta.authorFields,
    specEditor,
    specTabLabel:
      specEditor === 'cluster' ? t('author.problem.tab.cluster') : t('author.problem.tab.spec'),
    canSeed,
  };
}

/**
 * Đường vào đấu trường để XEM TRƯỚC một bài, theo game. `null` = game đó chưa
 * có đường vào nào (§18.D.5).
 *
 * ## Vì sao một bảng tra chứ không phải `/games/${gameId}?problem=`
 *
 * Bởi vì công thức đó SAI, và nó sai theo kiểu im lặng. Đo 2026-09-15:
 * `app/games/git/page.tsx` chỉ đọc `?level=` và bỏ qua mọi tham số khác, còn
 * game Git là game THEO LEVEL (`GIT_LEVEL_IDS`), không có chế độ bài OJ. Một
 * link `/games/git?problem=GIT-0001` vì thế mở ra một ván Git bình thường ở
 * level mặc định: không lỗi, không 404, không dòng log nào — người soạn bấm
 * "xem trước", thấy một game chạy, và kết luận rằng bài của họ đã xem trước
 * được.
 *
 * Bốn game còn lại (`pipeline`, `netpol`, `dockerfile`, `cicd`) thậm chí chưa
 * có route nào, nên link tới đó là một 404 thẳng.
 *
 * ## Nối Git vào đây KHÔNG phải việc của §18.D.5
 *
 * Nó đòi một chế độ chơi mới trong `GitGame`: nạp bài theo mã, dựng thế giới từ
 * `WorldSpec` của bài thay vì từ level, chấm theo testcase. Đó là §18.C làm lại
 * một lần nữa cho engine Git, không phải một nút bấm. Khai ra ở đây là cách nói
 * thật về thứ hôm nay có.
 *
 * ⚠ Thêm một dòng vào bảng này là một lời KHAI rằng route đó đọc `?problem=`.
 * Trước khi thêm, mở chính `app/games/<gameId>/page.tsx` và đọc `searchParams`.
 */
const PREVIEW_ROUTE_BY_GAME: Readonly<Partial<Record<GameId, string>>> = {
  k8s: '/games/k8s',
};

export function problemPreviewHref(gameId: GameId, code: string): string | null {
  const route = PREVIEW_ROUTE_BY_GAME[gameId];
  return route === undefined ? null : `${route}?problem=${encodeURIComponent(code)}`;
}

/**
 * Trạng thái ban đầu mặc định của một game, lấy từ CHÍNH plugin.
 *
 * `initialSpec()` là hàm chứ không phải hằng dùng chung, đúng vì lý do hợp đồng
 * đã ghi: hai tab soạn bài cùng trỏ vào một object thì sửa tab này đổi luôn tab
 * kia. Gọi lại mỗi lần đổi game là cách duy nhất giữ đúng tính chất đó.
 *
 * Trả `null` khi plugin trả một thứ không phải object. `initialSpec()` khai
 * `unknown` ở dạng đã xoá kiểu, nên đây là chỗ duy nhất biết được điều đó.
 */
export function initialSpecFor(gameId: GameId): Readonly<Record<string, unknown>> | null {
  const plugin = PROBLEM_PLUGINS[gameId];
  if (plugin === undefined) {
    return null;
  }
  const spec: unknown = plugin.initialSpec();
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    return null;
  }
  return spec as Readonly<Record<string, unknown>>;
}

/**
 * Mọi `path` trong một mô tả form, kể cả trường con của `list`, dạng chấm phân
 * cách (`resources.kind`).
 *
 * Dùng cho ô nghiệm thu: hai game có hai TẬP PATH khác nhau là bằng chứng đọc
 * được rằng biểu mẫu thật sự đổi, chứ không phải "trang render được".
 */
export function authorFieldPaths(fields: readonly AuthorField[]): readonly string[] {
  return fields.flatMap((field) =>
    field.kind === 'list'
      ? [field.path, ...authorFieldPaths(field.fields).map((child) => `${field.path}.${child}`)]
      : [field.path],
  );
}
