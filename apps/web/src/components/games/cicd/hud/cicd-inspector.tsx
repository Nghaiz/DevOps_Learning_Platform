'use client';

/**
 * Bảng thông số của job đang chọn (19.D.4.5).
 *
 * Mượn vai trò của `k8s-arena/hud/inspector-frame.tsx`: một khung đứng yên một
 * chỗ, chỉ tồn tại khi có thứ đang chọn, và chở đủ số liệu để trả lời *"vì sao
 * job này chậm/đỏ"* mà không phải rời màn.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CẢNH ĐỌC `view`, BẢNG NÀY ĐỌC `RunRecord`. HAI ĐƯỜNG, MỘT LƯỢT CHẠY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `StageNodeView` cố ý MỎNG — nó chở đúng thứ cần để VẼ (trạng thái, token màu,
 * ba mốc tick). Nó không chở `attempts`, `blockedBy`, `runnerTicks` hay
 * `suppliers`, và không nên chở: mỗi trường thêm vào view là một trường cả hai
 * renderer phải mang theo mà không vẽ.
 *
 * Nên bảng này đọc THẲNG `StageInstanceRecord`. Điều kiện để hai đường không nói
 * hai chuyện: **cùng một `RunRecord`** — `firstRun()` ở `cicd-scene-model.ts` là
 * nơi duy nhất chọn lượt, và cả hai bên gọi nó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG SUY LẠI THỨ BẢN GHI ĐÃ GHI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `blockedBy` nói *chờ AI*, và nó KHÔNG suy ra được từ `readyTick`/`startedTick`
 * — hai tick đó chỉ nói *có phải chờ không* (`contract.ts` §5). "Chờ 40 giây" mà
 * không nói chờ ai là một con số người chơi không làm gì được; "chờ 40 giây vì
 * `build` xong muộn" là một câu chỉ thẳng chỗ phải sửa.
 */

import type { ReactElement } from 'react';
import { SECONDS_PER_TICK } from '@devops-platform/games';
import { t } from '@devops-platform/copy';
import type {
  AttemptRecord,
  BlockedBy,
  FailureCause,
  InstanceKey,
  RunRecord,
  StageInstanceRecord,
  StageNodeView,
} from '@devops-platform/games';

import { formatSeconds } from '../cicd-run';

export interface CicdInspectorProps {
  readonly node: StageNodeView | null;
  readonly run: RunRecord | null;
  readonly selectedId: InstanceKey | null;
}

/** Tick ⇒ chuỗi giây/phút. Người chơi nghĩ bằng phút; engine đếm bằng tick. */
function ticks(count: number): string {
  return formatSeconds(count * SECONDS_PER_TICK);
}

function describeBlockedBy(blocked: BlockedBy): string {
  switch (blocked.kind) {
    case 'none':
      return t('games.cicd.inspector.blocked-none');
    case 'dependency':
      return t('games.cicd.inspector.blocked-dep', { instance: blocked.instance });
    case 'runner':
      return t('games.cicd.inspector.blocked-runner', { runner: blocked.runnerClass, instance: blocked.instance });
  }
}

/**
 * Câu tiếng Việt cho nguyên nhân đỏ.
 *
 * ⚠ `stale-cache` nói ra CẢ HAI sự thật: khoá vẫn trúng, nội dung thì ôi. Bỏ vế
 * đầu đi thì người chơi sẽ đi nới khoá cache — đúng chiều ngược với thứ cần làm.
 */
function describeCause(cause: FailureCause): string {
  switch (cause.kind) {
    case 'flake':
      return t('games.cicd.inspector.cause-flake', { nature: cause.nature });
    case 'missing-output':
      return t('games.cicd.inspector.cause-missing-output', { step: cause.step, output: cause.output });
    case 'stale-cache':
      return t('games.cicd.inspector.cause-stale-cache', { cache: cause.cache, step: cause.step });
    case 'upstream-failed':
      return t('games.cicd.inspector.cause-upstream', { stage: cause.stage });
    case 'approval-rejected':
      return t('games.cicd.inspector.cause-approval');
  }
}

function lastAttempt(record: StageInstanceRecord): AttemptRecord | null {
  return record.attempts.at(-1) ?? null;
}

export function CicdInspector({ node, run, selectedId }: CicdInspectorProps): ReactElement {
  if (node === null || selectedId === null) {
    return (
      <p className="text-xs text-muted-foreground">{t('games.cicd.inspector.empty')}</p>
    );
  }

  const record = run?.instances.find((i) => i.instance === selectedId) ?? null;
  const attempt = record === null ? null : lastAttempt(record);

  return (
    <div className="flex flex-col gap-3 text-xs" data-cicd-inspector-node={selectedId}>
      <div>
        <p className="font-mono text-sm text-foreground">{node.name}</p>
        <p className="text-muted-foreground">
          {node.kind} · {node.ariaLabel}
        </p>
      </div>

      {record === null ? (
        /*
         * Chưa chạy lượt nào, hoặc thực thể này không có trong lượt đang xem.
         * ⛔ Không vẽ các ô số rỗng: một bảng đầy dấu gạch trông như bảng hỏng.
         */
        <p className="text-muted-foreground">{t('games.cicd.inspector.no-data')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t('games.cicd.inspector.duration')}</dt>
            <dd className="text-foreground">
              {ticks(record.finishedTick - record.startedTick)}
            </dd>

            <dt className="text-muted-foreground">{t('games.cicd.inspector.wait')}</dt>
            <dd className="text-foreground">{ticks(record.startedTick - record.readyTick)}</dd>

            <dt className="text-muted-foreground">{t('games.cicd.inspector.runner')}</dt>
            <dd className="text-foreground">
              {((record.runnerTicks * SECONDS_PER_TICK) / 60).toFixed(1)}
            </dd>

            <dt className="text-muted-foreground">{t('games.cicd.inspector.attempts')}</dt>
            <dd className="text-foreground">
              {record.attempts.length}
              {record.attempts.length > 1 ? ` ${t('games.cicd.inspector.retried')}` : ''}
            </dd>

            <dt className="text-muted-foreground">{t('games.cicd.inspector.cache')}</dt>
            <dd className="text-foreground">
              {node.cacheHit === null
                ? t('games.cicd.inspector.cache-none')
                : node.cacheHit
                  ? t('games.cicd.inspector.cache-hit')
                  : t('games.cicd.inspector.cache-miss')}
            </dd>

            {node.environment === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('games.cicd.inspector.env')}</dt>
                <dd className="text-foreground">{node.environment}</dd>
              </>
            )}
          </dl>

          <p className="text-muted-foreground">{describeBlockedBy(record.blockedBy)}</p>

          {attempt === null || attempt.cause === null ? null : (
            <p className="border border-destructive/40 bg-destructive/5 px-2 py-1 text-destructive">
              {describeCause(attempt.cause)}
              {attempt.failedStep === null ? null : (
                <span className="text-muted-foreground">
                  {` ${t('games.cicd.inspector.failed-step', { step: attempt.failedStep })}`}
                </span>
              )}
            </p>
          )}

          {attempt === null || attempt.steps.length === 0 ? null : (
            <div>
              <h3 className="mb-1 font-semibold tracking-wide text-muted-foreground uppercase">
                {t('games.cicd.inspector.steps', { n: attempt.steps.length })}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {attempt.steps.map((step) => (
                  <li key={step.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-foreground">{step.id}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {ticks(step.durationTicks)}
                      {step.cacheHit === null
                        ? ''
                        : ` · ${step.cacheHit ? t('games.cicd.inspector.step-hit') : t('games.cicd.inspector.step-miss')}`}
                    </span>
                  </li>
                ))}
              </ul>
              {/*
               * ⚠ Danh sách này NGẮN hơn `StageSpec.steps` khi một bước chặn đã
               * gãy: các bước sau nó không chạy. Đừng đọc số này là "job có bấy
               * nhiêu bước".
               */}
            </div>
          )}
        </>
      )}
    </div>
  );
}
