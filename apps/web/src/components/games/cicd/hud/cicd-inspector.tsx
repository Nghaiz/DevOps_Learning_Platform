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
import type {
  AttemptRecord,
  InstanceKey,
  RunRecord,
  StageInstanceRecord,
  StageNodeView,
} from '@devops-platform/games';

import { formatSeconds } from '../cicd-run';

/**
 * ⚠ **`BlockedBy` và `FailureCause` KHÔNG được barrel `@devops-platform/games`
 * xuất ra** — đo 2026-09-17: `tsc` báo TS2305 cho cả hai.
 *
 * Suy lại từ hai kiểu CÓ xuất, thay vì chép hình dạng xuống đây. Một bản chép sẽ
 * trôi khỏi bản gốc trong im lặng, và nó trôi ở đúng chỗ khó thấy nhất: engine
 * thêm một nhánh `kind` mới thì bản chép vẫn biên dịch, vẫn chạy, chỉ là rơi ra
 * khỏi mọi `switch` ở đây mà không gì đỏ. Suy từ kiểu thật thì nhánh mới làm
 * `switch` thiếu-nhánh đỏ ngay.
 *
 * Đề xuất cho lead: mở hai kiểu này ở `packages/games/src/index.ts`.
 */
type BlockedBy = StageInstanceRecord['blockedBy'];
type FailureCause = NonNullable<AttemptRecord['cause']>;

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
      return 'Chạy ngay khi sẵn sàng — không chờ gì.';
    case 'dependency':
      return `Chờ "${blocked.instance}" xong (đây là phụ thuộc xong muộn nhất).`;
    case 'runner':
      return `Chờ máy hạng "${blocked.runnerClass}" — "${blocked.instance}" đang giữ chỗ.`;
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
      return `Đỏ giả (${cause.nature}) — chạy lại có thể xanh, nhưng mỗi lần chạy lại vẫn đốt runner-phút.`;
    case 'missing-output':
      return `Bước "${cause.step}" cần sản phẩm "${cause.output}" mà job này không phụ thuộc (kể cả bắc cầu) vào nơi tạo ra nó.`;
    case 'stale-cache':
      return `Trúng khoá cache "${cause.cache}" nhưng nội dung đã ôi — bước "${cause.step}" chạy trên bản cũ. Khoá đang quá hẹp, không phải quá rộng.`;
    case 'upstream-failed':
      return `Job phía trên "${cause.stage}" đỏ và nó chặn, nên job này không chạy.`;
    case 'approval-rejected':
      return 'Cổng phê duyệt bị từ chối. Chạy lại không cứu được.';
  }
}

function lastAttempt(record: StageInstanceRecord): AttemptRecord | null {
  return record.attempts.at(-1) ?? null;
}

export function CicdInspector({ node, run, selectedId }: CicdInspectorProps): ReactElement {
  if (node === null || selectedId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Chưa chọn job nào. Bấm một node trên sân, hoặc chọn một chấm trên bản đồ thu nhỏ — bản đồ
        đi được bằng phím Tab.
      </p>
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
        <p className="text-muted-foreground">
          Chưa có số liệu cho job này. Bấm “Chạy thử” để engine mô phỏng một lượt.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Thời lượng</dt>
            <dd className="text-foreground">
              {ticks(record.finishedTick - record.startedTick)}
            </dd>

            <dt className="text-muted-foreground">Chờ máy</dt>
            <dd className="text-foreground">{ticks(record.startedTick - record.readyTick)}</dd>

            <dt className="text-muted-foreground">Runner-phút</dt>
            <dd className="text-foreground">
              {((record.runnerTicks * SECONDS_PER_TICK) / 60).toFixed(1)}
            </dd>

            <dt className="text-muted-foreground">Số lần thử</dt>
            <dd className="text-foreground">
              {record.attempts.length}
              {record.attempts.length > 1 ? ' (có thử lại)' : ''}
            </dd>

            <dt className="text-muted-foreground">Cache</dt>
            <dd className="text-foreground">
              {node.cacheHit === null
                ? 'job này không khai cache'
                : node.cacheHit
                  ? 'trúng ở mọi bước có khai'
                  : 'trượt ở ít nhất một bước'}
            </dd>

            {node.environment === null ? null : (
              <>
                <dt className="text-muted-foreground">Môi trường</dt>
                <dd className="text-foreground">{node.environment}</dd>
              </>
            )}
          </dl>

          <p className="text-muted-foreground">{describeBlockedBy(record.blockedBy)}</p>

          {attempt === null || attempt.cause === null ? null : (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-destructive">
              {describeCause(attempt.cause)}
              {attempt.failedStep === null ? null : (
                <span className="text-muted-foreground"> Bước gãy: {attempt.failedStep}.</span>
              )}
            </p>
          )}

          {attempt === null || attempt.steps.length === 0 ? null : (
            <div>
              <h3 className="mb-1 font-semibold tracking-wide text-muted-foreground uppercase">
                Các bước đã chạy ({attempt.steps.length})
              </h3>
              <ul className="flex flex-col gap-0.5">
                {attempt.steps.map((step) => (
                  <li key={step.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-foreground">{step.id}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {ticks(step.durationTicks)}
                      {step.cacheHit === null ? '' : step.cacheHit ? ' · cache trúng' : ' · cache trượt'}
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
