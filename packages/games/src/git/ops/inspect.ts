/**
 * `log` · `show` — hai lệnh CHỈ ĐỌC.
 *
 * Không hàm nào ở đây trả về một `Repo` khác với cái nhận vào, và điều đó là
 * một bất biến chứ không phải một sự trùng hợp: `GitWorld.logicalTime` chỉ tăng
 * với lệnh CÓ TÁC DỤNG, nên một lệnh nhìn quanh mà đổi trạng thái sẽ làm bot
 * đồng đội hành động chỉ vì người chơi cẩn thận (xem `contract.ts` §4). Cả
 * `blobOid` lẫn `diffContents` đều băm mà không ghi vào kho, nên `log`/`show`
 * gõ bao nhiêu lần cũng không làm `ObjectStore` phình ra.
 *
 * ## `--graph` ở đây cố tình THÔ
 *
 * Nó in `*` cho mỗi commit và `|\` sau một commit merge — đủ để thấy "có chỗ
 * này rẽ nhánh", không hơn. Thuật toán xếp làn của `git log --graph` thật (kéo
 * cột, nối `|/`, `|\`) là một bài toán bố cục riêng, và ở game này bố cục đã có
 * chủ: `core/layout/` tính toạ độ cho renderer 2D SVG và 3D (`GitView`). Viết
 * một bản xếp làn thứ hai bằng ký tự ASCII ở đây là dựng một nguồn sự thật thứ
 * hai cho cùng một câu hỏi "lịch sử này hình gì".
 */

import type { Oid, OutputLine, Repo } from '../contract.ts';
import { compareKeys, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { commitContents, firstParentChain, getCommit, reachableFrom } from '../objects.ts';
import { resolveRevision, revisionError } from '../refs-resolve.ts';
import { headOid, refsAt, shortRefName } from '../repo.ts';
import {
  diffContents,
  line,
  opFail,
  opOk,
  renderDiffPairs,
  type DiffBodyRenderer,
  type RepoOpResult,
} from './basic.ts';

/**
 * Chưa có commit nào để xem.
 *
 * Git thật cũng coi đây là lỗi (`fatal: your current branch 'main' does not
 * have any commits yet`), và game giữ nguyên điều đó — nhưng nói ra nguyên
 * nhân: HEAD trỏ vào một branch CHƯA SINH RA. Đó là bài G04, và một dòng "không
 * có gì" sẽ bỏ lỡ đúng chỗ dạy được.
 */
function emptyHistoryError(repo: Repo): ReturnType<typeof gitError> {
  const where = repo.head.type === 'ref' ? `\`${shortRefName(repo.head.ref)}\`` : 'HEAD';
  return gitError(
    'not-a-commit',
    'Chưa có commit nào để xem.',
    `HEAD đang trỏ vào ${where}, nhưng branch đó chưa tồn tại — nó chỉ ra đời cùng commit đầu tiên. Lịch sử rỗng không phải lỗi của bạn, chỉ là chưa có gì trong đó.`,
    'Tạo commit đầu tiên: `git add .` rồi `git commit -m "commit đầu tiên"`.',
  );
}

/**
 * Nhãn ref bám vào một commit, dạng `(HEAD -> main, origin/main, v1.0)`.
 *
 * HEAD đứng trước và mang mũi tên sang branch nó bám — đúng cách git thật in,
 * và nó là cách RẺ NHẤT để trả lời câu hỏi thường trực của người học: "tôi đang
 * ở đâu trong cái đống này".
 */
function decorate(repo: Repo, oid: Oid): string {
  const names: string[] = [];
  const currentBranch = repo.head.type === 'ref' ? shortRefName(repo.head.ref) : null;

  if (headOid(repo) === oid) {
    names.push(currentBranch === null ? 'HEAD' : `HEAD -> ${currentBranch}`);
  }
  for (const name of refsAt(repo, oid)) {
    if (headOid(repo) === oid && name === currentBranch) continue;
    names.push(name);
  }
  return names.length === 0 ? '' : ` (${names.join(', ')})`;
}

/** Mọi commit với tới được từ MỌI ref, mới nhất trước. */
function allCommitsNewestFirst(repo: Repo): readonly Oid[] {
  const roots: Oid[] = [];
  for (const ref of sortedKeys(repo.refs)) {
    const oid = repo.refs[ref];
    if (oid !== undefined) roots.push(oid);
  }
  const head = headOid(repo);
  if (head !== null) roots.push(head);

  const reachable = [...reachableFrom(repo.objects, roots)];
  // Sắp theo đồng hồ logic giảm dần, hoà thì phân giải bằng Oid. Cần cả hai vế:
  // `reachableFrom` trả một `Set` mà thứ tự lặp là thứ tự CHÈN, nên không có
  // phép sắp toàn phần ở đây thì `git log --all` in ra hai thứ tự khác nhau cho
  // hai đường dựng cùng một repo.
  return reachable.sort((left, right) => {
    const leftTime = getCommit(repo.objects, left)?.logicalTime ?? 0;
    const rightTime = getCommit(repo.objects, right)?.logicalTime ?? 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return compareKeys(right, left);
  });
}

export interface LogOptions {
  /** Bắt đầu từ đâu. Mặc định `HEAD`. */
  readonly rev?: string | undefined;
  readonly oneline?: boolean | undefined;
  readonly graph?: boolean | undefined;
  /** Đi từ MỌI ref, không chỉ theo cha thứ nhất của một ref. */
  readonly all?: boolean | undefined;
  /** `-n`. Dừng sau N commit. */
  readonly max?: number | undefined;
}

/**
 * `git log`.
 *
 * ⚠ Mặc định đi theo **cha thứ nhất**, không duyệt cả đồ thị. Đó là điều làm
 * `git log` của một branch đọc ra như một dòng thời gian thẳng kể cả sau khi đã
 * merge vài lần, và là lý do `HEAD~5` nghĩa là "lùi 5 bước trên dòng đó" chứ
 * không phải "5 commit gần nhất theo thời gian". `--all` mới là chế độ nhìn cả
 * đồ thị.
 */
export function gitLog(repo: Repo, options: LogOptions = {}): RepoOpResult {
  const max = options.max;
  if (max !== undefined && (!Number.isSafeInteger(max) || max < 0)) {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        `\`-n ${String(max)}\` không phải một số commit hợp lệ.`,
        '`-n` nhận một số nguyên không âm: số commit tối đa muốn in ra.',
        'Ví dụ: `git log -n 5`',
      ),
    );
  }

  let oids: readonly Oid[];
  if (options.all === true) {
    oids = allCommitsNewestFirst(repo);
    if (oids.length === 0) return opFail(repo, emptyHistoryError(repo));
  } else {
    const rev = options.rev ?? 'HEAD';
    const resolved = resolveRevision(repo, rev);
    if (!resolved.ok) {
      if (options.rev === undefined && headOid(repo) === null) {
        return opFail(repo, emptyHistoryError(repo));
      }
      return opFail(repo, revisionError(repo, rev, resolved.reason, '`git log` đi ngược từ một commit có thật.'));
    }
    oids = firstParentChain(repo.objects, resolved.oid);
  }

  const shown = max === undefined ? oids : oids.slice(0, max);
  if (shown.length === 0) {
    return opOk(repo, [line('Không có commit nào để in ra.', 'plain')]);
  }

  const graph = options.graph === true;
  const output: OutputLine[] = [];

  for (const oid of shown) {
    const commit = getCommit(repo.objects, oid);
    if (commit === null) continue;
    const head = graph ? '* ' : '';
    const body = graph ? '| ' : '';

    if (options.oneline === true) {
      output.push(line(`${head}${shortOid(oid)}${decorate(repo, oid)} ${commit.message}`));
    } else {
      output.push(line(`${head}commit ${oid}${decorate(repo, oid)}`, 'success'));
      if (commit.parents.length > 1) {
        output.push(line(`${body}Merge: ${commit.parents.map(shortOid).join(' ')}`));
      }
      output.push(line(`${body}Tác giả: ${commit.author}`));
      output.push(line(`${body}Thời điểm logic: ${String(commit.logicalTime)}`));
      output.push(line(`${body}`));
      output.push(line(`${body}    ${commit.message}`));
      output.push(line(`${body}`));
    }

    // Một commit hai cha là chỗ hai nhánh gặp nhau. Đánh dấu nó là toàn bộ phần
    // "đồ thị" mà chế độ này hứa hẹn — xem chú thích đầu file.
    if (graph && commit.parents.length > 1) output.push(line('|\\'));
  }

  if (max !== undefined && oids.length > shown.length) {
    const rest = oids.length - shown.length;
    output.push(line(`… còn ${String(rest)} commit nữa (bỏ \`-n\` để xem hết).`, 'hint'));
  }

  return opOk(repo, output);
}

export interface ShowOptions {
  readonly rev?: string | undefined;
  /**
   * Bộ vẽ thân diff, do lane `diff.ts` cấp. Vắng mặt thì lệnh in danh sách file
   * thay đổi kèm loại thay đổi — xem chú thích của `DiffBodyRenderer` ở
   * `basic.ts` về việc vì sao nó là tham số chứ không phải một `import`.
   */
  readonly renderBody?: DiffBodyRenderer | undefined;
}

/**
 * `git show`.
 *
 * So với **cha thứ nhất**. Với một commit merge thì đó là một nửa sự thật, và
 * git thật cũng vậy (`git show` một merge mặc định in diff rỗng hoặc combined
 * diff tuỳ cấu hình) — chỗ nhìn một merge cho ra hồn là đồ thị, không phải một
 * cột text.
 */
export function gitShow(repo: Repo, options: ShowOptions = {}): RepoOpResult {
  const rev = options.rev ?? 'HEAD';
  const resolved = resolveRevision(repo, rev);
  if (!resolved.ok) {
    if (options.rev === undefined && headOid(repo) === null) {
      return opFail(repo, emptyHistoryError(repo));
    }
    return opFail(repo, revisionError(repo, rev, resolved.reason, '`git show` xem một commit có thật.'));
  }

  const commit = getCommit(repo.objects, resolved.oid);
  if (commit === null) {
    return opFail(
      repo,
      gitError(
        'not-a-commit',
        `\`${rev}\` không trỏ vào một commit.`,
        'Object mang Oid này tồn tại trong kho nhưng không phải commit — có thể là một blob hoặc một tree.',
        'Dùng `git log --oneline` để xem danh sách commit đang có.',
      ),
    );
  }

  const parent = commit.parents[0] ?? null;
  const pairs = diffContents(
    commitContents(repo.objects, parent),
    commitContents(repo.objects, resolved.oid),
  );

  const output: OutputLine[] = [
    line(`commit ${resolved.oid}${decorate(repo, resolved.oid)}`, 'success'),
  ];
  if (commit.parents.length > 1) {
    output.push(line(`Merge: ${commit.parents.map(shortOid).join(' ')}`));
  }
  output.push(line(`Tác giả: ${commit.author}`));
  output.push(line(`Thời điểm logic: ${String(commit.logicalTime)}`));
  output.push(
    line(
      commit.parents.length === 0
        ? 'Cha: không có — đây là commit gốc.'
        : `Cha: ${commit.parents.map(shortOid).join(', ')}`,
    ),
  );
  output.push(line(''));
  output.push(line(`    ${commit.message}`));
  output.push(line(''));

  if (pairs.length === 0) {
    output.push(line('Commit này không đổi file nào so với cha thứ nhất.', 'plain'));
  } else {
    output.push(...renderDiffPairs(pairs, options.renderBody));
  }

  return opOk(repo, output);
}
