'use client';

import type { ReactElement } from 'react';
import { t, type StaticTextKey } from '@devops-platform/copy';
import {
  IssueList,
  RailSection,
  StateChip,
  type SaveStatus,
  type StudioContentState,
  type StudioIssue,
} from '../../../components/author/studio';
import type { PublishPhase } from '../../../components/author/publish-machine';
import { Button, Icon, cn, type IconName } from '@devops-platform/ds';

type Mark = 'ok' | 'todo' | 'bad';

const MARK_TONE: Readonly<Record<Mark, string>> = {
  ok: 'bg-ok-solid text-on-solid',
  todo: 'border border-rule-2 text-ink-3',
  bad: 'bg-bad-solid text-on-solid',
};
const MARK_ICON: Readonly<Record<Mark, IconName>> = { ok: 'check', todo: 'circle', bad: 'close' };

const PHASE_KEY: Readonly<Record<PublishPhase['kind'], StaticTextKey>> = {
  idle: 'author.rail.trial.idle',
  submitting: 'author.rail.trial.running',
  running: 'author.rail.trial.running',
  passed: 'author.rail.trial.passed',
  failed: 'author.rail.trial.failed',
  lost: 'author.rail.trial.failed',
  archived: 'author.rail.trial.idle',
};

/**
 * Cột kiểm bên phải của `/author/[id]`: ô cần sửa, rồi ba điều kiện để xuất bản
 * (đã lưu, kiểm tra sạch, lượt chạy thử). Cột chỉ ĐỌC trạng thái và chỉ đường;
 * nút thật nằm ở chế độ Xuất bản, để không có hai nút "Xuất bản" trên một trang.
 */
export function LessonRail(props: {
  readonly issues: readonly StudioIssue[];
  readonly onJump: (path: string) => void;
  readonly state: StudioContentState;
  readonly stateLabel: string;
  readonly saveStatus: SaveStatus;
  readonly checked: 'never' | 'clean' | 'blocked';
  readonly phase: PublishPhase;
  readonly onOpenPublish: () => void;
}): ReactElement {
  const savedMark: Mark = props.saveStatus === 'saved' ? 'ok' : props.saveStatus === 'error' ? 'bad' : 'todo';
  const checkMark: Mark = props.checked === 'clean' ? 'ok' : props.checked === 'blocked' ? 'bad' : 'todo';
  const trialMark: Mark =
    props.phase.kind === 'passed' ? 'ok' : props.phase.kind === 'failed' || props.phase.kind === 'lost' ? 'bad' : 'todo';

  return (
    <>
      <RailSection title={t('author.studio.rail.issues')} tone={props.issues.length > 0 ? 'bad' : 'accent'}>
        {props.issues.length > 0 ? (
          <IssueList issues={props.issues} onJump={props.onJump} />
        ) : (
          <p className="text-ink-2">{t('author.studio.rail.issues-clean')}</p>
        )}
      </RailSection>

      <RailSection title={t('author.studio.rail.readiness')} tone={trialMark === 'ok' ? 'ok' : 'plain'}>
        <StateChip state={props.state} label={props.stateLabel} className="self-start" />
        <ol className="flex flex-col border-t border-rule">
          <ReadinessRow mark={savedMark} label={t(props.saveStatus === 'saved' ? 'author.rail.saved.ok' : 'author.rail.saved.todo')} />
          <ReadinessRow
            mark={checkMark}
            label={t(
              props.checked === 'clean'
                ? 'author.rail.check-clean'
                : props.checked === 'blocked'
                  ? 'author.rail.check-blocked'
                  : 'author.rail.check-never',
            )}
          />
          <ReadinessRow mark={trialMark} label={t(PHASE_KEY[props.phase.kind])} />
        </ol>
        <Button variant="secondary" size="sm" className="self-start" onClick={props.onOpenPublish}>
          {t('author.rail.open-publish')}
        </Button>
      </RailSection>
    </>
  );
}

function ReadinessRow(props: { readonly mark: Mark; readonly label: string }): ReactElement {
  return (
    <li className="flex items-center gap-2.5 border-b border-rule py-2">
      <span className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-full', MARK_TONE[props.mark])}>
        <Icon name={MARK_ICON[props.mark]} size={12} strokeWidth={2.5} />
      </span>
      <span className="text-sm text-ink">{props.label}</span>
    </li>
  );
}
