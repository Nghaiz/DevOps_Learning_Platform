import { errText, t } from '@devops-platform/copy';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_TOPICS,
  type ClusterSpec,
  type Problem,
  type ProblemDifficulty,
  type ProblemTopic,
  type ResourceKind,
  type Testcase,
} from '@devops-platform/games';
import { clusterFromSpec } from './cluster-form';
import {
  emptyForm,
  formFromProblem,
  type LoadedProblemFields,
  type ProblemFormState,
} from './problem-form';
import { toProblemDraft } from './problem-draft';
import { RESOURCE_KINDS } from './vocabulary';

/**
 * Xuất / nhập bài dưới dạng JSON — đường chuyển bài giữa các môi trường.
 *
 * ## Vì sao xuất từ FORM chứ không từ bài đã lưu
 *
 * Người soạn bấm "Xuất" để mang thứ đang nhìn thấy đi nơi khác, kể cả khi chưa
 * lưu. Xuất từ bài đã lưu thì file tải về là bản CŨ, và không có gì trên màn
 * hình nói ra điều đó — kiểu sai lặng lẽ tệ nhất.
 *
 * ## Vì sao nhập KHÔNG tin dữ liệu vào
 *
 * File JSON tới từ một môi trường khác, một phiên bản hợp đồng khác, hoặc từ tay
 * người sửa. Mọi trường được kiểm lại: giá trị ngoài tập đóng bị bỏ và thay bằng
 * mặc định, phần cấu trúc sai làm cả lượt nhập đỏ. Nhập xong vẫn phải qua cổng
 * xuất bản như mọi bài khác — nhập không phải một đường vòng.
 */

/** Bài xuất ra kèm nhãn phiên bản để bên nhận biết mình đang đọc gì. */
export interface ProblemExport {
  readonly format: 'k8s-problem';
  readonly version: 1;
  readonly code: string | null;
  readonly problem: Readonly<Record<string, unknown>>;
}

function exportBody(form: ProblemFormState): Record<string, unknown> | null {
  const draft = toProblemDraft(form);
  return draft.ok ? { ...draft.value } : null;
}

export function exportProblemJson(form: ProblemFormState, code: string | null): string {
  const body = exportBody(form);
  if (body === null) {
    // Không xuất một bài chưa chuyển được sang payload: file đó sẽ nhập lại
    // không nổi, và người mang nó đi chỉ phát hiện ra ở đầu bên kia.
    throw new Error(
      errText(
        'problem.problem-json-bai-dang-co-o-sai-nen-chua-xuat-duoc-sua-cac-loi-duoc-neu-roi-xuat-lai',
      ),
    );
  }
  const payload: ProblemExport = { format: 'k8s-problem', version: 1, code, problem: body };
  return JSON.stringify(payload, null, 2);
}

export function exportFileName(code: string | null, slug: string): string {
  const base = code ?? (slug === '' ? 'bai-moi' : slug);
  return `${base}.problem.json`;
}

type ImportResult =
  | { readonly ok: true; readonly form: ProblemFormState; readonly dropped: readonly string[] }
  | { readonly ok: false; readonly message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * JSON → form. `dropped` liệt kê những gì bị bỏ, và trang soạn PHẢI hiện nó ra:
 * một lượt nhập âm thầm đánh rơi hai chủ đề trông y hệt một lượt nhập sạch.
 */
export function importProblemJson(raw: string, nextKey: () => string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      message: errText('problem.cluster-json-fields-json-khong-doc-duoc', {
        value1: String(
          error instanceof Error ? error.message : t('problem.cluster-json-fields-loi-cu-phap'),
        ),
      }),
    };
  }

  const outer = asRecord(parsed);
  if (outer === null) {
    return { ok: false, message: errText('problem.problem-json-noi-dung-phai-la-mot-object-json') };
  }
  // Nhận cả file bọc (`{ format, problem }`) lẫn object bài trần — bài trần là
  // thứ người ta hay chép ra từ một chỗ khác, và từ chối nó không bảo vệ được gì.
  const body = asRecord(outer['problem']) ?? outer;

  const cluster = asRecord(body['initialState']);
  if (cluster === null || !Array.isArray(cluster['nodes'])) {
    return {
      ok: false,
      message: errText(
        'problem.problem-json-thieu-initialstate-hoac-initialstate-nodes-khong-phai-mang',
      ),
    };
  }

  const dropped: string[] = [];
  const base = emptyForm(nextKey);

  const difficulty = asStringOr(body['difficulty'], '');
  const validDifficulty = (PROBLEM_DIFFICULTIES as readonly string[]).includes(difficulty);
  if (difficulty !== '' && !validDifficulty) {
    dropped.push(
      t('problem.problem-json-do-kho-khong-thuoc-bon-bac-hop-le-da-dat-lai-thanh-de', {
        difficulty: String(difficulty),
      }),
    );
  }

  const topics: ProblemTopic[] = [];
  for (const topic of Array.isArray(body['topics']) ? body['topics'] : []) {
    if (typeof topic === 'string' && (PROBLEM_TOPICS as readonly string[]).includes(topic)) {
      topics.push(topic as ProblemTopic);
    } else {
      dropped.push(
        t('problem.problem-json-chu-de-khong-co-trong-tap-dong', { topic: String(topic) }),
      );
    }
  }

  const allowed: ResourceKind[] = [];
  const rawAllowed = body['allowedResources'];
  if (Array.isArray(rawAllowed)) {
    for (const kind of rawAllowed) {
      if (typeof kind === 'string' && RESOURCE_KINDS.includes(kind as ResourceKind)) {
        allowed.push(kind as ResourceKind);
      } else {
        dropped.push(
          t('problem.problem-json-loai-tai-nguyen-khong-co-trong-26-loai', {
            kind: String(kind),
          }),
        );
      }
    }
  }

  const initialState = cluster as unknown as ClusterSpec;

  /**
   * Dựng đầu vào giả để dùng lại `formFromProblem` — SSOT của phép đổi bài→form.
   * Viết một đường nạp thứ hai ở đây là dựng một chỗ để trôi: hai đường nạp sẽ
   * đọc `args` của mục tiêu theo hai cách sau vài lần sửa.
   *
   * ⚠ Kiểu nay là `LoadedProblemFields` chứ không phải `Problem`, và năm field
   * máy chủ cấp (`code`, `state`, `authorId`, hai mốc thời gian) BIẾN MẤT thay
   * vì mang giá trị giữ chỗ. Đó là cải thiện chứ không phải mất mát: giá trị
   * giữ chỗ là dữ liệu bịa nằm trong một object trông như bài thật, và lần sau
   * ai đó đọc `shaped.code` sẽ nhận `K8S-0000` mà không có gì nói rằng nó giả.
   * Một tham số nêu đúng những trường nó cần thì không có chỗ cho thứ đó.
   */
  const shaped: LoadedProblemFields = {
    slug: asStringOr(body['slug'], ''),
    title: asStringOr(body['title'], ''),
    statement: asStringOr(body['statement'], ''),
    difficulty: validDifficulty ? (difficulty as ProblemDifficulty) : 'easy',
    topics,
    tags: Array.isArray(body['tags'])
      ? body['tags'].filter((t): t is string => typeof t === 'string')
      : [],
    timeLimitSec: typeof body['timeLimitSec'] === 'number' ? body['timeLimitSec'] : null,
    initialState,
    /*
     * Khoá trong FILE vẫn là `objectives`, và đó không phải sơ suất: định dạng
     * xuất (`ProblemExport`) là thứ đã nằm trong file của người khác, nên đổi
     * tên khoá ở đây làm mọi file đã xuất trước đó nhập vào thành bài rỗng —
     * im lặng, vì nhánh `Array.isArray` chỉ rơi sang mặc định. Cột DB cũng giữ
     * tên `objectives` vì đúng lý do đó (xem chú thích cột ở `schema.ts`).
     * Chỉ KIỂU trong bộ nhớ đổi sang `Testcase`.
     */
    testcases: Array.isArray(body['objectives'])
      ? body['objectives'].map(toImportedTestcase)
      : base.objectives.map((o) => ({ id: o.id, label: o.label, check: '', visible: true })),
    allowedResources: Array.isArray(rawAllowed) ? allowed : null,
    hints: Array.isArray(body['hints']) ? (body['hints'] as Problem['hints']) : [],
    parMoves: typeof body['parMoves'] === 'number' ? body['parMoves'] : null,
  };

  const form = formFromProblem(shaped, nextKey);
  return {
    ok: true,
    // `clusterFromSpec` chạy lại trên chính `initialState` vừa nhận để mọi ô
    // node/tài nguyên có khoá React mới — nếu không, hai lượt nhập liên tiếp
    // dùng lại khoá cũ và React giữ nguyên giá trị ô đang gõ dở.
    form: { ...form, cluster: clusterFromSpec(initialState, nextKey) },
    dropped,
  };
}

/**
 * Một phần tử `objectives` trong file JSON → `Testcase` của hợp đồng.
 *
 * Mức TIN dữ liệu giữ nguyên như bản trước (file nhập vào vốn được ép kiểu
 * thẳng); thứ thêm vào chỉ là `visible`, vì `Testcase` đòi nó còn định dạng file
 * thì chưa bao giờ ghi nó.
 *
 * Luật mặc định chép nguyên từ `server/problems/testcases.ts` — *"chỉ một
 * `false` TƯỜNG MINH mới làm testcase ẩn"* — chứ không tự đặt một luật thứ hai:
 * file cũ không có khoá này thì mọi case hiện, đúng bằng hành vi hôm nay, và
 * file tương lai có `visible: false` thì nhập vào vẫn giữ được ý đó. Hai biên
 * đọc cùng một cột mà mặc định khác nhau là chỗ dữ liệu bắt đầu lệch.
 */
function toImportedTestcase(raw: unknown): Testcase {
  const row = asRecord(raw) ?? {};
  return {
    id: asStringOr(row['id'], ''),
    label: asStringOr(row['label'], ''),
    check: asStringOr(row['check'], ''),
    ...(asRecord(row['args']) === null ? {} : { args: asRecord(row['args']) as Readonly<Record<string, unknown>> }),
    visible: row['visible'] !== false,
  };
}
