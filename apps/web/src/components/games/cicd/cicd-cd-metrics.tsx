'use client';

import type { ReactElement } from 'react';
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
    <section className="flex flex-col gap-3" aria-label="Số đo phát hành và vận hành">
      <h3 className="text-sm font-semibold text-foreground">Phát hành và vận hành</h3>

      {release.map(({ record, scenario }, index) => {
        if (record.error !== null) {
          return (
            <p key={index} role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
              Chiến lược “{record.error.strategy}” thiếu tham số của nó, nên kịch bản {index + 1} không chạy được.
            </p>
          );
        }
        const lui = record.passes.map(rollbackSeconds).filter((s): s is number => s !== null);
        const dinh = Math.max(...record.passes.map((pass) => pass.peakInstances));
        const xau = isBadCandidate(scenario);
        const suCo = dataIncidentCount(record) ?? 0;
        return (
          <div key={index} className="flex flex-col gap-1 rounded-lg border border-border bg-muted px-4 py-3">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Kịch bản {index + 1} · bản ứng viên {xau ? 'LỖI' : 'tốt'} · {record.passes.length} lượt
            </span>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <Metric label="Phục hồi lâu nhất" value={lui.length === 0 ? 'không phải lùi' : formatSeconds(Math.max(...lui))} testId={`cicd-cd-rollback-${index}`} />
              <Metric label="Đội máy cao nhất" value={`${dinh} máy`} testId={`cicd-cd-peak-${index}`} />
              {xau ? (
                <Metric label="Lượt bản lỗi lọt lên" value={String(badReleasePromotedCount(record, scenario) ?? 0)} />
              ) : (
                <Metric label="Lượt bản tốt bị hủy nhầm" value={String(goodReleaseAbortedCount(record, scenario) ?? 0)} />
              )}
              {scenario.migration === 'irreversible' ? (
                <Metric label="Lượt lùi trên lược đồ mới" value={String(suCo)} />
              ) : null}
            </dl>
          </div>
        );
      })}

      {gitops === undefined ? null : (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Đối soát · {gitops.record.reconcileSeconds.length} nhịp trong {formatSeconds(gitops.scenario.horizonSeconds)}
          </span>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Metric label="Lệch lâu nhất" value={formatSeconds(longestDriftSeconds(gitops.record, gitops.scenario))} testId="cicd-cd-drift" />
            <Metric label="Lần giành với bộ điều khiển" value={String(selfHealFights(gitops.record))} />
            <Metric label="Đoạn lệch không ai thấy" value={String(undetectedDriftCount(gitops.record))} />
          </dl>
          {gitops.record.drifts.length === 0 ? null : (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {gitops.record.drifts.map((drift, i) => (
                <li key={i} className="font-mono">
                  {drift.field}: lệch từ giây {drift.startedAtSecond} tới{' '}
                  {drift.endedAtSecond === null ? 'hết giờ' : `giây ${drift.endedAtSecond}`} · do {drift.cause}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {masking === undefined ? null : (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Log sau khi che · <span data-testid="cicd-cd-leaks">{leakCount(masking.record)}</span> chỗ rò
          </span>
          {/*
            Log hiện đúng như người xem job thấy. Chỗ rò không tô màu: đọc ra
            chuỗi lạ trong log là chính kỹ năng bài này dạy.
          */}
          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
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
