/**
 * Cứu hộ: `git reflog`, truy vấn *với-tới-được*, `git fsck --lost-found`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ ĐẤT TRỐNG ĐO ĐƯỢC, KHÔNG PHẢI MỘT TÍNH NĂNG PHỤ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design §3.1 đếm trực tiếp trên mã nguồn hai nền tảng đang có:
 *
 *   | khái niệm | Learn Git Branching | gitmastery.me |
 *   |-----------|---------------------|---------------|
 *   | `reflog`  | **0 / 71 file**     | 11 file       |
 *   | `stash`   | **0 file**          | 22 file       |
 *   | `bisect`  | **0 file**          | 12 file       |
 *
 * LGB *không thể* có reflog, và đó không phải thiếu sót của nó: mô hình cây
 * thuần của nó không tách **lưu trữ** khỏi **với-tới-được**, nên "commit đã mất"
 * không có chỗ tồn tại. Engine này tách (xem chú thích đầu `objects.ts`: kho
 * không bao giờ xoá phần tử), nên cả chương 3 — 8 level — sống được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ REFLOG **KHÔNG** LÀ GỐC CỦA PHÉP TÍNH REACHABILITY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đây là chỗ engine **cố ý lệch khỏi git thật**, và lệch có lý do.
 *
 * `git fsck` thật coi reflog là gốc theo mặc định (phải `--no-reflogs` mới bỏ),
 * nên sau `git reset --hard` commit bị bỏ lại KHÔNG hiện ra là dangling. Ở đây
 * thì có. Vì sao: vị từ chấm bài `commitUnreachable` tồn tại để hỏi đúng một câu
 * — *"còn ref nào trỏ tới commit này không?"* — và đó là câu mà bài G26 dạy.
 * Tính reflog vào gốc sẽ làm câu trả lời luôn là "còn", và cả chương 3 mất luôn
 * điều kiện thắng.
 *
 * Nói cách khác: reflog ở game này là **đường cứu hộ**, không phải **dây neo**.
 * Nó nhớ commit nằm ở đâu; nó không giữ commit lại.
 *
 * Gốc thật sự — mọi ref, `headOid` (**quan trọng nhất khi detached**, vì lúc đó
 * HEAD là thứ duy nhất giữ commit và `repo.refs` không hề nhắc tới nó), mọi
 * `stash[].oid`, và `pending.originalHead`.
 *
 * ⛔ Danh sách đó do `predicates.ts` sở hữu qua `liveRoots()`, và file này IMPORT
 * chứ không có bản riêng. Hai định nghĩa "với tới được" khác nhau nghĩa là vị từ
 * chấm bài và lệnh `git fsck` nói hai điều khác nhau về CÙNG một commit — người
 * chơi thấy `fsck` liệt kê một commit là mồ côi trong khi bài vẫn chấm nó là còn
 * sống, và không ai chẩn đoán nổi.
 */

import type { Oid, OutputLine, RefName, Repo, RepoOpResult } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { nearestNames } from '../errors.ts';
import { getCommit, reachableFrom } from '../objects.ts';
import { liveRoots } from '../predicates.ts';
import { readReflog, shortRefName } from '../repo.ts';
import { shortOid } from '../hash.ts';
import { line, ok } from './reset.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. REACHABILITY
// ═══════════════════════════════════════════════════════════════════════════

/** Commit này còn ref/HEAD/stash/pending nào với tới được không. */
export function isReachable(repo: Repo, oid: Oid): boolean {
  return reachableFrom(repo.objects, liveRoots(repo)).has(oid);
}

/**
 * Commit CÓ trong kho mà không gốc nào với tới. Mảng đã sắp, **không** phải
 * `Set` — kết quả này đi vào output và vào test, nên thứ tự phải ổn định.
 *
 * Blob và tree mồ côi bị bỏ qua: chúng có mặt đầy rẫy sau mỗi lần `add` rồi đổi
 * ý, và liệt kê chúng ra chỉ làm ngập đúng thứ người chơi đang tìm.
 */
export function unreachableCommits(repo: Repo): readonly Oid[] {
  const live = reachableFrom(repo.objects, liveRoots(repo));
  const out: Oid[] = [];
  for (const oid of sortedKeys(repo.objects)) {
    if (live.has(oid)) continue;
    if (getCommit(repo.objects, oid) === null) continue;
    out.push(oid);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. `git reflog`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `git reflog [<ref>]`. `ref === null` ⇒ reflog của `HEAD`, đúng như git thật.
 *
 * ⚠ Ref đã bị XOÁ thì nhật ký RIÊNG của nó mất theo (`deleteRef` xoá cả hai, đúng
 * như git thật xoá `.git/logs/refs/heads/<nhánh>`). Nên `git reflog feature` sau
 * `git branch -D feature` KHÔNG còn gì, và đó là hành vi đúng: đường cứu thật của
 * bài G27 là reflog của **HEAD** — HEAD đã từng trỏ vào commit đó lúc người chơi
 * còn đứng trên nhánh, và dòng ấy còn nguyên.
 *
 * ⛔ Và hàm này KHÔNG BAO GIỜ trả lỗi. Một ref không còn (hay chưa từng có) cho ra
 * một câu trả lời RỖNG kèm chỉ đường, không phải `not-a-ref`. Lý do: người chơi ở
 * bài G27 gõ đúng thứ họ tưởng sẽ chạy, và ném lỗi vào mặt họ ở đúng khoảnh khắc
 * đó là tái tạo lại "blind-testing effect" mà §17.I.4 sinh ra để chống. Gợi ý tên
 * gần đúng vẫn còn — nó chỉ chuyển từ `suggest` của một lỗi sang một dòng `hint`.
 */
export function gitReflog(repo: Repo, ref: RefName | null): RepoOpResult {
  const target: RefName = ref ?? 'HEAD';
  const entries = readReflog(repo, target);
  const label = target === 'HEAD' ? 'HEAD' : shortRefName(target);

  if (entries.length === 0) {
    if (target === 'HEAD' || Object.hasOwn(repo.refs, target)) {
      return ok(repo, [line(`\`${label}\` chưa từng dịch chuyển lần nào.`, 'hint')]);
    }
    return ok(repo, deletedRefAnswer(repo, label));
  }

  const output: OutputLine[] = entries.map((entry, i) =>
    line(`${shortOid(entry.to)} ${label}@{${i}}: ${entry.op}: ${entry.message}`),
  );
  output.push(
    line(
      `\`${label}@{0}\` là chỗ hiện tại. Số càng lớn càng lùi về quá khứ.`,
      'hint',
    ),
  );
  return ok(repo, output);
}

/** Câu trả lời thành thật cho một ref không còn: rỗng, kèm đường đi tiếp. */
function deletedRefAnswer(repo: Repo, label: string): readonly OutputLine[] {
  const output: OutputLine[] = [
    line(`Không có nhật ký nào cho \`${label}\`.`, 'warn'),
    line(
      'Ref này không tồn tại. Nếu nó vừa bị xoá thì nhật ký riêng của nó đã mất theo — git thật cũng vậy.',
      'hint',
    ),
    line(
      'Đường cứu là nhật ký của HEAD: gõ `git reflog` (không tham số) để xem HEAD đã từng đứng ở đâu.',
      'hint',
    ),
  ];
  const near = nearestNames(label, sortedKeys(repo.refs).map(shortRefName), 1)[0];
  if (near !== undefined) output.push(line(`Hoặc ý bạn là \`${near}\`?`, 'hint'));
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. `git fsck`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `git fsck [--lost-found]` — bài G30.
 *
 * Khác git thật một chỗ có chủ ý: mỗi dòng `dangling commit` kèm luôn message
 * của commit đó. Git thật chỉ in sha, và người học nhìn một danh sách sha trần
 * thì không có cách nào biết cái nào là thứ mình vừa mất — họ phải `git show`
 * từng cái. Ở một công cụ dạy học thì vòng đó là chi phí thuần tuý.
 */
export function gitFsck(repo: Repo, lostFound: boolean): RepoOpResult {
  const dangling = unreachableCommits(repo);
  if (dangling.length === 0) {
    return ok(repo, [
      line('Không có object mồ côi nào — mọi commit đều còn ref với tới được.', 'success'),
    ]);
  }

  const output: OutputLine[] = [];
  for (const oid of dangling) {
    const commit = getCommit(repo.objects, oid);
    output.push(line(`dangling commit ${oid}`, 'warn'));
    if (commit !== null) output.push(line(`    ${commit.message}`));
  }
  output.push(
    line(
      `${dangling.length} commit không còn ref nào trỏ tới — chúng VẪN nằm trong kho, chỉ là không ai gọi tên.`,
      'hint',
    ),
  );
  if (lostFound) {
    // Oid ĐẦY ĐỦ, không rút gọn: dòng gợi ý này được copy-paste thẳng, và bộ
    // phân giải ref chưa chắc nhận dạng viết tắt — một gợi ý dán vào thì lỗi là
    // một gợi ý tệ hơn không có.
    const first = dangling[0] ?? '';
    output.push(line(`Neo một cái lại bằng \`git branch cuu-ho ${first}\`.`, 'hint'));
  }
  return ok(repo, output);
}

/** Dạng có cờ, tên đúng như lệnh người chơi gõ. */
export function gitFsckLostFound(repo: Repo): RepoOpResult {
  return gitFsck(repo, true);
}
