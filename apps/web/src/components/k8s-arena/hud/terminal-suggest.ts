/**
 * Gợi ý lệnh `kubectl` ngay khi gõ — thứ bản của k8sgames.com không có.
 *
 * ## Ranh giới của file này
 *
 * Đây là bộ GỢI Ý, không phải bộ phân tích. Bộ phân tích thật là `parseKubectl`,
 * và nó chạy lúc người chơi bấm Enter. Hệ quả cần nhớ: một gợi ý sai chỉ làm mất
 * một gợi ý — nó KHÔNG bao giờ làm chạy sai một lệnh.
 *
 * Danh sách động từ và phép phân giải loại tài nguyên đọc THẲNG từ engine
 * (`KUBECTL_VERBS`, `resolveKind`, `KINDS`), nên hai thứ đó không lệch được khỏi
 * bộ phân tích. Bảng cờ vẫn là bản chép — lý do và hệ quả ghi ở đầu
 * `terminal-suggest-vocab.ts`.
 */

import { KINDS, KUBECTL_VERBS, resolveKind } from '@devops-platform/games';
import type { ObjectView } from '@devops-platform/games';
import {
  FLAGS_TAKING_VALUE,
  ROLLOUT_SUBS,
  VERB_HINTS,
  flagsFor,
  type Suggestion,
} from './terminal-suggest-vocab.ts';

export type { Suggestion } from './terminal-suggest-vocab.ts';

/** Bao nhiêu gợi ý hiện cùng lúc. Nhiều hơn thì danh sách che mất kết quả lệnh trước. */
const MAX_SUGGESTIONS = 8;

/** Thứ tự lấy từ `KUBECTL_VERBS` của engine — không có danh sách thứ hai để lệch. */
const VERBS: readonly Suggestion[] = KUBECTL_VERBS.map((verb) => ({
  value: verb,
  hint: VERB_HINTS[verb],
}));

const VERBS_WITH_KIND = new Set(['get', 'describe', 'delete', 'edit', 'scale']);
const VERBS_WITH_POD = new Set(['logs', 'exec']);

/**
 * Vị trí đối số (bỏ qua cờ và giá trị của cờ) mà token đang gõ sẽ chiếm.
 *
 * Đếm ở đây thay vì tin vào chỉ số mảng: `kubectl -n prod get pods` là hợp lệ,
 * nên "token thứ ba" và "đối số thứ nhất" không phải một thứ.
 */
function positionalIndex(committed: readonly string[]): number {
  let count = 0;
  let skipNext = false;
  for (const token of committed) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith('-')) {
      skipNext = FLAGS_TAKING_VALUE.has(token);
      continue;
    }
    count += 1;
  }
  return count;
}

/** Đối số cuối cùng đã gõ xong sau động từ — với `get pods` thì là `pods`. */
function lastPositional(committed: readonly string[]): string {
  let skipNext = false;
  let last = '';
  for (const token of committed.slice(2)) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith('-')) {
      skipNext = FLAGS_TAKING_VALUE.has(token);
      continue;
    }
    last = token;
  }
  return last;
}

/**
 * Loại tài nguyên đang có trong cụm, gợi ý ở dạng SỐ NHIỀU như `kubectl` in ra.
 *
 * Đọc từ object THẬT chứ không duyệt cả 26 loại: gợi ý một loại mà cụm không có
 * là dẫn người chơi tới một bảng rỗng. Dạng số nhiều lấy từ `KINDS[…].plural` —
 * đúng thứ người ta gõ ngoài đời, và `resolveKind` nhận nó.
 */
function kindsInCluster(objects: readonly ObjectView[]): readonly Suggestion[] {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const key = KINDS[object.kind].plural;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, hint: `${count} trong cụm` }));
}

/**
 * Object thuộc loại mà `token` chỉ tới.
 *
 * Dùng chính `resolveKind` của engine, nên `po` · `pods` · `Pod` · `netpol` ·
 * `networkpolicies` đều ra đúng loại. Bản trước đoán số nhiều bằng cách bỏ hậu
 * tố `s`/`es` và trượt ở `networkpolicies` — phép đoán đó không còn cần tồn tại.
 */
function objectsOfKindToken(objects: readonly ObjectView[], token: string): readonly ObjectView[] {
  const kind = resolveKind(token);
  return kind === null ? [] : objects.filter((object) => object.kind === kind);
}

function names(objects: readonly ObjectView[]): readonly Suggestion[] {
  return objects.map((object) => ({
    value: object.name,
    hint: `${object.kind} · ${object.namespace || 'cụm'}`,
  }));
}

/** Bộ gợi ý chưa lọc theo phần đang gõ. Tách ra để `suggestTokens` chỉ còn phần lọc. */
function poolFor(
  committed: readonly string[],
  prefix: string,
  objects: readonly ObjectView[],
): readonly Suggestion[] {
  const head = committed[0];
  if (head === undefined) {
    return [{ value: 'kubectl', hint: 'Mọi lệnh trong game bắt đầu bằng kubectl' }];
  }
  if (head !== 'kubectl' && head !== 'k') {
    return [];
  }
  const verb = committed[1];
  if (verb === undefined) {
    return VERBS;
  }
  if (prefix.startsWith('-')) {
    return flagsFor(verb);
  }
  // Đối số 0 là chính động từ, nên đối số CỦA động từ bắt đầu từ 1.
  const position = positionalIndex(committed) - 1;
  if (verb === 'rollout') {
    if (position === 0) {
      return ROLLOUT_SUBS;
    }
    return position === 1
      ? kindsInCluster(objects)
      : names(objectsOfKindToken(objects, lastPositional(committed)));
  }
  if (VERBS_WITH_POD.has(verb)) {
    return position === 0 ? names(objects.filter((object) => object.kind === 'Pod')) : [];
  }
  if (VERBS_WITH_KIND.has(verb)) {
    if (position === 0) {
      return kindsInCluster(objects);
    }
    return position === 1 ? names(objectsOfKindToken(objects, lastPositional(committed))) : [];
  }
  return flagsFor(verb);
}

/**
 * Gợi ý cho phần đang gõ dở của `input`.
 *
 * Trả mảng rỗng khi không có gì đáng gợi — bảng gợi ý rỗng phải BIẾN MẤT, không
 * phải hiện ra một khung trống.
 */
export function suggestTokens(input: string, objects: readonly ObjectView[]): readonly Suggestion[] {
  const atNewToken = input === '' || /\s$/.test(input);
  const tokens = input.split(/\s+/).filter((token) => token !== '');
  const prefix = atNewToken ? '' : (tokens.at(-1) ?? '');
  const committed = atNewToken ? tokens : tokens.slice(0, -1);
  const lowered = prefix.toLowerCase();
  return poolFor(committed, prefix, objects)
    .filter((item) => item.value.toLowerCase().startsWith(lowered))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Thay token đang gõ dở bằng gợi ý, và chừa sẵn một dấu cách cho token kế.
 *
 * `search(/\S+$/)` trả vị trí BẮT ĐẦU của cụm không-trắng cuối cùng — cách duy
 * nhất cắt đúng khi token cuối trùng chữ với một token trước đó (`kubectl get
 * pod pod`), thứ mà `lastIndexOf` trên chuỗi con vẫn đúng nhưng chỉ nhờ may.
 */
export function applySuggestion(input: string, value: string): string {
  if (input === '' || /\s$/.test(input)) {
    return `${input}${value} `;
  }
  return `${input.slice(0, input.search(/\S+$/))}${value} `;
}
