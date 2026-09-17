/**
 * Kiểm tính hợp lệ của DAG mà người chơi soạn: **chu trình** và **phụ thuộc trỏ
 * vào hư không**. Toán thuần trên `WorkflowSpec.dependsOn`, không đụng máy chạy,
 * không đụng thời gian, không đụng ngẫu nhiên.
 *
 * Hai lỗi ở đây là hai lỗi CỨNG (`EvaluationError`), không phải trừ điểm: hợp
 * đồng đã chốt rằng workflow hỏng thì `passes` rỗng và không có ba con số nào để
 * đọc. Đó cũng là lý do file này chạy TRƯỚC bộ lập lịch chứ không nằm trong nó.
 *
 * ⛔ File này KHÔNG kiểm `unschedulable` (`runnerSlots` lớn hơn cả hạng máy).
 * Lỗi đó cần `WorkloadSpec`, tức cần dữ liệu level, nên nó thuộc bộ lập lịch
 * (A.2). Nhánh thứ ba của `EvaluationError` cố ý không được sinh ra ở đây.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LỖI PHẢI TRỎ VỀ ĐÚNG JOB
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Đồ thị có chu trình" là một câu đúng và vô dụng: người chơi có mười hai stage
 * và câu đó không nói họ phải mở dòng nào. `EvaluationError.cycle` mang
 * `stages: readonly StageId[]` đúng vì thế — 19.C.4 tô được đúng các dòng YAML
 * tạo thành vòng, và người chơi sửa một trong số đó là xong.
 *
 * Cùng lý do, `unknown-dependency` là một nhánh RIÊNG chứ không gộp vào chu
 * trình. Hai lỗi này người chơi sửa khác nhau: một cái là gõ nhầm tên (sửa một
 * chữ), một cái là hiểu sai thứ tự công việc (sửa cấu trúc). Gộp chúng lại là
 * bắt người mới gỡ một vòng không tồn tại.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA CHỖ TÍNH TẤT ĐỊNH DỄ RÒ RỈ Ở ĐÂY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Một đồ thị hỏng thường hỏng ở NHIỀU chỗ cùng lúc, nên "lỗi nào được báo" là
 * một lựa chọn, và một lựa chọn phụ thuộc thứ tự mảng là một lựa chọn sai:
 *
 * 1. **Thứ tự duyệt stage.** Luôn theo `StageId` đã sắp bằng `compareKeys`,
 *    KHÔNG theo vị trí trong `WorkflowSpec.stages`. Hợp đồng ghi rõ thứ tự mảng
 *    đó là thứ tự TRÌNH BÀY; nếu nó đi vào đây thì một vòng đọc-ghi YAML của
 *    19.C sắp lại stage sẽ đổi lỗi được báo mà không đổi một chữ nào trong ý
 *    nghĩa workflow.
 * 2. **Thứ tự duyệt cạnh.** Danh sách kề của mỗi stage cũng sắp bằng
 *    `compareKeys`, nên chu trình tìm được không phụ thuộc thứ tự người chơi gõ
 *    `dependsOn`.
 * 3. **`localeCompare`.** Không dùng, ở đâu cũng vậy — ràng buộc 2 của hợp đồng.
 *    Ở đây hậu quả là "cùng workflow, hai máy báo hai lỗi khác nhau".
 */

import { compareKeys } from '../git/deterministic.ts';
import type { EvaluationError, StageId, WorkflowSpec } from './contract.ts';
import { idDict } from './id-dict.ts';

/** Nhánh `unknown-dependency` của `EvaluationError`, tách ra để khỏi lặp hình dạng. */
export type UnknownDependencyError = Extract<EvaluationError, { readonly kind: 'unknown-dependency' }>;

/**
 * Danh sách kề theo chiều **`dependsOn`**: `adj[a]` chứa các stage mà `a` chờ.
 *
 * Chú ý chiều: đây KHÔNG phải chiều thời gian. Cạnh thời gian chạy ngược lại
 * (`b` xong trước rồi `a` mới chạy). Giữ chiều `dependsOn` vì đó là chiều người
 * chơi gõ, và vì nó làm danh sách chu trình đọc xuôi được (xem `findCycle`).
 *
 * Hai chuyện xử lý tại đây, cả hai đều tất định:
 *
 * - **Phụ thuộc lặp** trong cùng một stage bị gộp. `dependsOn: ['a', 'a']` là
 *   thừa chứ không phải lỗi, và để nó lại chỉ làm mọi vòng lặp dưới chạy hai lần.
 * - **Id stage trùng** — hai mục trong `stages` cùng `id`. Hợp đồng KHÔNG có
 *   nhánh lỗi cho trường hợp này (xem báo cáo lane), nên ở đây lấy HỢP các cạnh
 *   của mọi mục mang id đó. Chọn một mục và bỏ mục kia là bịa ra ngữ nghĩa, còn
 *   bỏ sót một cạnh là bỏ sót một chu trình — hợp là phía an toàn.
 *
 *   ⚠ **Đường YAML không còn đẻ ra hình dạng này** (19.C.4, 2026-09-16). Plan
 *   P19 §19.C giả định "YAML thì làm ra nó dễ dàng"; đo lại thì KHÔNG: bộ quét
 *   dựng map bằng `map[khoá] = giá trị`, nên hai job trùng tên gộp thành một
 *   trước khi `yaml-read.ts` nhìn thấy — mất dữ liệu im lặng, chứ không phải hai
 *   mục cùng id. `core/yaml.ts` nay từ chối khoá trùng, nên lối vào đó đã đóng.
 *   Hợp-các-cạnh ở lại vì `WorkflowSpec` còn viết TAY được (level là mã nguồn),
 *   và ở đó kiểu vẫn cho phép hai mục cùng id.
 */
function adjacency(workflow: WorkflowSpec): Readonly<Record<StageId, readonly StageId[]>> {
  const seen: Record<StageId, Record<StageId, true>> = idDict();
  for (const stage of workflow.stages) {
    const bucket = seen[stage.id] ?? idDict<true>();
    seen[stage.id] = bucket;
    for (const dep of stage.dependsOn) bucket[dep] = true;
  }

  const out: Record<StageId, readonly StageId[]> = idDict();
  for (const id of Object.keys(seen).sort(compareKeys)) {
    const bucket = seen[id];
    out[id] = bucket === undefined ? [] : Object.keys(bucket).sort(compareKeys);
  }
  return out;
}

/**
 * Tìm một `dependsOn` trỏ tới stage không tồn tại.
 *
 * Trả về mục ĐẦU TIÊN theo thứ tự (`stageId` đã sắp, rồi thứ tự người chơi khai
 * trong `dependsOn`). Trong một stage thì giữ thứ tự khai chứ không sắp: đó là
 * thứ tự người chơi nhìn thấy trên màn hình, và nó đã tất định sẵn (một mảng),
 * nên không cần đánh đổi gì để có tính tất định ở đây.
 *
 * ⚠ Nhiều lỗi cùng lúc chỉ báo được một. Đó là hình dạng của `EvaluationError`
 * chứ không phải lựa chọn của file này — hợp đồng cho `error` một giá trị, không
 * cho một mảng. Người chơi sửa một cái rồi chạy lại là thấy cái tiếp theo.
 */
export function findUnknownDependency(workflow: WorkflowSpec): UnknownDependencyError | null {
  return findAllUnknownDependencies(workflow)[0] ?? null;
}

/**
 * MỌI `dependsOn` trỏ vào hư không, không chỉ cái đầu tiên.
 *
 * Tồn tại vì hai tầng trên muốn hai thứ khác nhau từ cùng một luật, và nhân đôi
 * luật là cách chúng bắt đầu bất đồng ý trong im lặng:
 *
 * - **Engine** chỉ mang được MỘT lỗi (`EvaluationError` cho `error` một giá trị,
 *   không một mảng), nên `findUnknownDependency` lấy phần tử đầu.
 * - **Ô soạn YAML** (19.C.4/19.E) gạch chân TẤT CẢ cùng lúc. Báo từng cái một
 *   bắt người chơi chạy lại sau mỗi lần sửa một chữ.
 *
 * Thứ tự trả về tất định và giống hệt thứ tự cũ: `StageId` đã sắp bằng
 * `compareKeys`, rồi thứ tự khai trong `dependsOn` của stage đó.
 */
export function findAllUnknownDependencies(workflow: WorkflowSpec): readonly UnknownDependencyError[] {
  const known: Record<StageId, true> = idDict();
  for (const stage of workflow.stages) known[stage.id] = true;

  const byId: Record<StageId, readonly StageId[]> = idDict();
  for (const stage of workflow.stages) {
    const before = byId[stage.id];
    byId[stage.id] = before === undefined ? stage.dependsOn : [...before, ...stage.dependsOn];
  }

  const out: UnknownDependencyError[] = [];
  for (const id of Object.keys(byId).sort(compareKeys)) {
    for (const dep of byId[id] ?? []) {
      if (!Object.hasOwn(known, dep)) {
        out.push({ kind: 'unknown-dependency', stage: id, missing: dep });
      }
    }
  }
  return out;
}

/**
 * Tìm một chu trình và trả về **đúng các stage trong vòng, theo thứ tự đi vòng**.
 *
 * ⛔ Chiều đọc của mảng trả về — 19.C.4 phụ thuộc vào nó: phần tử `k`
 * **phụ thuộc vào** phần tử `k + 1`, và phần tử cuối phụ thuộc ngược lại phần tử
 * đầu. Nghĩa là `['a', 'b', 'c']` đọc là *"a cần b, b cần c, c cần a"*. Đó là
 * chiều người chơi gõ trong YAML, nên tô sáng theo mảng này là tô đúng những
 * dòng `dependsOn` gây ra vòng.
 *
 * Tự phụ thuộc (`dependsOn` chứa chính nó) là chu trình độ dài 1 và trả về
 * `['a']`. Không tách thành một nhánh lỗi riêng: người chơi sửa nó y hệt cách
 * sửa một vòng dài hơn — xoá một cạnh.
 *
 * **Chu trình nào được chọn khi có nhiều.** Chu trình đầu tiên mà một lượt DFS
 * gặp, với gốc duyệt theo `StageId` đã sắp và cạnh theo danh sách kề đã sắp. Nó
 * tất định và nó là một vòng THẬT; nó không nhất thiết là vòng NGẮN NHẤT, và
 * việc đó là cố ý — tìm vòng ngắn nhất tốn một lượt duyệt theo bề rộng cho mỗi
 * đỉnh, để đổi lấy một thông điệp mà người chơi vẫn sửa y như cũ.
 */
export function findCycle(workflow: WorkflowSpec): readonly StageId[] | null {
  const adj = adjacency(workflow);
  const ids = Object.keys(adj).sort(compareKeys);

  /* 'open' = đang nằm trên ngăn xếp hiện tại · 'done' = đã duyệt xong, sạch. */
  const state: Record<StageId, 'open' | 'done'> = idDict();
  const path: StageId[] = [];

  function visit(id: StageId): readonly StageId[] | null {
    const mark = state[id];
    if (mark === 'done') return null;
    if (mark === 'open') {
      /*
       * Gặp lại một đỉnh đang mở ⇒ nó chắc chắn nằm trên `path`, và đoạn từ đó
       * tới cuối CHÍNH LÀ vòng. Cắt chứ không trả cả `path`: phần đầu `path` là
       * đường đi TỚI vòng, không thuộc vòng, và báo thừa là chỉ sai dòng cho
       * người chơi.
       */
      return path.slice(path.indexOf(id));
    }

    state[id] = 'open';
    path.push(id);
    for (const next of adj[id] ?? []) {
      /*
       * Cạnh trỏ tới một stage không tồn tại thì bỏ qua: nó không thể nằm trong
       * vòng nào (đỉnh đó không có cạnh đi ra). `findUnknownDependency` là chỗ
       * báo nó, và `validateGraph` gọi cái đó trước.
       */
      if (!Object.hasOwn(adj, next)) continue;
      const found = visit(next);
      if (found !== null) return found;
    }
    path.pop();
    state[id] = 'done';
    return null;
  }

  for (const id of ids) {
    const found = visit(id);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Cổng hợp lệ của đồ thị. `null` = đồ thị chạy được.
 *
 * **Thứ tự kiểm là một quyết định, không phải ngẫu nhiên:** phụ thuộc-không-tồn-tại
 * được báo TRƯỚC chu trình. Hai lỗi độc lập nhau về mặt toán (một cạnh trỏ vào hư
 * không không thể nằm trong vòng nào), nên đây thuần là chọn cái nào hữu ích hơn
 * khi cả hai cùng có. Gõ nhầm tên là lỗi thường gặp hơn và sửa rẻ hơn; và quan
 * trọng hơn, một cái tên gõ nhầm thường ĐANG che đi cạnh mà người chơi định viết
 * — báo chu trình trước là bắt họ đi gỡ một vòng có thể biến mất ngay khi sửa
 * chữ đó.
 */
export function validateGraph(workflow: WorkflowSpec): EvaluationError | null {
  const unknown = findUnknownDependency(workflow);
  if (unknown !== null) return unknown;

  const cycle = findCycle(workflow);
  if (cycle !== null) return { kind: 'cycle', stages: cycle };

  return null;
}
