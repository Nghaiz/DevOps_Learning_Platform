'use client';

import { useState, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@devops-platform/ui';
import { renderCopy } from '../catalog/catalog-labels';
import type { PreviewPayload } from './draft-from-preview';
import { describeScriptReport, summarizeScriptChecks, type ScriptWarningView } from './script-warning';
import type { PublishPhase } from './publish-machine';
import {
  TRIAL_STATUS_LABELS,
  mergeTrialOutcome,
  parsePublishFailure,
  trialPlanFor,
  type TrialStepStatus,
} from './trial-plan';

/**
 * Tab Xuất bản: Kiểm tra → Xuất bản → theo dõi lượt chạy thử THẬT (task 22).
 *
 * Ba thứ được vẽ RIÊNG vì chúng có ba mức nghiêm trọng khác nhau, và gộp chúng
 * là cách chắc chắn nhất để người soạn bỏ qua thứ quan trọng:
 *
 * 1. **`issues`** — sai định dạng. CHẶN xuất bản.
 * 2. **`scriptWarnings`** — shellcheck. KHÔNG chặn, và "chưa kiểm được" hiện
 *    khác hẳn "sạch" (xem `script-warning.ts`).
 * 3. **Lượt chạy thử** — setup + verify từng bước, chạy trong một sandbox thật.
 */
export function PublishPanel(props: {
  readonly phase: PublishPhase;
  readonly preview: PreviewPayload | null;
  readonly publishError: string | null;
  readonly checkResult: {
    issues: readonly { path: string; message: string }[];
    scriptWarnings: readonly ScriptWarningView[];
    /** Số script LƯỢT KIỂM đã soi — xem chú thích ở chỗ truyền xuống `CheckReport`. */
    scriptCount: number;
  } | null;
  readonly checking: boolean;
  readonly onCheck: () => void;
  readonly onPublish: () => void;
  readonly onArchive: () => void;
  readonly archiving: boolean;
  readonly canArchive: boolean;
}): ReactElement {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const plan = props.preview === null ? [] : trialPlanFor(props.preview);
  const blocked = (props.checkResult?.issues.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">1. Kiểm tra trước</h2>
        <p className="text-sm text-muted-foreground">
          Kiểm tra không đổi trạng thái bài và không tốn sandbox nào. Nó chạy đúng schema mà lượt xuất bản sẽ
          dùng, cộng thêm shellcheck cho từng script.
        </p>
        <div>
          <Button variant="outline" onClick={props.onCheck} loading={props.checking}>
            Kiểm tra
          </Button>
        </div>

        {props.checkResult !== null && (
          <CheckReport
            issues={props.checkResult.issues}
            warnings={props.checkResult.scriptWarnings}
            // ⚠ Số này đến từ CHÍNH lượt kiểm, không từ `plan.length`.
            //
            // `plan` là kế hoạch của lượt CHẠY THỬ và nó dựng từ `preview`, mà
            // `preview` là `null` cho tới khi bài được xuất bản — nên trước đó
            // `plan.length` luôn bằng 0. Hệ quả đo được trên cụm 2026-09-07:
            // tóm tắt hiện "Bài này không có script nào để kiểm" trong khi ngay
            // dưới nó liệt kê `steps[0].verifyScript — chưa kiểm được (ENOENT
            // spawn shellcheck)". Hai dòng cạnh nhau nói ngược nhau, và dòng
            // SAI là dòng to hơn.
            //
            // `script-warning.ts` đã ghi rõ vì sao `scriptCount` là tham số bắt
            // buộc ("bài không có script nào cũng ra mảng rỗng, và hai chuyện đó
            // khác nhau") — cổng đúng, nhưng đầu vào của nó lấy từ nhầm pha.
            scriptCount={props.checkResult.scriptCount}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">2. Xuất bản</h2>
        <p className="text-sm text-muted-foreground">
          Xuất bản dựng một sandbox thật và chạy lần lượt mọi script của bài. Việc này mất vài phút, riêng dựng
          sandbox cho bài Kubernetes đã tới ~49 giây. Bạn đóng tab được; lượt chạy thử không dừng theo.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={props.onPublish}
            loading={props.phase.kind === 'submitting'}
            disabled={blocked || props.phase.kind === 'running' || props.phase.kind === 'submitting'}
          >
            Xuất bản
          </Button>
          {props.canArchive && (
            <Button
              variant="outline"
              onClick={() => {
                setConfirmArchive(true);
              }}
              disabled={props.archiving}
            >
              Lưu trữ
            </Button>
          )}
        </div>
        {blocked && (
          <p className="text-sm text-muted-foreground">
            Nút Xuất bản đang tắt vì lượt kiểm tra còn lỗi định dạng ở trên. Sửa rồi kiểm tra lại.
          </p>
        )}

        <PhaseReport phase={props.phase} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">3. Kết quả chạy thử</h2>
        <TrialReport phase={props.phase} plan={plan} publishError={props.publishError} />
      </section>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lưu trữ bài này?</DialogTitle>
            <DialogDescription>
              Bài sẽ biến khỏi danh mục người học. Tiến độ và điểm đã có KHÔNG bị xoá, nền tảng không xoá nội
              dung, vì tiến độ trỏ tới id bài bằng cột text không có khoá ngoại, nên xoá sẽ làm tiến độ cũ mồ côi
              trong im lặng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Huỷ</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={props.archiving}
              onClick={() => {
                setConfirmArchive(false);
                props.onArchive();
              }}
            >
              Lưu trữ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckReport(props: {
  readonly issues: readonly { path: string; message: string }[];
  readonly warnings: readonly ScriptWarningView[];
  readonly scriptCount: number;
}): ReactElement {
  const summary = summarizeScriptChecks(props.warnings, props.scriptCount);

  return (
    <div className="flex flex-col gap-3">
      {props.issues.length === 0 ? (
        <Alert variant="success">
          <AlertTitle>Định dạng hợp lệ</AlertTitle>
          <AlertDescription>Bài qua đúng schema mà lượt xuất bản sẽ dùng.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>{props.issues.length} lỗi định dạng, chặn xuất bản</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {props.issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <code className="font-mono">{issue.path}</code>
                  {renderCopy({ key: 'author.issues.row', params: { message: issue.message } })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Alert variant={summary.tone === 'warn' || summary.tone === 'unknown' ? 'warning' : 'default'}>
        <AlertTitle>Shellcheck: {summary.label}</AlertTitle>
        <AlertDescription>
          {props.warnings.length === 0 ? (
            <p>Cảnh báo shellcheck không bao giờ chặn xuất bản.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {props.warnings.map((warning) => {
                const view = describeScriptReport(warning.report);
                return (
                  <li key={warning.path} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs">{warning.path}</code>
                      <Badge variant={view.tone === 'unknown' ? 'warning' : 'secondary'}>{view.label}</Badge>
                    </span>
                    {view.detail !== null && <span className="text-xs">{view.detail}</span>}
                    {warning.report.findings.map((f) => (
                      <span key={`${String(f.line)}-${f.code}`} className="font-mono text-xs">
                        dòng {f.line} · {f.code} · {f.message}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function PhaseReport({ phase }: { readonly phase: PublishPhase }): ReactElement | null {
  switch (phase.kind) {
    case 'idle':
    case 'archived':
      return null;
    case 'submitting':
      return (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Spinner size="sm" /> Đang gửi yêu cầu xuất bản…
          </AlertDescription>
        </Alert>
      );
    case 'running':
      return (
        <Alert variant="warning">
          <AlertTitle>Đang chạy thử trong sandbox</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            <Spinner size="sm" />
            Trang đang hỏi lại máy chủ vài giây một lần. Máy chủ KHÔNG báo đang chạy tới bước nào, chỉ có kết
            quả cuối, nên bảng dưới còn trống cho tới lúc đó.
          </AlertDescription>
        </Alert>
      );
    case 'passed':
      return (
        <Alert variant="success">
          <AlertTitle>Đã xuất bản</AlertTitle>
          <AlertDescription>
            {phase.promotedTo === null
              ? 'Bài đã lên và người học thấy được.'
              : `Bản nháp đã thay thế bài đang chạy "${phase.promotedTo}" và tự biến mất. Từ giờ hãy sửa trên id đó.`}
          </AlertDescription>
        </Alert>
      );
    case 'failed':
      return (
        <Alert variant="destructive">
          <AlertTitle>Lượt chạy thử trượt, bài quay về Nháp</AlertTitle>
          <AlertDescription>Chi tiết ở bảng dưới. Sửa chỗ được nêu rồi xuất bản lại.</AlertDescription>
        </Alert>
      );
    case 'lost':
      return (
        <Alert variant="warning">
          <AlertTitle>Không còn dấu vết của lượt chạy thử</AlertTitle>
          <AlertDescription>
            Bài quay về Nháp mà máy chủ không ghi lại lý do nào. Thường là tiến trình chạy thử bị mất giữa chừng
            (pod web khởi động lại), hoặc lượt chạy đã quá hạn treo. Bấm Xuất bản lại; nếu lặp lại nhiều lần thì
            báo người vận hành.
          </AlertDescription>
        </Alert>
      );
  }
}

function TrialReport(props: {
  readonly phase: PublishPhase;
  readonly plan: readonly { label: string; mustPass: boolean; description: string }[];
  readonly publishError: string | null;
}): ReactElement {
  if (props.plan.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Bài này không có script nào. Lượt chạy thử của nó là chính việc sandbox dựng lên được với tier và
        capability đã khai.
      </p>
    );
  }

  if (props.phase.kind === 'idle' || props.phase.kind === 'archived') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Chưa chạy lần nào. Đây là những gì lượt xuất bản sẽ chạy, đúng thứ tự:
        </p>
        <TrialTable rows={props.plan.map((plan) => ({ plan, status: 'pending' as TrialStepStatus }))} />
      </div>
    );
  }

  if (props.phase.kind === 'running' || props.phase.kind === 'submitting') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Đang chạy. Máy chủ không phát tiến độ từng bước, nên mọi dòng dưới đây còn ở &quot;Đang chờ&quot; cho
          tới khi có kết quả cuối: đó là thứ ta biết, không phải thứ đang xảy ra.
        </p>
        <TrialTable rows={props.plan.map((plan) => ({ plan, status: 'pending' as TrialStepStatus }))} />
      </div>
    );
  }

  const failure = props.phase.kind === 'failed' ? parsePublishFailure(props.phase.error) : null;
  const merged =
    props.phase.kind === 'passed'
      ? mergeTrialOutcome(props.plan, null)
      : failure === null
        ? null
        : mergeTrialOutcome(props.plan, failure);

  if (merged === null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Không khớp được lỗi với bước nào của bài</AlertTitle>
        <AlertDescription>
          <p>
            Nội dung bài có thể đã đổi sau lượt xuất bản đó. Đây là nguyên văn lỗi máy chủ ghi lại:
          </p>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs">
            {props.publishError ?? (props.phase.kind === 'failed' ? props.phase.error : '')}
          </pre>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TrialTable rows={merged} />
      {failure !== null && failure.kind === 'step' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Output của <code className="font-mono">{failure.label}</code> (exit {failure.exitCode})
          </p>
          <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">{failure.output}</pre>
        </div>
      )}
      {failure !== null && failure.kind !== 'step' && (
        <Alert variant="destructive">
          <AlertTitle>Trượt trước khi chạy được bước nào</AlertTitle>
          <AlertDescription>
            <pre className="whitespace-pre-wrap font-mono text-xs">{failure.message}</pre>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

const STATUS_BADGE: Readonly<Record<TrialStepStatus, 'success' | 'secondary' | 'destructive' | 'outline'>> = {
  passed: 'success',
  ran: 'secondary',
  failed: 'destructive',
  skipped: 'outline',
  pending: 'outline',
};

function TrialTable(props: {
  readonly rows: readonly { plan: { label: string; description: string }; status: TrialStepStatus }[];
}): ReactElement {
  return (
    <ol className="flex flex-col gap-1">
      {props.rows.map((row) => (
        <li
          key={row.plan.label}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
        >
          <Badge variant={STATUS_BADGE[row.status]}>{TRIAL_STATUS_LABELS[row.status]}</Badge>
          <span className="text-sm text-foreground">{row.plan.description}</span>
          <code className="font-mono text-xs text-muted-foreground">{row.plan.label}</code>
        </li>
      ))}
    </ol>
  );
}
