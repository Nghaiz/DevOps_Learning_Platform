'use client';

import type { ReactElement } from 'react';
import { Archive, CircleAlert, ScanSearch, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, Button } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { Split } from '../kit';
import { ConfirmDialog } from '../admin/confirm-dialog';
import type { PreviewPayload } from './draft-from-preview';
import type { ScriptWarningView } from './script-warning';
import type { PublishPhase } from './publish-machine';
import { trialPlanFor } from './trial-plan';
import { CheckReport, PhaseReport } from './publish-reports';
import { TrialReport } from './publish-trial';

export interface PublishCheckResult {
  readonly issues: readonly { path: string; message: string }[];
  readonly scriptWarnings: readonly ScriptWarningView[];
  /** Số script lượt kiểm đã soi. `0` khác "không có cảnh báo": xem `summarizeScriptChecks`. */
  readonly scriptCount: number;
}

/**
 * Chế độ Xuất bản của trình soạn bài học/lab/sân chơi.
 *
 * Bốn khối đánh số: kiểm tra trước, chạy thử rồi xuất bản, kết quả chạy thử, lưu
 * trữ. Lỗi của từng nút hiện NGAY CẠNH nút đó: bản cũ đẩy lỗi xuất bản và lỗi lưu
 * trữ vào khối của tab Soạn, nên người bấm ở tab này không thấy gì xảy ra.
 *
 * ## Kiểm tra và Xuất bản đọc bản ĐÃ LƯU
 *
 * Cả `authoring.check` lẫn `authoring.publish` đọc bản trên máy chủ, không đọc
 * biểu mẫu. Khi màn hình lệch bản đã lưu (`saveFirst`), hai nút khoá lại và khối
 * đầu nói ra lý do. Không khoá thì người soạn kiểm một thứ và phát hành thứ khác.
 */
export function PublishPanel(props: {
  readonly kind: ContentKind;
  readonly phase: PublishPhase;
  readonly preview: PreviewPayload | null;
  readonly publishError: string | null;
  readonly checkResult: PublishCheckResult | null;
  readonly checking: boolean;
  readonly onCheck: () => void;
  readonly onJump: (path: string) => void;
  readonly saveFirst: boolean;
  readonly onPublish: () => void;
  /** Lỗi máy chủ của lượt bấm Xuất bản gần nhất. */
  readonly actionError: string | null;
  readonly canArchive: boolean;
  readonly archiving: boolean;
  readonly archiveOpen: boolean;
  readonly onArchiveOpenChange: (open: boolean) => void;
  readonly onArchive: () => void;
  readonly archiveError: string | null;
}): ReactElement {
  const plan = props.preview === null ? [] : trialPlanFor(props.preview);
  const blocked = (props.checkResult?.issues.length ?? 0) > 0;
  const running = props.phase.kind === 'running' || props.phase.kind === 'submitting';

  return (
    <div className="flex flex-col gap-12">
      {props.saveFirst && (
        <Alert variant="warning">
          <AlertTitle>{t('author.studio.publish.save-first.title')}</AlertTitle>
          <AlertDescription>{t('author.studio.publish.save-first.body')}</AlertDescription>
        </Alert>
      )}

      <Split index="01" title={t('author.publish.section.check')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'author.publish-panel-kiem-tra-khong-doi-trang-thai-bai-va-khong-ton-sandbox-nao-no-chay-dung-sch',
            )}
          </p>
          <div>
            <Button
              variant="outline"
              onClick={props.onCheck}
              loading={props.checking}
              disabled={props.saveFirst}
              iconLeft={<ScanSearch aria-hidden className="size-4" />}
            >
              {t('author.publish-panel-kiem-tra')}
            </Button>
          </div>
          {props.checkResult !== null && (
            <CheckReport kind={props.kind} result={props.checkResult} onJump={props.onJump} />
          )}
        </div>
      </Split>

      <Split index="02" title={t('author.publish.section.run')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'author.publish-panel-xuat-ban-dung-mot-sandbox-that-va-chay-lan-luot-moi-script-cua-bai-viec-nay',
            )}
          </p>
          <div>
            <Button
              onClick={props.onPublish}
              loading={props.phase.kind === 'submitting'}
              disabled={props.saveFirst || blocked || running}
              iconRight={<Send aria-hidden className="size-4" />}
            >
              {t('author.studio.action.publish')}
            </Button>
          </div>
          {blocked && (
            <p className="text-sm text-muted-foreground">
              {t(
                'author.publish-panel-nut-xuat-ban-dang-tat-vi-luot-kiem-tra-con-loi-dinh-dang-o-tren-sua-roi-kie',
              )}
            </p>
          )}
          {props.actionError !== null && (
            <p role="alert" className="flex animate-rise items-start gap-2 text-sm font-medium text-destructive">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {t('author.studio.action-error.publish')}: {props.actionError}
              </span>
            </p>
          )}
          <PhaseReport phase={props.phase} />
        </div>
      </Split>

      <Split index="03" title={t('author.publish.section.trial')}>
        <TrialReport phase={props.phase} plan={plan} publishError={props.publishError} />
      </Split>

      {props.canArchive && (
        <Split index="04" title={t('author.publish.section.archive')}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t(
                'author.publish-panel-bai-se-bien-khoi-danh-muc-nguoi-hoc-tien-do-va-diem-da-co-khong-bi-xoa-nen',
              )}
            </p>
            <div>
              <Button
                variant="destructive"
                onClick={() => {
                  props.onArchiveOpenChange(true);
                }}
                disabled={props.archiving}
                iconLeft={<Archive aria-hidden className="size-4" />}
              >
                {t('author.studio.action.archive')}
              </Button>
            </div>
          </div>
        </Split>
      )}

      <ConfirmDialog
        open={props.archiveOpen}
        onOpenChange={props.onArchiveOpenChange}
        title={t('author.publish-panel-luu-tru-bai-nay')}
        body={t(
          'author.publish-panel-bai-se-bien-khoi-danh-muc-nguoi-hoc-tien-do-va-diem-da-co-khong-bi-xoa-nen',
        )}
        loss={t('author.publish.archive-loss')}
        blockedReason={null}
        error={props.archiveError}
        confirmLabel={t('author.studio.action.archive')}
        confirming={props.archiving}
        onConfirm={props.onArchive}
      />
    </div>
  );
}
