'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Badge, Spinner } from '@devops-platform/ui';
import { renderCopy, t } from '@devops-platform/copy';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { IssueList } from './studio/inspector';
import { describeLessonPath, toLessonIssues } from './lesson-issues';
import { describeScriptReport, summarizeScriptChecks } from './script-warning';
import type { PublishPhase } from './publish-machine';
import type { PublishCheckResult } from './publish-panel';

/**
 * Kết quả lượt Kiểm tra: lỗi định dạng (CHẶN xuất bản) và cảnh báo shellcheck
 * (KHÔNG chặn). Lỗi đi qua `toLessonIssues`, nên người soạn đọc "Bước 2 · Script
 * chấm" chứ không đọc `steps.1.verifyScript`, và bấm vào là về đúng ô.
 */
export function CheckReport(props: {
  readonly kind: ContentKind;
  readonly result: PublishCheckResult;
  readonly onJump: (path: string) => void;
}): ReactElement {
  const { result } = props;
  const summary = summarizeScriptChecks(result.scriptWarnings, result.scriptCount);

  return (
    <div className="flex flex-col gap-4">
      {result.issues.length === 0 ? (
        <Alert variant="success">
          <AlertTitle>{t('author.publish-panel-dinh-dang-hop-le')}</AlertTitle>
          <AlertDescription>
            {t('author.publish-panel-bai-qua-dung-schema-ma-luot-xuat-ban-se-dung')}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2 border-t-4 border-destructive pt-3">
          <p className="text-sm font-semibold text-destructive">
            {t('author.publish.check.blocked')}
          </p>
          <IssueList issues={toLessonIssues(props.kind, result.issues)} onJump={props.onJump} />
        </div>
      )}

      <Alert variant={summary.tone === 'warn' || summary.tone === 'unknown' ? 'warning' : 'default'}>
        <AlertTitle>
          {t('author.publish-panel-shellcheck')} {renderCopy(summary.label)}
        </AlertTitle>
        <AlertDescription>
          {result.scriptWarnings.length === 0 ? (
            <p>{t('author.publish-panel-canh-bao-shellcheck-khong-bao-gio-chan-xuat-ban')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {result.scriptWarnings.map((warning) => {
                const view = describeScriptReport(warning.report);
                return (
                  <li key={warning.path} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{describeLessonPath(props.kind, warning.path).field}</span>
                      <Badge variant={view.tone === 'unknown' ? 'warning' : 'secondary'}>
                        {renderCopy(view.label)}
                      </Badge>
                    </span>
                    {view.detail !== null && <span className="text-xs">{renderCopy(view.detail)}</span>}
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

/** Trạng thái của lượt xuất bản, đọc từ `publishPhase` (một nguồn, xem `publish-machine.ts`). */
export function PhaseReport({ phase }: { readonly phase: PublishPhase }): ReactElement | null {
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
          {/* e2e neo vào HEADING này, không vào ô trạng thái ở đầu trang. */}
          <AlertTitle>{t('author.publish.passed')}</AlertTitle>
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
