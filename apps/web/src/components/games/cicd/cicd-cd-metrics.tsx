'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import {
  badReleasePromotedCount,
  dataIncidentCount,
  goodReleaseAbortedCount,
  isBadCandidate,
  leakCount,
  longestDriftSeconds,
  rollbackSeconds,
  selfHealFights,
  undetectedDriftCount,
  type CicdCdRecords,
} from '@devops-platform/games';

import { formatSeconds } from './cicd-run';

/**
 * Số đo ba bộ mô phỏng CD của một lượt — chương CD (19.G).
 *
 * ⛔ Mọi con số ở đây là PHÉP CHIẾU gọi từ `packages/games` (`rollbackSeconds`,
 * `longestDriftSeconds`, …), đúng các hàm mà vị từ mục tiêu gọi. Tính lại tại
 * đây là mở một bản thứ hai của cùng một định nghĩa, và bảng sẽ nói một đằng
 * trong khi bộ chấm nói một nẻo.
 *
 * Kịch bản phát hành hiện TÁCH theo từng bản ứng viên (tốt / xấu) chứ không gộp:
 * bài C21 là thấy cùng một chính sách hủy nhầm bản tốt và để lọt bản xấu, và một
 * con số gộp xoá đúng điều đó.
 */
export function CicdCdMetrics({ records }: { readonly records: CicdCdRecords }): ReactElement | null {
  const release = records.release ?? [];
  const { gitops, masking } = records;
  if (release.length === 0 && gitops === undefined && masking === undefined) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t('games.cicd.cd-metrics.aria')}>
      <h3 className="text-sm font-semibold text-foreground">{t('games.cicd.cd-metrics.title')}</h3>

      {release.map(({ record, scenario }, index) => {
        if (record.error !== null) {
          return (
            <p key={index} role="alert" className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
              {t('games.cicd.cd-metrics.missing-params', { strategy: record.error.strategy, n: index + 1 })}
            </p>
          );
        }
        const lui = record.passes.map(rollbackSeconds).filter((s): s is number => s !== null);
        const dinh = Math.max(...record.passes.map((pass) => pass.peakInstances));
        const xau = isBadCandidate(scenario);
        const suCo = dataIncidentCount(record) ?? 0;
        return (
          <div key={index} className="flex flex-col gap-1 border border-border bg-muted px-4 py-3">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {xau
                ? t('games.cicd.cd-metrics.scenario-bad', { n: index + 1, passes: record.passes.length })
                : t('games.cicd.cd-metrics.scenario-good', { n: index + 1, passes: record.passes.length })}
            </span>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <Metric label={t('games.cicd.cd-metrics.recovery')} value={lui.length === 0 ? t('games.cicd.cd-metrics.no-rollback') : formatSeconds(Math.max(...lui))} testId={`cicd-cd-rollback-${index}`} />
              <Metric label={t('games.cicd.cd-metrics.peak')} value={t('games.cicd.cd-metrics.peak-value', { n: dinh })} testId={`cicd-cd-peak-${index}`} />
              {xau ? (
                <Metric label={t('games.cicd.cd-metrics.bad-promoted')} value={String(badReleasePromotedCount(record, scenario) ?? 0)} />
              ) : (
                <Metric label={t('games.cicd.cd-metrics.good-aborted')} value={String(goodReleaseAbortedCount(record, scenario) ?? 0)} />
              )}
              {scenario.migration === 'irreversible' ? (
                <Metric label={t('games.cicd.cd-metrics.schema-rollback')} value={String(suCo)} />
              ) : null}
            </dl>
          </div>
        );
      })}

      {gitops === undefined ? null : (
        <div className="flex flex-col gap-1 border border-border bg-muted px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('games.cicd.cd-metrics.gitops-title', {
              beats: gitops.record.reconcileSeconds.length,
              horizon: formatSeconds(gitops.scenario.horizonSeconds),
            })}
          </span>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Metric label={t('games.cicd.cd-metrics.longest-drift')} value={formatSeconds(longestDriftSeconds(gitops.record, gitops.scenario))} testId="cicd-cd-drift" />
            <Metric label={t('games.cicd.cd-metrics.heal-fights')} value={String(selfHealFights(gitops.record))} />
            <Metric label={t('games.cicd.cd-metrics.unseen-drift')} value={String(undetectedDriftCount(gitops.record))} />
          </dl>
          {gitops.record.drifts.length === 0 ? null : (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {gitops.record.drifts.map((drift, i) => (
                <li key={i} className="font-mono">
                  {drift.endedAtSecond === null
                    ? t('games.cicd.cd-metrics.drift-open', {
                        field: drift.field,
                        from: drift.startedAtSecond,
                        cause: drift.cause,
                      })
                    : t('games.cicd.cd-metrics.drift-closed', {
                        field: drift.field,
                        from: drift.startedAtSecond,
                        to: drift.endedAtSecond,
                        cause: drift.cause,
                      })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {masking === undefined ? null : (
        <div className="flex flex-col gap-1 border border-border bg-muted px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('games.cicd.cd-metrics.masking-title')} · <span data-testid="cicd-cd-leaks">{leakCount(masking.record)}</span>{' '}
            {t('games.cicd.cd-metrics.leaks')}
          </span>
          {/*
            Log hiện đúng như người xem job thấy. Chỗ rò không tô màu: đọc ra
            chuỗi lạ trong log là chính kỹ năng bài này dạy.
          */}
          <pre className="max-h-48 overflow-auto border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
            <code>{masking.record.lines.join('\n')}</code>
          </pre>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
}): ReactElement {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground" {...(testId === undefined ? {} : { 'data-testid': testId })}>
        {value}
      </dd>
    </div>
  );
}
