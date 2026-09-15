'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type ReactElement } from 'react';

import { GIT_LEVELS, type GitLevel, type LevelDraft, type TheoryDoc } from '@devops-platform/games';

import { GitStatusScreen } from './git-status-screen';
import { GitCampaign } from './git-campaign';
import './git-odyssey.css';
import { GitLevelScreen } from './git-level-screen';
import { GitSandbox } from './git-sandbox';

/**
 * Chế độ làm bài OJ, nạp ĐỘNG và `ssr: false`.
 *
 * ⚠ Cả hai vế đều bắt buộc, và lý do KHÁC với tầng 3D.
 *
 * `git-problem.tsx` kéo theo client tRPC + TanStack Query, mà `app/games/layout.tsx`
 * nói thẳng rằng nó CỐ Ý không cấp `TrpcQueryProvider`: game phải chạy với **0 lời
 * gọi backend trong lúc chơi** (AC-2, đo bằng network trace của Playwright). Một
 * `import` tĩnh ở đây kéo toàn bộ tầng mạng vào bundle của MỌI người chơi level — kể
 * cả người chưa đăng nhập, kể cả người chưa bao giờ mở một bài OJ.
 *
 * `ssr: false` vì cây con đó tự cấp provider của riêng nó và gọi mạng ngay khi mount;
 * dựng nó ở server là dựng một QueryClient cho một lượt render bị vứt đi.
 */
const GitProblemScreen = dynamic(() => import('./git-problem').then((m) => m.GitProblemScreen), {
  ssr: false,
  loading: () => <GitStatusScreen text="Đang chuẩn bị đấu trường Git OJ…" />,
});

/**
 * Màn chơi của **Phòng thí nghiệm Git** — 17.L (HUD) nối với 17.R (route).
 *
 * Bốn quyết định bố cục, lấy nguyên từ design §3.6:
 *
 *  1. **Ô lệnh dưới cùng, rộng hết chiều ngang.** Nhập liệu là hoạt động chính
 *     (quyết định #7 của design doc: "gõ lệnh thật là chính, 3D là màn hình
 *     quan sát"), nên nó không được là một ô nhỏ ở góc.
 *  2. **Danh sách ref 2D thường trực.** VR-Git dù ở trong VR vẫn phải kèm một
 *     bảng 2D; đây là thứ người chơi liếc vào khi quên mình đang ở đâu.
 *  3. **Mục tiêu = testcase, hiện ngay.** Người chơi luôn thấy còn thiếu gì, và
 *     khi nộp bài OJ ở P18 thì đây chính là danh sách testcase.
 *  4. **Nút [2D]/[3D] ở thanh trên, không giấu trong cài đặt.** Chế độ ngang
 *     hàng thì phải trông ngang hàng.
 *
 * ⛔ **0 lời gọi backend trong lúc chơi** (AC-2). Không `fetch`, không tRPC,
 * không `useEffect` gọi mạng ở file này hay ở bất cứ thứ gì nó nạp. Bài lý
 * thuyết đi cùng payload của trang; engine chạy hoàn toàn trong bộ nhớ.
 */

export interface GitGameProps {
  readonly initialBuilderOpen?: boolean;
  /** 32 bài lý thuyết, đọc ở server. Xem `server/games/git-theory.ts`. */
  readonly theory: readonly TheoryDoc[];
  /** Level mở sẵn. `null` = hiện màn chọn level. */
  readonly initialLevelId: string | null;
  /**
   * Mã bài OJ mở sẵn, từ `?problem=`. `null` = không ở chế độ làm bài.
   *
   * ⚠ Chỉ `page.tsx` đọc tham số này, không component con nào tự đọc — cùng luật
   * `arena-contract.ts` đã ghi cho đấu trường K8s: hai chỗ cùng đọc một tham số là hai
   * chỗ có thể bất đồng về việc đang ở chế độ nào.
   */
  readonly initialProblemCode: string | null;
}

export function GitGame({
  theory,
  initialLevelId,
  initialProblemCode,
  initialBuilderOpen = false,
}: GitGameProps): ReactElement {
  const [levelId, setLevelId] = useState<string | null>(initialLevelId);
  const [sandbox, setSandbox] = useState(initialBuilderOpen);
  /*
   * ⚠ Bản nháp của Level Builder (§18.E) sống Ở ĐÂY, không trong `GitSandbox`.
   *
   * Nó từng sống trong `GitSandbox`, và chỗ đó đủ đúng cho tới lúc có E.6: "chơi
   * thử" THAY màn sandbox bằng `GitLevelScreen`, nên `GitSandbox` **unmount**, và
   * mọi state của nó biến mất. Người soạn bấm chơi thử một lần là mất sạch đề bài.
   *
   * Đường lùi còn lại là giữ `GitSandbox` mounted rồi ẩn bằng CSS, và đường đó có
   * một cái bẫy đã ghi trong dự án: `hidden` thua một utility `display` khác ở
   * cùng mức đặc hiệu, nên phần tử vẫn hiện mà không báo gì. Nâng state lên đây
   * rẻ hơn và không dựa vào thứ tự luật CSS.
   *
   * `trial` là level đang chơi thử. Nó KHÔNG nằm trong `GIT_LEVELS` — đó chính là
   * điểm của E.6 — nên đường vào nó là state này chứ không phải `?level=`.
   */
  const [draft, setDraft] = useState<LevelDraft | null>(null);
  const [builderOpen, setBuilderOpen] = useState(initialBuilderOpen);
  const [trial, setTrial] = useState<GitLevel | null>(null);

  const level = useMemo(() => GIT_LEVELS.find((l) => l.id === levelId) ?? null, [levelId]);

  /*
   * BÀI OJ thắng mọi đường vào khác, và nó là một đường MỘT CHIỀU: không có nút nào
   * từ màn bài quay về danh sách level. `?problem=` là một địa chỉ cụ thể người dùng
   * tới từ trang bài hoặc từ trang soạn; đổ họ vào danh sách level là đổi điểm đến
   * của một đường dẫn họ vừa bấm.
   */
  if (initialProblemCode !== null) {
    return <GitProblemScreen code={initialProblemCode} />;
  }
  if (trial !== null) {
    return (
      <GitLevelScreen
        key={trial.id}
        level={trial}
        theory={theory.find((d) => d.frontmatter.id === trial.theoryId) ?? null}
        trial={{ solutionCommands: trial.solutionCommands }}
        exitLabel="← Về Builder"
        onExit={() => {
          setTrial(null);
        }}
      />
    );
  }
  if (sandbox) {
    return (
      <GitSandbox
        draft={draft}
        onDraftChange={setDraft}
        builderOpen={builderOpen}
        onBuilderOpenChange={setBuilderOpen}
        onPlayTest={setTrial}
        onExit={() => {
          setSandbox(false);
        }}
      />
    );
  }
  if (level === null) {
    return (
      <GitCampaign
        onPick={setLevelId}
        onSandbox={() => {
          setSandbox(true);
        }}
      />
    );
  }
  return (
    <GitLevelScreen
      key={level.id}
      level={level}
      theory={theory.find((d) => d.frontmatter.id === level.theoryId) ?? null}
      onNext={
        GIT_LEVELS[GIT_LEVELS.indexOf(level) + 1]
          ? () => setLevelId(GIT_LEVELS[GIT_LEVELS.indexOf(level) + 1]!.id)
          : undefined
      }
      onExit={() => {
        setLevelId(null);
      }}
    />
  );
}
