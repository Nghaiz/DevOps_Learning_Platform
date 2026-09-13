import { describe, expect, it } from 'vitest';
import type { FilePath, Lines, Oid, Repo } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { writeCommit, writeContents } from '../objects.ts';
import {
  branchRef,
  emptyRepo,
  headOid,
  isDetached,
  setIndex,
  setWorktree,
} from '../repo.ts';
import { advanceHead, indexFromCommit, type OpContext } from './reset.ts';
import {
  bisectCandidates,
  gitBisectMark,
  gitBisectReset,
  gitBisectStart,
  nextBisectCommit,
} from './bisect.ts';

function at(logicalTime: number): OpContext {
  return { logicalTime, author: 'Bạn' };
}

function commitFiles(
  repo: Repo,
  contents: Readonly<Record<FilePath, Lines>>,
  message: string,
  time: number,
): Repo {
  const [store, tree] = writeContents(repo.objects, contents);
  const head = headOid(repo);
  const [store2, oid] = writeCommit(store, {
    tree,
    parents: head === null ? [] : [head],
    message,
    author: 'Bạn',
    logicalTime: time,
  });
  const moved = advanceHead({ ...repo, objects: store2 }, oid, {
    op: 'commit',
    message,
    logicalTime: time,
  });
  return setWorktree(setIndex(moved, indexFromCommit(moved, oid)), contents);
}

/** Lịch sử tuyến tính `n` commit trên `main`. `oids[i]` là commit thứ `i`. */
function chain(n: number): { readonly repo: Repo; readonly oids: readonly Oid[] } {
  let repo = emptyRepo();
  const oids: Oid[] = [];
  for (let i = 0; i < n; i += 1) {
    repo = commitFiles(repo, { 'app.txt': [`phiên bản ${i}`] }, `c${i}`, i + 1);
    oids.push(headOid(repo) ?? '');
  }
  return { repo, oids };
}

interface BisectRun {
  readonly repo: Repo;
  readonly steps: number;
  /** Commit mà bisect hỏi người chơi, theo đúng thứ tự. */
  readonly asked: readonly Oid[];
  readonly answer: Oid | null;
}

/**
 * Chạy trọn một phiên bisect, trả lời tự động theo `firstBad`.
 *
 * `firstBad` là CHỈ SỐ trong `oids`: mọi commit từ đó trở đi là hỏng. Đó chính
 * là giả thiết đơn điệu mà `git bisect` dựa vào.
 */
function runBisect(base: Repo, oids: readonly Oid[], firstBad: number): BisectRun {
  let time = 100;
  let repo = gitBisectStart(base, oids[oids.length - 1] ?? '', oids[0] ?? '', at(time)).repo;
  time += 1;

  const asked: Oid[] = [];
  for (;;) {
    const next = nextBisectCommit(repo.bisect);
    if (next === null) break;
    // Bisect phải ĐƯA người chơi tới commit nó muốn hỏi, không chỉ nói tên nó.
    expect(headOid(repo)).toBe(next);
    expect(isDetached(repo)).toBe(true);
    asked.push(next);

    const index = oids.indexOf(next);
    const verdict = index >= firstBad ? 'bad' : 'good';
    const marked = gitBisectMark(repo, verdict, null, at(time));
    time += 1;
    expect(marked.error).toBeNull();
    repo = marked.repo;

    if (asked.length > 20) throw new Error('bisect không hội tụ');
  }

  return { repo, steps: asked.length, asked, answer: repo.bisect?.bad ?? null };
}

describe('gitBisect trên lịch sử 15 commit', () => {
  /*
   * Trần bước: ⌈log2(15)⌉ + 1 = 5. Phép chia đôi cắt đôi tập ứng viên mỗi bước,
   * và `bad` bị loại khỏi danh sách phải thử vì ta ĐÃ biết nó hỏng — bỏ phép
   * loại đó đi là tốn thêm một bước và ô này đỏ.
   */
  const CEILING = Math.ceil(Math.log2(15)) + 1;

  it('tìm đúng commit hỏng đầu tiên ở MỌI vị trí, trong không quá 5 bước', () => {
    const { repo, oids } = chain(15);
    expect(oids.length).toBe(15);

    for (let firstBad = 1; firstBad < oids.length; firstBad += 1) {
      const run = runBisect(repo, oids, firstBad);
      expect(run.answer).toBe(oids[firstBad]);
      expect(run.steps).toBeLessThanOrEqual(CEILING);
      expect(run.steps).toBeGreaterThan(0);
    }
  });

  /*
   * ĐỐI CHỨNG cho trần bước ở trên. Không có ô này thì một hiện thực quét tuyến
   * tính (hỏi từng commit một) vẫn cho đáp án ĐÚNG, chỉ chậm — và test kia vẫn
   * xanh nếu trần bị nới. Ở đây khẳng định số bước THẬT SỰ nhỏ hơn hẳn số ứng
   * viên.
   */
  it('số bước nhỏ hơn hẳn quét tuyến tính', () => {
    const { repo, oids } = chain(15);
    const run = runBisect(repo, oids, 9);
    expect(run.steps).toBeLessThan(7);
  });

  it('tất định: hai lượt chạy hỏi ĐÚNG cùng một chuỗi commit', () => {
    const { repo, oids } = chain(15);
    const a = runBisect(repo, oids, 6);
    const b = runBisect(repo, oids, 6);
    expect(a.asked).toEqual(b.asked);
    expect(a.answer).toBe(b.answer);
  });

  it('bad ở ngay sau good ⇒ ra đáp án mà không cần thử hết', () => {
    const { repo, oids } = chain(15);
    const run = runBisect(repo, oids, 1);
    expect(run.answer).toBe(oids[1]);
  });

  it('chỉ commit cuối mới hỏng ⇒ vẫn ra đúng commit cuối', () => {
    const { repo, oids } = chain(15);
    const run = runBisect(repo, oids, 14);
    expect(run.answer).toBe(oids[14]);
  });
});

describe('trạng thái phiên bisect', () => {
  it('start ghi mốc và checkout commit giữa, branch KHÔNG bị kéo theo', () => {
    const { repo, oids } = chain(15);
    const started = gitBisectStart(repo, oids[14] ?? '', oids[0] ?? '', at(100));

    expect(started.error).toBeNull();
    const state = started.repo.bisect;
    expect(state).not.toBeNull();
    expect(state?.bad).toBe(oids[14]);
    expect(state?.good).toEqual([oids[0]]);
    expect(state?.originalHead).toEqual({ type: 'ref', ref: branchRef('main') });
    // Phien KHONG de lai ref nao - no song o `Repo.bisect`.
    expect(sortedKeys(started.repo.refs).filter((r) => r.startsWith('refs/bisect/'))).toEqual([]);

    expect(isDetached(started.repo)).toBe(true);
    expect(started.repo.refs[branchRef('main')]).toBe(oids[14]);
  });

  it('ứng viên là phần giữa hai mốc, và CÓ chứa `bad`', () => {
    const { repo, oids } = chain(15);
    const started = gitBisectStart(repo, oids[14] ?? '', oids[0] ?? '', at(100)).repo;
    const candidates = bisectCandidates(started, started.bisect);

    expect(candidates.length).toBe(14); // c1..c14
    expect(candidates).toContain(oids[14]);
    expect(candidates).not.toContain(oids[0]);
  });

  it('thiếu một trong hai mốc thì không phải lỗi, chỉ là chưa hỏi được', () => {
    const { repo, oids } = chain(15);
    const started = gitBisectStart(repo, null, null, at(100));

    expect(started.error).toBeNull();
    expect(started.repo.bisect).not.toBeNull();
    expect(nextBisectCommit(started.repo.bisect)).toBeNull();
    expect(isDetached(started.repo)).toBe(false); // chưa checkout đi đâu cả
  });

  it('reset xoá phiên và trả HEAD về branch cũ', () => {
    const { repo, oids } = chain(15);
    const started = gitBisectStart(repo, oids[14] ?? '', oids[0] ?? '', at(100)).repo;
    expect(isDetached(started)).toBe(true);

    const done = gitBisectReset(started, at(110));
    expect(done.error).toBeNull();
    expect(done.repo.bisect).toBeNull();
    expect(done.repo.head).toEqual({ type: 'ref', ref: branchRef('main') });
    expect(headOid(done.repo)).toBe(oids[14]);
    expect(done.repo.worktree).toEqual({ 'app.txt': ['phiên bản 14'] });
  });

  it('bắt đầu lúc đang detached ⇒ reset trả về đúng detached, không bịa ra branch', () => {
    const { repo, oids } = chain(15);
    const detached: Repo = { ...repo, head: { type: 'detached', oid: oids[14] ?? '' } };
    const started = gitBisectStart(detached, oids[14] ?? '', oids[0] ?? '', at(100)).repo;

    expect(started.bisect?.originalHead).toEqual({ type: 'detached', oid: oids[14] });
    const done = gitBisectReset(started, at(110)).repo;
    expect(done.head).toEqual({ type: 'detached', oid: oids[14] });
  });
});

describe('bisect — từ chối đúng chỗ', () => {
  it('worktree bẩn ⇒ bad-usage, trạng thái không đổi', () => {
    const { repo, oids } = chain(3);
    const dirty = setWorktree(repo, { 'app.txt': ['sửa dở chưa commit'] });
    const result = gitBisectStart(dirty, oids[2] ?? '', oids[0] ?? '', at(100));

    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo).toBe(dirty);
  });

  it('start lần hai khi đang chạy ⇒ operation-in-progress', () => {
    const { repo, oids } = chain(5);
    const started = gitBisectStart(repo, oids[4] ?? '', oids[0] ?? '', at(100)).repo;
    const again = gitBisectStart(started, oids[4] ?? '', oids[0] ?? '', at(101));

    expect(again.error?.code).toBe('operation-in-progress');
    expect(again.repo).toBe(started);
  });

  it('good/bad/reset ngoài phiên ⇒ no-operation-in-progress', () => {
    const { repo, oids } = chain(3);
    expect(gitBisectMark(repo, 'good', oids[0] ?? '', at(100)).error?.code).toBe(
      'no-operation-in-progress',
    );
    expect(gitBisectMark(repo, 'bad', null, at(100)).error?.code).toBe(
      'no-operation-in-progress',
    );
    expect(gitBisectReset(repo, at(100)).error?.code).toBe('no-operation-in-progress');
  });

  it('mốc không phải commit ⇒ not-a-commit', () => {
    const { repo, oids } = chain(3);
    const result = gitBisectStart(repo, 'khong-phai-oid', oids[0] ?? '', at(100));
    expect(result.error?.code).toBe('not-a-commit');
    expect(result.repo).toBe(repo);
  });
});

describe('originalHead mang trọn một `Head`', () => {
  /*
   * Bản đầu của `bisect.ts` giữ phiên trong ref, nên tên branch phải mã hoá vào
   * TÊN ref (`refs/bisect/start-head/<nhánh>`) — và tên branch có dấu `/` là chỗ
   * cách đó dễ gãy nhất. `BisectState.originalHead` là một `Head` đầy đủ nên vấn
   * đề đó biến mất; ô này ở lại để chứng minh nó đã biến mất thật.
   */
  it('trả đúng branch có dấu `/` sau khi reset', () => {
    const { repo, oids } = chain(3);
    const onFeature = advanceHead(
      { ...repo, head: { type: 'ref', ref: branchRef('feature/dang-lam') } },
      oids[2] ?? '',
      { op: 'branch', message: 'tạo nhánh', logicalTime: 10 },
    );

    const started = gitBisectStart(onFeature, oids[2] ?? '', oids[0] ?? '', at(100)).repo;
    expect(started.bisect?.originalHead).toEqual({
      type: 'ref',
      ref: branchRef('feature/dang-lam'),
    });

    const done = gitBisectReset(started, at(110)).repo;
    expect(done.head).toEqual({ type: 'ref', ref: branchRef('feature/dang-lam') });
  });
});
