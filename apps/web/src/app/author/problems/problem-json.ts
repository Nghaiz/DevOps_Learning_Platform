import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_TOPICS,
  type ClusterSpec,
  type Problem,
  type ProblemDifficulty,
  type ProblemTopic,
  type ResourceKind,
} from '@devops-platform/games';
import { clusterFromSpec } from './cluster-form';
import { emptyForm, formFromProblem, type ProblemFormState } from './problem-form';
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
    throw new Error('Bài đang có ô sai nên chưa xuất được. Sửa các lỗi được nêu rồi xuất lại.');
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
    return { ok: false, message: `JSON không đọc được: ${error instanceof Error ? error.message : 'lỗi cú pháp'}` };
  }

  const outer = asRecord(parsed);
  if (outer === null) {
    return { ok: false, message: 'Nội dung phải là một object JSON.' };
  }
  // Nhận cả file bọc (`{ format, problem }`) lẫn object bài trần — bài trần là
  // thứ người ta hay chép ra từ một chỗ khác, và từ chối nó không bảo vệ được gì.
  const body = asRecord(outer['problem']) ?? outer;

  const cluster = asRecord(body['initialState']);
  if (cluster === null || !Array.isArray(cluster['nodes'])) {
    return { ok: false, message: 'Thiếu `initialState` hoặc `initialState.nodes` không phải mảng.' };
  }

  const dropped: string[] = [];
  const base = emptyForm(nextKey);

  const difficulty = asStringOr(body['difficulty'], '');
  const validDifficulty = (PROBLEM_DIFFICULTIES as readonly string[]).includes(difficulty);
  if (difficulty !== '' && !validDifficulty) {
    dropped.push(`độ khó "${difficulty}" không thuộc bốn bậc hợp lệ, đã đặt lại thành "Dễ"`);
  }

  const topics: ProblemTopic[] = [];
  for (const topic of Array.isArray(body['topics']) ? body['topics'] : []) {
    if (typeof topic === 'string' && (PROBLEM_TOPICS as readonly string[]).includes(topic)) {
      topics.push(topic as ProblemTopic);
    } else {
      dropped.push(`chủ đề "${String(topic)}" không có trong tập đóng`);
    }
  }

  const allowed: ResourceKind[] = [];
  const rawAllowed = body['allowedResources'];
  if (Array.isArray(rawAllowed)) {
    for (const kind of rawAllowed) {
      if (typeof kind === 'string' && RESOURCE_KINDS.includes(kind as ResourceKind)) {
        allowed.push(kind as ResourceKind);
      } else {
        dropped.push(`loại tài nguyên "${String(kind)}" không có trong 26 loại`);
      }
    }
  }

  /**
   * Dựng một `Problem` giả để dùng lại `formFromProblem` — SSOT của phép đổi
   * bài→form. Viết một đường nạp thứ hai ở đây là dựng một chỗ để trôi: hai
   * đường nạp sẽ đọc `args` của mục tiêu theo hai cách sau vài lần sửa.
   *
   * Năm field máy chủ cấp điền giá trị giữ chỗ vì `formFromProblem` không đọc
   * tới chúng; chúng không rời khỏi hàm này.
   */
  const shaped: Problem = {
    code: 'K8S-0000',
    slug: asStringOr(body['slug'], ''),
    title: asStringOr(body['title'], ''),
    statement: asStringOr(body['statement'], ''),
    difficulty: validDifficulty ? (difficulty as ProblemDifficulty) : 'easy',
    topics,
    tags: Array.isArray(body['tags']) ? body['tags'].filter((t): t is string => typeof t === 'string') : [],
    timeLimitSec: typeof body['timeLimitSec'] === 'number' ? body['timeLimitSec'] : null,
    initialState: cluster as unknown as ClusterSpec,
    objectives: Array.isArray(body['objectives'])
      ? (body['objectives'] as Problem['objectives'])
      : base.objectives.map((o) => ({ id: o.id, label: o.label, check: '', required: o.required })),
    allowedResources: Array.isArray(rawAllowed) ? allowed : null,
    hints: Array.isArray(body['hints']) ? (body['hints'] as Problem['hints']) : [],
    parMoves: typeof body['parMoves'] === 'number' ? body['parMoves'] : null,
    state: 'draft',
    authorId: null,
    createdAt: '',
    updatedAt: '',
  };

  const form = formFromProblem(shaped, nextKey);
  return {
    ok: true,
    // `clusterFromSpec` chạy lại trên chính `initialState` vừa nhận để mọi ô
    // node/tài nguyên có khoá React mới — nếu không, hai lượt nhập liên tiếp
    // dùng lại khoá cũ và React giữ nguyên giá trị ô đang gõ dở.
    form: { ...form, cluster: clusterFromSpec(shaped.initialState, nextKey) },
    dropped,
  };
}
