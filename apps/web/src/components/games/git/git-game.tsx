'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState, type ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import { GIT_LEVELS, type GitLevel, type LevelDraft, type TheoryDoc } from '@devops-platform/games';

import { GitStatusScreen } from './git-status-screen';
import { GitCampaign } from './git-campaign';
import './git-odyssey.css';
import { GitLevelScreen } from './git-level-screen';
import { GitSandbox } from './git-sandbox';
import { LegacySkin } from '../legacy-skin';

/**
 * Chế độ làm bài OJ, nạp ĐỘNG và `ssr: false`.
 *
 * `git-problem.tsx` kéo theo client tRPC + TanStack Query, mà `app/games/layout.tsx`
 * CỐ Ý không cấp `TrpcQueryProvider`: game phải chạy với **0 lời gọi backend trong
 * lúc chơi** (AC-2, đo bằng network trace của Playwright). Một `import` tĩnh ở đây
 * kéo toàn bộ tầng mạng vào bundle của MỌI người chơi level.
 */
const GitProblemScreen = dynamic(() => import('./git-problem').then((m) => m.GitProblemScreen), {
  ssr: false,
  loading: () => <GitStatusScreen text={t('games.git.status.loading-oj')} />,
});

/**
 * Vỏ client của **Phòng thí nghiệm Git**: chọn giữa bài OJ, chơi thử từ Builder,
 * sandbox, danh sách màn và màn chơi.
 *
 * ## Màn đang chơi nằm ở URL (`?level=`)
 *
 * Bấm một màn ghi `?level=<id>` bằng `history.pushState`, không `router.push`:
 * Next đồng bộ `useSearchParams` với lời gọi đó mà KHÔNG xin lại payload máy chủ,
 * nên vào màn vẫn là 0 lời gọi backend (AC-2). Nút Back của trình duyệt vì vậy
 * đưa người chơi từ màn về danh sách, và trang `/games` dẫn thẳng được vào một
 * màn cụ thể. `?level=` lạ thì bị bỏ qua: hiện danh sách, không ném.
 *
 * ⛔ **0 lời gọi backend trong lúc chơi** (AC-2). Bài lý thuyết đi cùng payload
 * của trang; engine chạy hoàn toàn trong bộ nhớ.
 */

export interface GitGameProps {
  readonly initialBuilderOpen?: boolean;
  /** 32 bài lý thuyết, đọc ở server. Xem `server/games/git-theory.ts`. */
  readonly theory: readonly TheoryDoc[];
  /**
   * Mã bài OJ mở sẵn, từ `?problem=`. `null` = không ở chế độ làm bài.
   *
   * ⚠ Chỉ `page.tsx` đọc tham số này, không component con nào tự đọc.
   */
  readonly initialProblemCode: string | null;
}

function findLevel(id: string | null): GitLevel | null {
  if (id === null) return null;
  return GIT_LEVELS.find((level) => level.id === id) ?? null;
}

export function GitGame({
  theory,
  initialProblemCode,
  initialBuilderOpen = false,
}: GitGameProps): ReactElement {
  const params = useSearchParams();
  /* URL là nguồn duy nhất. `?level=` lạ ⇒ `null` ⇒ danh sách màn, không ném. */
  const level = findLevel(params.get('level'));
  /*
   * Màn mở bằng nút trên trang này thì rời màn bằng `history.back()`; màn mở
   * thẳng từ một liên kết thì không có gì phía sau để lùi: thay URL tại chỗ.
   */
  const pushedRef = useRef(false);

  const play = useCallback((id: string) => {
    pushedRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set('level', id);
    window.history.pushState(null, '', url);
  }, []);

  const playInstead = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('level', id);
    window.history.replaceState(null, '', url);
  }, []);

  const leave = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('level');
    window.history.replaceState(null, '', url);
  }, []);

  const [sandbox, setSandbox] = useState(initialBuilderOpen);
  /*
   * ⚠ Bản nháp của Level Builder (§18.E) sống Ở ĐÂY, không trong `GitSandbox`:
   * "chơi thử" THAY màn sandbox bằng `GitLevelScreen`, nên `GitSandbox` unmount
   * và mọi state của nó biến mất. Nâng state lên đây rẻ hơn giữ nó mounted rồi ẩn
   * bằng CSS (`hidden` thua một utility `display` khác cùng mức đặc hiệu).
   *
   * `trial` là level đang chơi thử. Nó KHÔNG nằm trong `GIT_LEVELS`, nên đường
   * vào nó là state này chứ không phải `?level=`.
   */
  const [draft, setDraft] = useState<LevelDraft | null>(null);
  const [builderOpen, setBuilderOpen] = useState(initialBuilderOpen);
  const [trial, setTrial] = useState<GitLevel | null>(null);

  /*
   * BÀI OJ thắng mọi đường vào khác, và là đường MỘT CHIỀU: `?problem=` là địa chỉ
   * người dùng tới từ trang bài hoặc trang soạn.
   */
  if (initialProblemCode !== null) {
    return (
      <LegacySkin>
        <GitProblemScreen code={initialProblemCode} />
      </LegacySkin>
    );
  }
  if (trial !== null) {
    return (
      <LegacySkin>
      <GitLevelScreen
        key={trial.id}
        level={trial}
        theory={theory.find((d) => d.frontmatter.id === trial.theoryId) ?? null}
        trial={{ solutionCommands: trial.solutionCommands }}
        exitLabel={t('games.git.play.back-builder')}
        onExit={() => {
          setTrial(null);
        }}
      />
      </LegacySkin>
    );
  }
  if (sandbox) {
    return (
      <LegacySkin>
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
      </LegacySkin>
    );
  }
  if (level === null) {
    return (
      <GitCampaign
        onPick={play}
        onSandbox={() => {
          setSandbox(true);
        }}
      />
    );
  }
  const next = GIT_LEVELS[GIT_LEVELS.indexOf(level) + 1];
  return (
    <LegacySkin>
    <GitLevelScreen
      key={level.id}
      level={level}
      theory={theory.find((d) => d.frontmatter.id === level.theoryId) ?? null}
      onNext={
        next === undefined
          ? undefined
          : () => {
              playInstead(next.id);
            }
      }
      onExit={leave}
    />
    </LegacySkin>
  );
}
