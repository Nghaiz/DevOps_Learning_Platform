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
 * Gốc thật sự, ĐỦ danh sách — thiếu một cái là báo oan một commit đang sống:
 *
 *   1. mọi ref trong `repo.refs` (kể cả `refs/remotes/origin/*` và `refs/tags/*`)
 *   2. `headOid(repo)` — **quan trọng nhất khi detached**, vì lúc đó HEAD là thứ
 *      duy nhất giữ commit và `repo.refs` không hề nhắc tới nó
 *   3. mọi `stash[].oid`
 *   4. mọi Oid mà một `pending` op đang tham chiếu — `--abort` quay về được thì
 *      commit đó đang sống theo đúng nghĩa
 */

import type { GitError, Oid, OutputLine, RefName, Repo } from '../contract.ts';
import { compareKeys, sortedKeys } from '../deterministic.ts';
import { notARefError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { getCommit, reachableFrom } from '../objects.ts';
import { headOid, readReflog, shortRefName } from '../repo.ts';
import { fail, line, ok, type GitOpResult } from './reset.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. REACHABILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mọi Oid neo một commit lại. Trả mảng ĐÃ SẮP — thứ tự không ảnh hưởng kết quả
 * của `reachableFrom`, nhưng một hàm public trả thứ tự đổi theo thứ tự chèn là
 * đúng loại bất định §2.2 mục 3 cảnh báo, và nó sẽ cắn ở một test rất lâu sau.
 */
export function reachableRoots(repo: Repo): readonly Oid[] {
  const roots: Oid[] = [];

  for (const ref of sortedKeys(repo.refs)) {
    const oid = repo.refs[ref];
    if (oid !== undefined) roots.push(oid);
  }

  const head = headOid(repo);
  if (head !== null) roots.push(head);

  for (const entry of repo.stash) roots.push(entry.oid);

  const pending = repo.pending;
  if (pending !== null) {
    roots.push(pending.originalHead);
    switch (pending.kind) {
      case 'merge':
        roots.push(pending.theirs);
        break;
      case 'rebase':
        roots.push(pending.onto);
        for (const step of pending.remaining) roots.push(step.oid);
        break;
      case 'cherry-pick':
        for (const pick of pending.picks) roots.push(pick);
        break;
      case 'revert':
        roots.push(pending.target);
        break;
    }
  }

  return [...roots].sort(compareKeys);
}

/** Commit này còn ref/HEAD/stash/pending nào với tới được không. */
export function isReachable(repo: Repo, oid: Oid): boolean {
  return reachableFrom(repo.objects, reachableRoots(repo)).has(oid);
}

/**
 * Commit CÓ trong kho mà không gốc nào với tới. Mảng đã sắp, **không** phải
 * `Set` — kết quả này đi vào output và vào test, nên thứ tự phải ổn định.
 *
 * Blob và tree mồ côi bị bỏ qua: chúng có mặt đầy rẫy sau mỗi lần `add` rồi đổi
 * ý, và liệt kê chúng ra chỉ làm ngập đúng thứ người chơi đang tìm.
 */
export function unreachableCommits(repo: Repo): readonly Oid[] {
  const live = reachableFrom(repo.objects, reachableRoots(repo));
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
 * ⚠ Ref đã bị XOÁ vẫn đọc được reflog, và đó là cả bài G27: `git branch -D
 * feature` bỏ con trỏ nhưng `deleteRef()` giữ lại nhật ký dịch chuyển, nên
 * `git reflog feature` vẫn nói commit cuối của nó nằm ở đâu. Nên phép kiểm ở
 * đây hỏi "có nhật ký không", KHÔNG hỏi "ref có tồn tại không" — đảo hai câu
 * hỏi đó là làm bài G27 không giải được.
 */
export function gitReflog(repo: Repo, ref: RefName | null): GitOpResult {
  const target: RefName = ref ?? 'HEAD';
  const entries = readReflog(repo, target);
  const label = target === 'HEAD' ? 'HEAD' : shortRefName(target);

  if (entries.length === 0) {
    if (target !== 'HEAD' && !Object.hasOwn(repo.refs, target)) {
      return fail(repo, unknownReflogRef(repo, target));
    }
    return ok(repo, [line(`\`${label}\` chưa từng dịch chuyển lần nào.`, 'hint')]);
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

function unknownReflogRef(repo: Repo, target: RefName): GitError {
  const known = sortedKeys(repo.refs).map(shortRefName);
  return notARefError(
    shortRefName(target),
    known,
    'Ref này chưa từng tồn tại, nên cũng chưa từng có nhật ký dịch chuyển nào. (Một ref đã bị xoá thì KHÁC: nhật ký của nó ở lại, và `git reflog` vẫn đọc được.)',
  );
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
export function gitFsck(repo: Repo, lostFound: boolean): GitOpResult {
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
export function gitFsckLostFound(repo: Repo): GitOpResult {
  return gitFsck(repo, true);
}
