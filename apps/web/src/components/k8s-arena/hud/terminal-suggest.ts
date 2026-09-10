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
const MAX_SUGGESTIONS = 12;

/** Thứ tự lấy từ `KUBECTL_VERBS` của engine — không có danh sách thứ hai để lệch. */
const VERBS: readonly Suggestion[] = KUBECTL_VERBS.map((verb) => ({
  value: verb,
  hint: VERB_HINTS[verb],
}));

const VERBS_WITH_KIND = new Set(['get', 'describe', 'delete', 'edit', 'scale']);
const VERBS_WITH_POD = new Set(['logs', 'exec']);

/**
 * Các ĐỐI SỐ của lệnh, tức token đã bỏ cờ và giá trị đi kèm cờ.
 *
 * Trả cả danh sách chứ không chỉ đếm: mọi câu hỏi mà `poolFor` cần đặt —
 * "động từ là gì", "đang gõ đối số thứ mấy", "loại vừa gõ là gì" — đều là câu
 * hỏi về CÙNG danh sách này. Bản trước có hai hàm riêng, mỗi hàm đếm theo một
 * quy ước, và chỗ chúng bất đồng chính là chỗ gợi ý biến mất.
 *
 * `kubectl -n prod get pods` là cú pháp hợp lệ, nên "token thứ ba" và "đối số
 * thứ nhất" không phải một thứ.
 */
function positionals(committed: readonly string[]): readonly string[] {
  const out: string[] = [];
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
    out.push(token);
  }
  return out;
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
  /*
   * Mọi phép đếm dưới đây chạy trên DANH SÁCH ĐỐI SỐ, không trên mảng token thô.
   *
   * ⚠ Đây là chỗ hai lỗi cùng một họ đã nằm. `kubectl -n prod get pods` là cú
   * pháp hợp lệ, nên "token thứ hai" KHÔNG phải "động từ": bản trước đọc
   * `committed[1]` và với dòng trên nó nhận về `-n`, rồi gợi ý cờ của một động
   * từ không tồn tại. Cùng lỗi đó, ở một mức khác, làm gợi ý loại/tên biến mất
   * hoàn toàn (xem chú thích của `position`).
   */
  const last = committed.at(-1);
  if (last === '-n' || last === '--namespace') {
    return [
      ...new Set([
        'default',
        ...objects
          .map((object) => (object.kind === 'Namespace' ? object.name : object.namespace))
          .filter(Boolean),
      ]),
    ]
      .sort()
      .map((value) => ({ value, hint: 'Namespace' }));
  }
  if (last === '-o' || last === '--output')
    return ['wide', 'yaml'].map((value) => ({ value, hint: 'Định dạng đầu ra' }));
  const args = positionals(committed);
  const head = args[0];
  if (head === undefined) {
    return [{ value: 'kubectl', hint: 'Mọi lệnh trong game bắt đầu bằng kubectl' }];
  }
  if (head !== 'kubectl' && head !== 'k') {
    return [];
  }
  const verb = args[1];
  if (verb === undefined) {
    return VERBS;
  }
  if (prefix.startsWith('-')) {
    return flagsFor(verb);
  }
  /*
   * Đối số thứ mấy CỦA ĐỘNG TỪ. Trừ 2 vì `args` còn chứa cả `kubectl` lẫn động từ.
   *
   * ⚠ Bản trước trừ 1, và hệ quả là gợi ý LOẠI TÀI NGUYÊN và TÊN OBJECT không
   * bao giờ xuất hiện — hai nhóm gợi ý hữu ích nhất trong cả bộ. Gõ `kubectl get`
   * rồi dấu cách cho `position === 1`, rơi vào nhánh "tên object"; nhánh đó tra
   * loại bằng một hàm đếm theo quy ước KHÁC (đã bỏ `kubectl` và động từ), nhận
   * về chuỗi rỗng, `resolveKind('')` trả `null`, và danh sách rỗng. Rỗng chứ
   * không sai, nên nó hỏng hoàn toàn im lặng: người chơi chỉ thấy gợi ý lúc gõ
   * động từ rồi thôi. Đo trực tiếp 2026-09-09 với `kubectl get po`.
   */
  const position = args.length - 2;
  if (verb === 'rollout') {
    if (position === 0) {
      return ROLLOUT_SUBS;
    }
    return position === 1
      ? kindsInCluster(objects)
      : names(objectsOfKindToken(objects, args.at(-1) ?? ''));
  }
  if (VERBS_WITH_POD.has(verb)) {
    return position === 0 ? names(objects.filter((object) => object.kind === 'Pod')) : [];
  }
  if (VERBS_WITH_KIND.has(verb)) {
    if (position === 0) {
      return kindsInCluster(objects);
    }
    return position === 1 ? names(objectsOfKindToken(objects, args.at(-1) ?? '')) : [];
  }
  return flagsFor(verb);
}

/**
 * Gợi ý cho phần đang gõ dở của `input`.
 *
 * Trả mảng rỗng khi không có gì đáng gợi — bảng gợi ý rỗng phải BIẾN MẤT, không
 * phải hiện ra một khung trống.
 */
export function suggestTokens(
  input: string,
  objects: readonly ObjectView[],
): readonly Suggestion[] {
  const atNewToken = input === '' || /\s$/.test(input);
  const tokens = input.split(/\s+/).filter((token) => token !== '');
  const prefix = atNewToken ? '' : (tokens.at(-1) ?? '');
  const committed = atNewToken ? tokens : tokens.slice(0, -1);
  const lowered = prefix.toLowerCase();
  return [
    ...new Map(poolFor(committed, prefix, objects).map((item) => [item.value, item])).values(),
  ]
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
