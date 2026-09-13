/**
 * Phân giải một chuỗi NGƯỜI CHƠI GÕ thành một `Oid`.
 *
 * Đây là file đầu tiên của tầng lệnh vì mọi lệnh nhận ref đều đi qua nó:
 * `switch main`, `log HEAD~3`, `show a1b2c3d`, `branch feat v1.0^2`. Tách ra
 * một chỗ vì phép phân giải là nơi ĐẺ RA bài học, chứ không phải một tiện ích
 * dùng chung tình cờ:
 *
 * - `~n` đi theo **cha thứ nhất** n bước; `^n` chọn **cha thứ n**. Đây là bài
 *   G06 và là chỗ người học nhầm nhiều nhất. Hai phép này KHÔNG được gộp: trên
 *   một commit merge, `HEAD~2` và `HEAD^2` trỏ vào hai nhánh khác hẳn nhau, và
 *   một hiện thực gộp chúng sẽ đúng ở mọi lịch sử tuyến tính rồi sai đúng lúc
 *   người chơi cần nó nhất.
 * - `origin/main` phân giải được, còn `origin main` là hai token — nhầm lẫn
 *   kinh niên §5.4 của khảo sát ICTERI. Ở đây `origin/main` ra một
 *   `refs/remotes/origin/main`, tức MỘT ref, và thông báo lỗi của lane lệnh
 *   dựa vào chính sự phân biệt đó.
 *
 * ## Thứ tự phân giải tên: BRANCH THẮNG TAG
 *
 * ⚠ Đây là chỗ game **cố tình khác git thật**, và lệnh của lead (17.D/E brief).
 * `gitrevisions` của git thật xét `refs/tags/<tên>` TRƯỚC `refs/heads/<tên>`,
 * nên khi có cả branch `v1` lẫn tag `v1` thì git chọn tag (và in một cảnh báo
 * "refname is ambiguous").
 *
 * Game chọn ngược lại vì trong 32 level, thứ người chơi gõ tên vào gần như luôn
 * là branch: `switch`, `merge`, `rebase`, `branch -d` đều nhận branch. Một
 * người chơi lỡ đặt tag trùng tên branch rồi thấy `git switch v1` nhảy sang
 * một commit cố định sẽ không suy ra được nguyên nhân — đúng thứ "blind-testing
 * effect" mà §17.I.4 sinh ra để chặn. Cái giá đã biết và chấp nhận: kiến thức
 * ở điểm này không chuyển thẳng sang git thật; bài lý thuyết về tag phải nói ra
 * điều đó.
 *
 * ## Oid: CHỈ KHỚP COMMIT
 *
 * Tra Oid (đầy đủ hoặc rút gọn) chỉ xét object `kind === 'commit'`. Một tiền tố
 * khớp một commit và một blob KHÔNG bị coi là mơ hồ — vì mọi chỗ gọi hàm này
 * đều đang hỏi "commit nào", và mỗi commit kéo theo một tree cùng vài blob nên
 * lọc theo kiểu là thứ giữ cho `ambiguous` còn nghĩa. Hệ quả: một Oid 16 hex có
 * thật trong kho nhưng là blob sẽ trả `not-found` chứ không phải một mã riêng —
 * `RefResolution` cố ý chỉ có ba lý do, và lane lệnh dựng thông báo từ ba lý do
 * đó.
 */

import type { GitError, Oid, RefName, Repo } from './contract.ts';
import { sortedKeys } from './deterministic.ts';
import { gitError, notARefError } from './errors.ts';
import { getCommit } from './objects.ts';
import {
  branchRef,
  headOid,
  isBranch,
  isRemoteRef,
  isTag,
  remoteRef,
  shortRefName,
  tagRef,
} from './repo.ts';

/** Độ dài đầy đủ của một `Oid` — xem `hash.ts`. */
const OID_LENGTH = 16;

/**
 * Ngắn nhất mà một tiền tố Oid còn được nhận.
 *
 * Dưới 4 hex thì gần như mọi tiền tố đều mơ hồ, và tệ hơn: `abc`, `add`, `fee`
 * vừa là hex hợp lệ vừa là tên branch người ta đặt thật. Đặt sàn ở 4 giữ cho
 * tên branch ngắn không bị nuốt thành Oid.
 */
const MIN_ABBREV = 4;

export type RefResolutionFailure = 'not-found' | 'ambiguous' | 'bad-syntax';

export type RefResolution =
  | {
      readonly ok: true;
      readonly oid: Oid;
      /**
       * Ref mà chuỗi đầu vào NÊU TÊN, dạng đầy đủ — hoặc `null` khi đầu vào là
       * một Oid trần, hoặc khi có hậu tố `~`/`^`.
       *
       * ⚠ Hậu tố xoá `ref` về `null` và đó là điều kiện đúng đắn của
       * `checkout`: `git checkout main` bám vào branch, còn `git checkout main~1`
       * thì **detach** — cùng một tên branch ở đầu vào, hai kết quả khác nhau,
       * và chỗ phân biệt duy nhất là trường này.
       */
      readonly ref: RefName | null;
    }
  | { readonly ok: false; readonly reason: RefResolutionFailure };

/** Một bước hậu tố đã phân tích. `~` = lùi theo cha thứ nhất, `^` = chọn cha thứ n. */
interface RevisionStep {
  readonly kind: '~' | '^';
  readonly count: number;
}

interface ParsedRevision {
  readonly base: string;
  readonly steps: readonly RevisionStep[];
}

function isHexString(text: string): boolean {
  if (text.length === 0) return false;
  for (const char of text) {
    const isDigit = char >= '0' && char <= '9';
    const isLower = char >= 'a' && char <= 'f';
    if (!isDigit && !isLower) return false;
  }
  return true;
}

/**
 * Tách `main~2^2` thành base `main` và hai bước.
 *
 * `null` = cú pháp hỏng. Chỉ có ba cách hỏng: base rỗng (`~2`), một ký tự lạ
 * chen vào giữa chuỗi hậu tố (`HEAD~a`), hoặc một số lớn tới mức không còn là
 * số nguyên an toàn.
 *
 * `HEAD~~` và `HEAD^^` là HỢP LỆ (bằng `HEAD~1~1` và `HEAD^1^1`) — bỏ số nghĩa
 * là 1, đúng như git thật.
 */
function parseRevision(input: string): ParsedRevision | null {
  let cursor = 0;
  while (cursor < input.length) {
    const char = input[cursor];
    if (char === '~' || char === '^') break;
    cursor += 1;
  }
  const base = input.slice(0, cursor);
  if (base === '') return null;

  const steps: RevisionStep[] = [];
  while (cursor < input.length) {
    const kind = input[cursor];
    if (kind !== '~' && kind !== '^') return null;
    cursor += 1;

    let digits = '';
    while (cursor < input.length) {
      const char = input[cursor] ?? '';
      if (char < '0' || char > '9') break;
      digits += char;
      cursor += 1;
    }
    const count = digits === '' ? 1 : Number.parseInt(digits, 10);
    if (!Number.isSafeInteger(count)) return null;
    steps.push({ kind, count });
  }
  return { base, steps };
}

/**
 * Mọi commit trong kho mang tiền tố Oid này, đã sắp.
 *
 * Xuất ra ngoài vì thông báo lỗi `ambiguous` cần LIỆT KÊ các ứng viên — nói
 * "mơ hồ" mà không nói mơ hồ giữa những cái nào thì người chơi không có bước
 * tiếp theo nào để đi.
 */
export function commitOidsWithPrefix(repo: Repo, prefix: string): readonly Oid[] {
  if (!isHexString(prefix) || prefix.length < MIN_ABBREV || prefix.length > OID_LENGTH) {
    return [];
  }
  const out: Oid[] = [];
  for (const oid of sortedKeys(repo.objects)) {
    if (!oid.startsWith(prefix)) continue;
    if (getCommit(repo.objects, oid) === null) continue;
    out.push(oid);
  }
  return out;
}

type BaseResolution =
  | { readonly oid: Oid; readonly ref: RefName | null }
  | RefResolutionFailure;

function resolveBaseName(repo: Repo, name: string): BaseResolution {
  // `@` là bí danh của `HEAD` — git thật nhận nó từ 1.8.5 và người chơi gõ nó
  // vì nó ngắn.
  if (name === 'HEAD' || name === '@') {
    const oid = headOid(repo);
    if (oid === null) return 'not-found';
    return { oid, ref: repo.head.type === 'ref' ? repo.head.ref : null };
  }

  // Dạng đầy đủ. Ít người chơi gõ, nhưng bộ chấm và world-spec thì có.
  if (name.startsWith('refs/')) {
    const oid = repo.refs[name];
    return oid === undefined ? 'not-found' : { oid, ref: name };
  }

  // Branch TRƯỚC tag — xem chú thích đầu file, đây là chỗ khác git thật.
  const fromBranch = repo.refs[branchRef(name)];
  if (fromBranch !== undefined) return { oid: fromBranch, ref: branchRef(name) };

  const fromTag = repo.refs[tagRef(name)];
  if (fromTag !== undefined) return { oid: fromTag, ref: tagRef(name) };

  const fromRemote = repo.refs[remoteRef(name)];
  if (fromRemote !== undefined) return { oid: fromRemote, ref: remoteRef(name) };

  const matches = commitOidsWithPrefix(repo, name);
  if (matches.length === 1) {
    const oid = matches[0];
    if (oid !== undefined) return { oid, ref: null };
  }
  if (matches.length > 1) return 'ambiguous';

  return 'not-found';
}

/** Áp một bước hậu tố. `null` = đi hết lịch sử hoặc commit không có cha đó. */
function applyStep(repo: Repo, oid: Oid, step: RevisionStep): Oid | null {
  if (step.kind === '~') {
    let cursor: Oid = oid;
    for (let taken = 0; taken < step.count; taken += 1) {
      const commit = getCommit(repo.objects, cursor);
      const parent = commit?.parents[0];
      if (parent === undefined) return null;
      cursor = parent;
    }
    return cursor;
  }

  const commit = getCommit(repo.objects, oid);
  if (commit === null) return null;
  // `rev^0` là chính commit đó — git thật dùng nó để ép "lấy commit, không lấy
  // tag object". Nhận ở đây vì nó vô hại và vì một người copy lệnh từ StackOverflow
  // sẽ gặp nó.
  if (step.count === 0) return oid;
  return commit.parents[step.count - 1] ?? null;
}

/**
 * Chuỗi người chơi gõ → `Oid`.
 *
 * Nhận: `HEAD` · `@` · tên branch ngắn · ref theo dõi (`origin/main`) · tag ·
 * Oid đầy đủ 16 hex · Oid rút gọn ≥ 4 hex · hậu tố `~n` / `^n` và mọi tổ hợp
 * của chúng (`HEAD~2^2`).
 */
export function resolveRevision(repo: Repo, input: string): RefResolution {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'bad-syntax' };

  const parsed = parseRevision(trimmed);
  if (parsed === null) return { ok: false, reason: 'bad-syntax' };

  const base = resolveBaseName(repo, parsed.base);
  if (typeof base === 'string') return { ok: false, reason: base };

  let oid = base.oid;
  for (const step of parsed.steps) {
    const next = applyStep(repo, oid, step);
    if (next === null) return { ok: false, reason: 'not-found' };
    oid = next;
  }

  // Commit đích phải có thật trong kho. Một ref trỏ vào Oid không tồn tại là
  // trạng thái hỏng chứ không phải trạng thái chơi được, nhưng world-spec sai
  // hoặc một lane khác ghi ẩu đều dựng ra được — bắt ở đây rẻ hơn nhiều so với
  // bắt ở chỗ ai đó đọc `commit.tree` của `null`.
  if (getCommit(repo.objects, oid) === null) return { ok: false, reason: 'not-found' };

  return { ok: true, oid, ref: parsed.steps.length === 0 ? base.ref : null };
}

/**
 * Tên ref dạng ngắn, đã sắp, không lặp — nguyên liệu cho phép tìm tên gần đúng.
 *
 * Có `HEAD` trong danh sách vì `git switch HAED` phải gợi ra `HEAD`, và vì đó
 * là "ref" người chơi gõ nhiều thứ hai sau tên branch.
 *
 * ⚠ NHƯNG chỉ khi HEAD phân giải được. Trên một repo chưa commit lần nào, HEAD
 * trỏ vào một branch chưa sinh ra — liệt kê nó ra sẽ biến câu giải thích tốt
 * nhất của `notARefError` ("Repo này chưa có ref nào — chưa commit lần nào thì
 * cũng chưa có branch nào") thành một câu vô nghĩa là "Ref đang có: `HEAD`",
 * đúng lúc người chơi mới bắt đầu và cần câu kia nhất.
 */
export function knownRefNames(repo: Repo): readonly string[] {
  const seen: Record<string, true> = {};
  if (headOid(repo) !== null) seen['HEAD'] = true;
  for (const ref of sortedKeys(repo.refs)) {
    if (isBranch(ref) || isRemoteRef(ref) || isTag(ref)) seen[shortRefName(ref)] = true;
    else seen[ref] = true;
  }
  return sortedKeys(seen);
}

/**
 * Một `RefResolution` hỏng → một `GitError` đủ ba phần.
 *
 * Gom ở đây thay vì để mỗi lệnh tự dựng: ba lý do hỏng cần ba câu giải thích
 * khác hẳn nhau, và viết lại chúng ở tám chỗ gọi là tám cơ hội để một chỗ nói
 * sai. `context` là câu mở đầu riêng của từng lệnh ("`git switch` cần một
 * branch có thật."), phần còn lại chung.
 */
export function revisionError(
  repo: Repo,
  input: string,
  reason: RefResolutionFailure,
  context: string,
): GitError {
  if (reason === 'bad-syntax') {
    return gitError(
      'bad-usage',
      `\`${input}\` không phải một cách chỉ commit hợp lệ.`,
      `${context} Sau một tên ref chỉ được đi kèm \`~\` hoặc \`^\` và một số: ` +
        '`~n` lùi n bước theo cha THỨ NHẤT, `^n` chọn cha THỨ n. Bỏ số thì mặc định là 1.',
      'Ví dụ: `HEAD~3` (lùi 3 commit), `HEAD^2` (cha thứ hai của một commit merge), `main~2^2`.',
    );
  }

  if (reason === 'ambiguous') {
    const matches = commitOidsWithPrefix(repo, input.trim());
    const listed = matches.map((oid) => `\`${oid}\``).join(', ');
    return gitError(
      'not-a-commit',
      `\`${input}\` khớp ${matches.length} commit khác nhau.`,
      `${context} Oid rút gọn chỉ dùng được khi nó chỉ đúng MỘT object. ` +
        `Tiền tố này đang khớp: ${listed}.`,
      'Gõ thêm vài ký tự nữa cho tới khi chỉ còn một commit khớp.',
    );
  }

  return notARefError(input, knownRefNames(repo), context);
}
