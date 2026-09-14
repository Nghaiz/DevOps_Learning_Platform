import type {
  GameId,
  Problem,
  ProblemDifficulty,
  ProblemTopicId,
  ResourceKind,
} from '@devops-platform/games';
import type { PredicateName } from '@devops-platform/games';
import { clusterFromSpec, emptyCluster, type ClusterFormState } from './cluster-form';
import { DEFAULT_AUTHOR_GAME, initialSpecFor, pluginViewFor } from './game-plugin-view';
import { specToText, type SpecTextState } from './spec-text';

/**
 * Mô hình FORM của một bài OJ, và hình dạng payload gửi lên router `problems`.
 *
 * ## `ProblemDraftInput` được SUY từ hợp đồng, không chép lại
 *
 * `Omit<Problem, …>` chứ không phải một interface viết tay liệt kê 12 field:
 * hợp đồng thêm một field thì chỗ này đỏ ngay, còn một bản chép tay thì lặng lẽ
 * thiếu. Năm field bị loại đều do MÁY CHỦ cấp — `code` cấp trong vòng chống đua
 * trên khoá chính, `authorId` cố ý không có trong schema input (một field
 * `authorId` là field kẻ tấn công điền được), `state` đổi qua `publish`/`archive`,
 * hai mốc thời gian do DB ghi.
 */
export type ProblemDraftInput = Omit<Problem, 'code' | 'state' | 'authorId' | 'createdAt' | 'updatedAt'>;

export interface ObjectiveFormState {
  readonly key: string;
  id: string;
  label: string;
  /** `''` = chưa chọn. Người soạn KHÔNG gõ tay được — xem `objective-fields.tsx`. */
  check: '' | PredicateName;
  /**
   * Tham số dạng CHUỖI, khoá theo `PredicateArgSpec.key`.
   *
   * Giữ nguyên khi người soạn đổi vị từ: hai vị từ họ hàng (`netpol-allows` ↔
   * `netpol-denies`) dùng chung bộ tham số, và xoá sạch mỗi lần đổi ô chọn là
   * bắt gõ lại bốn ô vì một lần bấm nhầm. Khoá thừa của vị từ cũ bị BỎ lúc
   * chuyển sang payload, nên nó không rò ra ngoài.
   */
  args: Readonly<Record<string, string>>;
  required: boolean;
}

export interface HintFormState {
  readonly key: string;
  /**
   * Định danh ỔN ĐỊNH, và vì thế nó là một ô người soạn nhìn thấy chứ không phải
   * một chuỗi sinh ngầm lúc gửi: `ProblemSubmission.hintsRevealed` lưu đúng id
   * này, nên đổi nó là mồ côi lịch sử mở gợi ý của mọi người đã làm bài.
   */
  id: string;
  text: string;
  penaltyPoints: string;
}

export interface ProblemFormState {
  /**
   * Game của bài. Quyết định biểu mẫu trạng thái ban đầu, tập chủ đề, và bảng
   * vị từ dùng cho testcase.
   *
   * ## Vì sao nó ở trong FORM mà chưa ở trong payload
   *
   * `Problem` chưa có `gameId` và `initialState` của nó vẫn khai `ClusterSpec`
   * (xem `PERSISTABLE_GAMES` trong `game-plugin-view.ts`). Nên hôm nay trường
   * này chỉ lái GIAO DIỆN; nó không đi lên máy chủ, và trang cảnh báo thẳng khi
   * game đang chọn chưa lưu được.
   *
   * Giữ nó trong form ngay từ bây giờ chứ không đợi hợp đồng lưu trữ: phần
   * "biểu mẫu đổi theo plugin" là thứ §18.A.6 đòi, và nó đo được ngay mà không
   * cần một cột DB nào.
   */
  gameId: GameId;
  /**
   * Trạng thái ban đầu cho game KHÔNG dùng biểu mẫu viết tay, giữ ở dạng map
   * chuỗi theo `path` của `authorFields`. Xem `spec-text.ts` về lý do là chuỗi.
   *
   * Với K8s thì trường này không được đọc: biểu mẫu viết tay `cluster` mới là
   * nguồn. Hai trường cùng lúc trông như hai nguồn cho một sự thật, nhưng mỗi
   * lượt soạn chỉ có ĐÚNG MỘT trường được trình soạn đọc, và `specEditor` của
   * plugin nói ra trường nào.
   */
  specText: SpecTextState;
  title: string;
  slug: string;
  statement: string;
  difficulty: ProblemDifficulty;
  /**
   * Chủ đề đang chọn, giữ ở kiểu MỜ (`ProblemTopicId` = `string`) chứ không ở
   * union đóng của K8s.
   *
   * `core/problem.ts` đã chuyển tập đóng từ `core/` xuống từng plugin, đúng vì
   * lý do này: chín tên chủ đề K8s là tri thức về Kubernetes, và một bài Git
   * không chọn chủ đề trong một danh sách nói về Pod. Giữ union K8s ở tầng form
   * thì mỗi lần bấm một ô chủ đề của game khác là một phép ép kiểu.
   *
   * Tập đóng KHÔNG mất: ô chọn chỉ dựng từ `pluginViewFor(gameId).topics`, và
   * máy chủ kiểm lại chủ đề của bài có nằm trong tập của plugin không. Phép ép
   * về union K8s còn đúng MỘT chỗ, ở `problem-draft.ts`, và nó có chú thích
   * nói vì sao còn đúng.
   */
  topics: readonly ProblemTopicId[];
  /** Ô tự do ngăn bằng dấu phẩy; chuẩn hoá thường + gạch nối lúc chuyển payload. */
  tagsText: string;
  hasTimeLimit: boolean;
  timeLimitSec: string;
  parMoves: string;
  /**
   * `false` ⇒ `allowedResources: null` (cho dùng mọi loại). Cờ này không phải
   * trường suy ra được: `null` và `[]` là HAI ý khác nhau — "không giới hạn" và
   * "không cho tạo gì cả" — mà một mảng rỗng thì không phân biệt nổi.
   */
  restrictResources: boolean;
  allowedResources: readonly ResourceKind[];
  cluster: ClusterFormState;
  objectives: readonly ObjectiveFormState[];
  hints: readonly HintFormState[];
}

export function emptyObjective(key: string): ObjectiveFormState {
  return { key, id: '', label: '', check: '', args: {}, required: true };
}

export function emptyHint(key: string): HintFormState {
  return { key, id: '', text: '', penaltyPoints: '10' };
}

/**
 * Ô nhập của biểu mẫu dựng-từ-plugin, nạp sẵn `initialSpec()` của game.
 *
 * Trả `{}` khi game chưa có plugin. Đó là câu trả lời hợp lệ, không phải lỗi:
 * trang hiện một trạng thái rỗng đọc được (xem `GameSelectField`).
 */
export function specTextForGame(gameId: GameId): SpecTextState {
  const view = pluginViewFor(gameId);
  const spec = initialSpecFor(gameId);
  if (view === null || spec === null) {
    return {};
  }
  return specToText(view.authorFields, spec);
}

export function emptyForm(nextKey: () => string): ProblemFormState {
  return {
    gameId: DEFAULT_AUTHOR_GAME,
    specText: specTextForGame(DEFAULT_AUTHOR_GAME),
    title: '',
    slug: '',
    statement: '',
    difficulty: 'easy',
    topics: [],
    tagsText: '',
    hasTimeLimit: false,
    timeLimitSec: '600',
    parMoves: '',
    restrictResources: false,
    allowedResources: [],
    cluster: emptyCluster(nextKey),
    // Một mục tiêu bắt buộc có sẵn: hợp đồng đòi ÍT NHẤT một, nên bắt đầu từ
    // không có gì là bắt đầu từ một trạng thái chắc chắn sai.
    objectives: [emptyObjective(nextKey())],
    hints: [],
  };
}

/** Đọc một bài đã lưu về form. Mọi số thành chuỗi, mọi `null` thành cờ tắt. */
export function formFromProblem(problem: Problem, nextKey: () => string): ProblemFormState {
  return {
    // Mọi bài ĐÃ LƯU đều là K8s, và đó là một sự thật của hợp đồng chứ không
    // phải một giả định tiện tay: `Problem` không có `gameId` để đọc ra, và
    // `initialState` của nó khai đúng `ClusterSpec`. Ngày hợp đồng có `gameId`
    // thì dòng này đọc từ bài, và `PERSISTABLE_GAMES` biến mất cùng lúc.
    gameId: DEFAULT_AUTHOR_GAME,
    specText: specTextForGame(DEFAULT_AUTHOR_GAME),
    title: problem.title,
    slug: problem.slug,
    statement: problem.statement,
    difficulty: problem.difficulty,
    topics: problem.topics,
    tagsText: problem.tags.join(', '),
    hasTimeLimit: problem.timeLimitSec !== null,
    timeLimitSec: problem.timeLimitSec === null ? '600' : String(problem.timeLimitSec),
    parMoves: problem.parMoves === null ? '' : String(problem.parMoves),
    restrictResources: problem.allowedResources !== null,
    allowedResources: problem.allowedResources ?? [],
    cluster: clusterFromSpec(problem.initialState, nextKey),
    objectives: problem.objectives.map((objective) => ({
      key: nextKey(),
      id: objective.id,
      label: objective.label,
      // Vị từ đọc từ DB có thể là một tên đã bị gỡ khỏi bảng tra (bài cũ, hợp
      // đồng mới). Ép kiểu ở đây là cố ý: form phải MỞ được bài đó để người soạn
      // sửa, còn việc chặn nằm ở `problem-validate.ts` — nó kiểm tên có trong
      // bảng hay không và nói ra. Chặn ngay ở khâu nạp thì bài hỏng thành bài
      // không mở nổi.
      check: objective.check as PredicateName,
      args: stringifyArgs(objective.args),
      required: objective.required,
    })),
    hints: problem.hints.map((hint) => ({
      key: nextKey(),
      id: hint.id,
      text: hint.text,
      penaltyPoints: String(hint.penaltyPoints),
    })),
  };
}

function stringifyArgs(args: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, string>> {
  if (args === undefined) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) {
      continue;
    }
    // Object (bộ chọn nhãn dạng map) về lại dạng chuỗi `k=v,k=v` của kubectl —
    // đúng dạng mà mọi level đã viết dùng, và là dạng `argSelector` đọc trước.
    out[key] =
      typeof value === 'object'
        ? Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(',')
        : String(value);
  }
  return out;
}
