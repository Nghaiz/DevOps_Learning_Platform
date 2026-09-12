'use client';

import { t } from '@devops-platform/copy';
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
import { renderCopy } from '@devops-platform/copy';
import type { PreviewPayload } from './draft-from-preview';
import {
  describeScriptReport,
  summarizeScriptChecks,
  type ScriptWarningView,
} from './script-warning';
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
        <h2 className="text-lg font-semibold text-foreground">
          {t('author.publish-panel-1-kiem-tra-truoc')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'author.publish-panel-kiem-tra-khong-doi-trang-thai-bai-va-khong-ton-sandbox-nao-no-chay-dung-sch',
          )}
        </p>
        <div>
          <Button variant="outline" onClick={props.onCheck} loading={props.checking}>
            {t('author.publish-panel-kiem-tra')}
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
        <h2 className="text-lg font-semibold text-foreground">
          {t('author.publish-panel-2-xuat-ban')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'author.publish-panel-xuat-ban-dung-mot-sandbox-that-va-chay-lan-luot-moi-script-cua-bai-viec-nay',
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={props.onPublish}
            loading={props.phase.kind === 'submitting'}
            disabled={
              blocked || props.phase.kind === 'running' || props.phase.kind === 'submitting'
            }
          >
            {t('author.problem.publish.submit')}
          </Button>
          {props.canArchive && (
            <Button
              variant="outline"
              onClick={() => {
                setConfirmArchive(true);
              }}
              disabled={props.archiving}
            >
              {t('author.problem.state.archived')}
            </Button>
          )}
        </div>
        {blocked && (
          <p className="text-sm text-muted-foreground">
            {t(
              'author.publish-panel-nut-xuat-ban-dang-tat-vi-luot-kiem-tra-con-loi-dinh-dang-o-tren-sua-roi-kie',
            )}
          </p>
        )}

        <PhaseReport phase={props.phase} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {t('author.publish-panel-3-ket-qua-chay-thu')}
        </h2>
        <TrialReport phase={props.phase} plan={plan} publishError={props.publishError} />
      </section>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('author.publish-panel-luu-tru-bai-nay')}</DialogTitle>
            <DialogDescription>
              {t(
                'author.publish-panel-bai-se-bien-khoi-danh-muc-nguoi-hoc-tien-do-va-diem-da-co-khong-bi-xoa-nen',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('common.action.cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={props.archiving}
              onClick={() => {
                setConfirmArchive(false);
                props.onArchive();
              }}
            >
              {t('author.problem.state.archived')}
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
          <AlertTitle>{t('author.publish-panel-dinh-dang-hop-le')}</AlertTitle>
          <AlertDescription>
            {t('author.publish-panel-bai-qua-dung-schema-ma-luot-xuat-ban-se-dung')}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>
            {props.issues.length} {t('author.publish-panel-loi-dinh-dang-chan-xuat-ban')}
          </AlertTitle>
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

      <Alert
        variant={summary.tone === 'warn' || summary.tone === 'unknown' ? 'warning' : 'default'}
      >
        <AlertTitle>
          {t('author.publish-panel-shellcheck')} {summary.label}
        </AlertTitle>
        <AlertDescription>
          {props.warnings.length === 0 ? (
            <p>{t('author.publish-panel-canh-bao-shellcheck-khong-bao-gio-chan-xuat-ban')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {props.warnings.map((warning) => {
                const view = describeScriptReport(warning.report);
                return (
                  <li key={warning.path} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs">{warning.path}</code>
                      <Badge variant={view.tone === 'unknown' ? 'warning' : 'secondary'}>
                        {view.label}
                      </Badge>
                    </span>
                    {view.detail !== null && <span className="text-xs">{view.detail}</span>}
                    {warning.report.findings.map((f) => (
                      <span key={`${String(f.line)}-${f.code}`} className="font-mono text-xs">
                        {t('author.publish-panel-dong')} {f.line} · {f.code} · {f.message}
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
            <Spinner size="sm" /> {t('author.publish-panel-dang-gui-yeu-cau-xuat-ban')}
          </AlertDescription>
        </Alert>
      );
    case 'running':
      return (
        <Alert variant="warning">
          <AlertTitle>{t('author.publish-panel-dang-chay-thu-trong-sandbox')}</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            <Spinner size="sm" />
            {t(
              'author.publish-panel-trang-dang-hoi-lai-may-chu-vai-giay-mot-lan-may-chu-khong-bao-dang-chay-toi',
            )}
          </AlertDescription>
        </Alert>
      );
    case 'passed':
      return (
        <Alert variant="success">
          <AlertTitle>{t('author.problem.publish.already')}</AlertTitle>
          <AlertDescription>
            {phase.promotedTo === null
              ? t('author.publish-panel-bai-da-len-va-nguoi-hoc-thay-duoc')
              : t(
                  'author.publish-panel-ban-nhap-da-thay-the-bai-dang-chay-va-tu-bien-mat-tu-gio-hay-sua-tren-id-do',
                  { phasePromotedto: String(phase.promotedTo) },
                )}
          </AlertDescription>
        </Alert>
      );
    case 'failed':
      return (
        <Alert variant="destructive">
          <AlertTitle>{t('author.publish-panel-luot-chay-thu-truot-bai-quay-ve-nhap')}</AlertTitle>
          <AlertDescription>
            {t('author.publish-panel-chi-tiet-o-bang-duoi-sua-cho-duoc-neu-roi-xuat-ban-lai')}
          </AlertDescription>
        </Alert>
      );
    case 'lost':
      return (
        <Alert variant="warning">
          <AlertTitle>{t('author.publish-panel-khong-con-dau-vet-cua-luot-chay-thu')}</AlertTitle>
          <AlertDescription>
            {t(
              'author.publish-panel-bai-quay-ve-nhap-ma-may-chu-khong-ghi-lai-ly-do-nao-thuong-la-tien-trinh-ch',
            )}
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
        {t(
          'author.publish-panel-bai-nay-khong-co-script-nao-luot-chay-thu-cua-no-la-chinh-viec-sandbox-dung',
        )}
      </p>
    );
  }

  if (props.phase.kind === 'idle' || props.phase.kind === 'archived') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t(
            'author.publish-panel-chua-chay-lan-nao-day-la-nhung-gi-luot-xuat-ban-se-chay-dung-thu-tu',
          )}
        </p>
        <TrialTable
          rows={props.plan.map((plan) => ({ plan, status: 'pending' as TrialStepStatus }))}
        />
      </div>
    );
  }

  if (props.phase.kind === 'running' || props.phase.kind === 'submitting') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t(
            'author.publish-panel-dang-chay-may-chu-khong-phat-tien-do-tung-buoc-nen-moi-dong-duoi-day-con-o',
          )}
        </p>
        <TrialTable
          rows={props.plan.map((plan) => ({ plan, status: 'pending' as TrialStepStatus }))}
        />
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
        <AlertTitle>
          {t('author.publish-panel-khong-khop-duoc-loi-voi-buoc-nao-cua-bai')}
        </AlertTitle>
        <AlertDescription>
          <p>
            {t(
              'author.publish-panel-noi-dung-bai-co-the-da-doi-sau-luot-xuat-ban-do-day-la-nguyen-van-loi-may-c',
            )}
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
            {t('author.publish-panel-output-cua')}{' '}
            <code className="font-mono">{failure.label}</code> {t('author.publish-panel-exit')}{' '}
            {failure.exitCode})
          </p>
          <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
            {failure.output}
          </pre>
        </div>
      )}
      {failure !== null && failure.kind !== 'step' && (
        <Alert variant="destructive">
          <AlertTitle>{t('author.publish-panel-truot-truoc-khi-chay-duoc-buoc-nao')}</AlertTitle>
          <AlertDescription>
            <pre className="whitespace-pre-wrap font-mono text-xs">{failure.message}</pre>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

const STATUS_BADGE: Readonly<
  Record<TrialStepStatus, 'success' | 'secondary' | 'destructive' | 'outline'>
> = {
  passed: 'success',
  ran: 'secondary',
  failed: 'destructive',
  skipped: 'outline',
  pending: 'outline',
};

function TrialTable(props: {
  readonly rows: readonly {
    plan: { label: string; description: string };
    status: TrialStepStatus;
  }[];
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
