'use client';

import type { ReactElement } from 'react';
import { renderCopy, t } from '@devops-platform/copy';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { IssueList } from './studio/inspector';
import { describeLessonPath, toLessonIssues } from './lesson-issues';
import { describeScriptReport, summarizeScriptChecks } from './script-warning';
import type { PublishPhase } from './publish-machine';
import type { PublishCheckResult } from './publish-panel';
import { Icon, Notice, Pill } from '@devops-platform/ds';

/**
 * Kết quả lượt Kiểm tra: lỗi định dạng (CHẶN xuất bản) và cảnh báo shellcheck
 * (KHÔNG chặn). Lỗi đi qua `toLessonIssues`, nên người soạn đọc "Bước 2, Script
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
        <Notice tone="ok" title={t('author.publish-panel-dinh-dang-hop-le')}>
            {t('author.publish-panel-bai-qua-dung-schema-ma-luot-xuat-ban-se-dung')}
          </Notice>
      ) : (
        <div className="flex flex-col gap-2 border border-t-2 border-rule border-t-bad-mid bg-paper px-4 py-3">
          <p className="text-sm font-semibold text-bad-ink">
            {t('author.publish.check.blocked')}
          </p>
          <IssueList issues={toLessonIssues(props.kind, result.issues)} onJump={props.onJump} />
        </div>
      )}

      <Notice
        tone={summary.tone === 'warn' || summary.tone === 'unknown' ? 'warn' : 'info'}
        title={
          <>
            {t('author.publish-panel-shellcheck')} {renderCopy(summary.label)}
          </>
        }
      >
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
                      <Pill tone={view.tone === 'unknown' ? 'warn' : 'neutral'}>
                        {renderCopy(view.label)}
                      </Pill>
                    </span>
                    {view.detail !== null && <span className="text-xs">{renderCopy(view.detail)}</span>}
                    {warning.report.findings.map((f) => (
                      <span key={`${String(f.line)}-${f.code}`} className="font-mono text-xs">
                        {t('author.publish-panel-dong')} {f.line}, {f.code}: {f.message}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
      </Notice>
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
        <Notice tone="info"><span className="flex items-center gap-2">
            <Icon name="send" size={16} className="animate-breathe" /> {t('author.publish-panel-dang-gui-yeu-cau-xuat-ban')}
          </span></Notice>
      );
    case 'running':
      return (
        <Notice tone="warn" title={t('author.publish-panel-dang-chay-thu-trong-sandbox')}><span className="flex items-center gap-2">
            <Icon name="hourglass" size={16} className="shrink-0 animate-breathe" />
            {t(
              'author.publish-panel-trang-dang-hoi-lai-may-chu-vai-giay-mot-lan-may-chu-khong-bao-dang-chay-toi',
            )}
          </span></Notice>
      );
    case 'passed':
      return (
        <Notice tone="ok" title={t('author.publish.passed')}>{/* e2e neo vào HEADING này, không vào ô trạng thái ở đầu trang. */}
            {phase.promotedTo === null
              ? t('author.publish-panel-bai-da-len-va-nguoi-hoc-thay-duoc')
              : t(
                  'author.publish-panel-ban-nhap-da-thay-the-bai-dang-chay-va-tu-bien-mat-tu-gio-hay-sua-tren-id-do',
                  { phasePromotedto: String(phase.promotedTo) },
                )}
          </Notice>
      );
    case 'failed':
      return (
        <Notice tone="bad" title={t('author.publish-panel-luot-chay-thu-truot-bai-quay-ve-nhap')}>
            {t('author.publish-panel-chi-tiet-o-bang-duoi-sua-cho-duoc-neu-roi-xuat-ban-lai')}
          </Notice>
      );
    case 'lost':
      return (
        <Notice tone="warn" title={t('author.publish-panel-khong-con-dau-vet-cua-luot-chay-thu')}>
            {t(
              'author.publish-panel-bai-quay-ve-nhap-ma-may-chu-khong-ghi-lai-ly-do-nao-thuong-la-tien-trinh-ch',
            )}
          </Notice>
      );
  }
}
