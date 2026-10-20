'use client';

/**
 * **Level Builder**, §18.E, dựng thành một chế độ của màn sandbox.
 *
 * Sandbox là chỗ duy nhất trong sản phẩm mà người ta dựng được một cây git bất
 * kỳ bằng lệnh thật. Builder không dựng lại khả năng đó; nó CHỤP kết quả
 * (`captureSpec`) rồi để người soạn viết phần còn lại của level quanh nó.
 *
 * File này chỉ giữ thứ tự các bước và hai mẩu state tạm (báo cáo E.7, và việc
 * reset nó). Bản nháp KHÔNG sống ở đây: nó sống ở `GitGame`, vì "chơi thử" thay
 * màn sandbox bằng `GitLevelScreen` và một bản nháp sống trong cây bị unmount sẽ
 * mất sạch (ô gác: `builder-promises.test.ts` § E.6).
 *
 * ## Mạng: không có lời gọi nào cho tới lúc người soạn bấm Lưu
 *
 * Soạn, kiểm lời giải, chơi thử, xuất, nhập, tải tệp về đều chạy tại chỗ: xuất
 * là `levelToJson`, nhập là `levelFromJson`, tải về là một `Blob` dựng trong
 * trình duyệt. Đường DUY NHẤT chạm máy chủ là nút "Lưu thành bài tập" ở bước
 * cuối, gọi `problems.create`; `lib/trpc` chỉ được nạp bằng `await import()`
 * bên trong hàm xử lý bấm của `save-problem-panel.tsx`, nên trước cú bấm đó tầng
 * mạng không tồn tại trong bundle. e2e `games-builder-network.spec.ts` đo đúng
 * ranh giới này (mọi thứ trừ nút Lưu: 0 lời gọi `/api`).
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';

import {
  checkSolvable,
  draftFromLevel,
  draftToLevel,
  levelDraftIssues,
  type GitLevel,
  type LevelDraft,
  type SolvabilityReport,
  type WorldSpec,
} from '@devops-platform/games';
import { t } from '@devops-platform/copy';

import { BriefStep } from './brief-step';
import { BuilderLimits } from './builder-intro';
import { BuilderStep } from './builder-step';
import { CaptureStep } from './capture-step';
import { CheckStep } from './check-step';
import { exportFileName } from './draft-state';
import { ObjectiveEditor } from './objective-editor';
import { PlayStep } from './play-step';
import { HintsStep, RulesStep, SolutionStep } from './rules-steps';
import { SaveProblemPanel } from './save-problem-panel';
import { TeachingStep } from './teaching-step';
import { TransferStep } from './transfer-step';

/** Thứ tự các bước trên màn. Đổi chỗ ở đây là đổi cả số hiệu in trên màn. */
const STEP = {
  capture: 1,
  brief: 2,
  rules: 3,
  objectives: 4,
  solution: 5,
  hints: 6,
  teaching: 7,
  check: 8,
  play: 9,
  transfer: 10,
  save: 11,
} as const;

export interface GitLevelBuilderProps {
  /**
   * Chụp thế giới ĐANG hiện trong sandbox thành spec.
   *
   * Hàm chứ không phải giá trị: chụp lúc bấm nút, không chụp lúc render. Truyền
   * một `WorldSpec` dựng sẵn ở mỗi lần vẽ lại sẽ dựng một object mới sau mỗi
   * lệnh người dùng gõ, và `useMemo` nào bám vào nó cũng mất tác dụng.
   */
  readonly captureSpec: () => WorldSpec;
  readonly draft: LevelDraft;
  readonly onDraftChange: (next: LevelDraft) => void;
  /**
   * E.6, mở level vừa dựng bằng ĐÚNG màn chơi mà người chơi thật sẽ thấy.
   *
   * Nhận một `GitLevel` chứ không nhận bản nháp: chỗ gọi chỉ được mời chơi thử
   * một thứ đã qua `draftToLevel`, nên "chơi thử một level còn lỗi" không diễn
   * đạt được ở tầng kiểu.
   */
  readonly onPlayTest: (level: GitLevel) => void;
}

export function GitLevelBuilder({
  captureSpec,
  draft,
  onDraftChange,
  onPlayTest,
}: GitLevelBuilderProps): ReactElement {
  const [report, setReport] = useState<SolvabilityReport | null>(null);

  const issues = useMemo(() => levelDraftIssues(draft), [draft]);
  const level = useMemo(() => draftToLevel(draft), [draft]);

  const patch = useCallback(
    (fields: Partial<LevelDraft>) => {
      onDraftChange({ ...draft, ...fields });
      // Một báo cáo E.7 gắn với bản nháp đã sinh ra nó. Bản nháp đổi thì báo cáo
      // cũ mô tả một level không còn tồn tại, và để nó nằm đó là để người soạn
      // đọc một kết quả đã hết hạn như thể nó còn đúng.
      setReport(null);
    },
    [draft, onDraftChange],
  );

  const runCheck = useCallback(() => {
    if (level === null) return;
    setReport(checkSolvable(level, level.solutionCommands));
  }, [level]);

  const importLevel = useCallback(
    (parsed: GitLevel) => {
      setReport(null);
      onDraftChange(draftFromLevel(parsed));
    },
    [onDraftChange],
  );

  return (
    <div className="@container flex flex-col gap-8" data-testid="git-builder">
      <BuilderLimits />

      <CaptureStep
        index={STEP.capture}
        setup={draft.setup}
        target={draft.target}
        captureSpec={captureSpec}
        patch={patch}
      />
      <BriefStep index={STEP.brief} draft={draft} patch={patch} />
      <RulesStep index={STEP.rules} draft={draft} patch={patch} />
      <ObjectiveEditor
        index={STEP.objectives}
        objectives={draft.objectives}
        onChange={(objectives) => {
          patch({ objectives });
        }}
      />
      <SolutionStep index={STEP.solution} draft={draft} patch={patch} />
      <HintsStep index={STEP.hints} draft={draft} patch={patch} />
      <TeachingStep
        index={STEP.teaching}
        teaching={draft.teaching}
        onChange={(teaching) => {
          patch({ teaching });
        }}
      />
      <CheckStep
        index={STEP.check}
        issues={issues}
        report={report}
        blocked={level === null}
        onRun={runCheck}
      />
      <PlayStep index={STEP.play} level={level} onPlayTest={onPlayTest} />
      <TransferStep
        index={STEP.transfer}
        level={level}
        fileName={exportFileName(draft)}
        onImport={importLevel}
      />

      {/* E.5, lưu thành bài tập: đường duy nhất của Builder chạm máy chủ. */}
      <BuilderStep
        index={STEP.save}
        id="builder-luu-bai"
        title={t('author.builder.step.save')}
        accent="primary"
      >
        <SaveProblemPanel draft={draft} />
      </BuilderStep>
    </div>
  );
}
