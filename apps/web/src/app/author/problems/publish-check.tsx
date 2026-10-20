'use client';

import { useState, type ReactElement } from 'react';
import { count, t } from '@devops-platform/copy';
import type { ProblemState } from '@devops-platform/games';
import { IssueList, mustSaveBeforePublish, type SaveStatus, type StudioIssue } from '../../../components/author/studio';
import { FormBlock } from '../../../components/author/studio';
import type { ProblemAction } from './[code]/use-problem-mutations';
import { Button, Notice, ConfirmDialog } from '@devops-platform/ds';

/**
 * Chế độ Xuất bản của trang sửa: cổng kiểm, lưu trữ, xoá.
 *
 * ## Khoá khi màn hình lệch bản đã lưu
 *
 * Cổng kiểm chạy trên BIỂU MẪU, còn `problems.publish` phát hành bản trên MÁY
 * CHỦ. Cho bấm khi đang có thay đổi chưa lưu là kiểm một thứ, phát hành một thứ
 * khác (`mustSaveBeforePublish`). Nên chưa lưu thì nút khoá và khối "Lưu trước
 * khi xuất bản" nói lý do.
 *
 * ## ⚠ HAI phép kiểm ở đây KHÔNG có bản sao ở máy chủ
 *
 * Tham số BẮT BUỘC của từng vị từ, và ràng buộc "một trong hai" của
 * `pod-running` / `secret-mounted` / `volume-mounted`. `objectiveSchema` phía máy
 * chủ chỉ kiểm `check` là chuỗi không rỗng, vì bảng `PREDICATES` sống trong
 * engine. Ai gọi thẳng `problems.publish` qua tRPC sẽ đi vòng qua hai phép kiểm
 * này: khoảng trống ĐÃ BIẾT, đã báo lead, không phải một lớp bảo vệ.
 *
 * ## Lỗi đứng cạnh hành động sinh ra nó
 *
 * Lỗi xuất bản ngay dưới nút Xuất bản. Lưu trữ và xoá đi qua hộp xác nhận nói
 * rõ thứ mất đi, và lỗi của chúng hiện TRONG hộp (`ConfirmDialog.error`), nơi
 * người bấm đang nhìn. Nút xoá đứng riêng ở cuối, không cạnh nút lưu trữ.
 */
export function ProblemPublishPanel(props: {
  readonly code: string;
  readonly state: ProblemState;
  readonly saveStatus: SaveStatus;
  readonly gateIssues: readonly StudioIssue[];
  readonly busy: boolean;
  readonly publish: ProblemAction;
  readonly archive: ProblemAction;
  readonly remove: ProblemAction;
  readonly onJump: (path: string) => void;
}): ReactElement {
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const saveFirst = mustSaveBeforePublish(props.saveStatus);
  const blocked = props.gateIssues.length > 0;
  const live = props.state === 'published';

  const openConfirm = (kind: 'archive' | 'delete'): void => {
    (kind === 'archive' ? props.archive : props.remove).reset();
    setConfirm(kind);
  };

  return (
    <>
      <FormBlock title={t('author.problem.publish.heading')}>
        <div className="flex flex-col gap-4">
          {live ? (
            <Notice tone="ok" title={t('author.problem.publish.live-title')} className="animate-enter">{t('author.problem.publish.live-body')}</Notice>
          ) : saveFirst ? (
            <Notice tone="warn" title={t('author.studio.publish.save-first.title')} className="animate-enter">{t('author.studio.publish.save-first.body')}</Notice>
          ) : blocked ? (
            <div className="flex flex-col gap-2 animate-enter">
              <p className="font-display text-lg font-semibold text-ink text-bad-ink">
                {count('author.problem.publish.blocked-title', props.gateIssues.length)}
              </p>
              <IssueList issues={props.gateIssues} onJump={props.onJump} />
            </div>
          ) : (
            <Notice tone="ok" title={t('author.problem.publish.ok-title')} className="animate-enter">{t('author.problem.publish.ok-body')}</Notice>
          )}

          {!live && (
            <div>
              <Button variant="primary"
                type="button"
                disabled={saveFirst || blocked || props.busy}
                loading={props.publish.pending}
                icon="publish"
                onClick={() => {
                  props.publish.run();
                }}
              >
                {t('author.studio.action.publish')}
              </Button>
            </div>
          )}
          {props.publish.error !== null && (
            <Notice tone="bad" title={t('author.studio.action-error.publish')} className="animate-enter">{props.publish.error}</Notice>
          )}
        </div>
      </FormBlock>

      <FormBlock title={t('author.studio.action.archive')} note={t('author.problem.archive.lead')}>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={props.busy || props.state === 'archived'}
            icon="archive"
            onClick={() => {
              openConfirm('archive');
            }}
          >
            {t('author.studio.action.archive')}
          </Button>
        </div>
      </FormBlock>

      <FormBlock title={t('author.problem.publish.danger-heading')} note={t('author.problem.publish.danger-body')}>
        <div>
          <Button
            type="button"
            variant="danger"
            disabled={props.busy}
            icon="trash"
            onClick={() => {
              openConfirm('delete');
            }}
          >
            {t('author.studio.action.delete')}
          </Button>
        </div>
      </FormBlock>

      <ConfirmDialog open={confirm === 'archive'} onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }} title={t('author.problem.archive.confirm-title', { code: props.code })} body={t('author.problem.archive.confirm-body')} loss={t('author.problem.archive.loss')} blockedReason={null} error={withTitle(t('author.studio.action-error.archive'), props.archive.error)} confirmLabel={t('author.studio.action.archive')} cancelLabel={t('common.action.cancel')} confirming={props.archive.pending} onConfirm={() => {
          props.archive.run({
            onSuccess: () => {
              setConfirm(null);
            },
          });
        }} />
      <ConfirmDialog open={confirm === 'delete'} onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }} title={t('author.problem.delete.confirm-title', { code: props.code })} body={t('author.problem.publish.danger-body')} loss={t('author.problem.delete.loss')} blockedReason={null} error={withTitle(t('author.studio.action-error.delete'), props.remove.error)} confirmLabel={t('author.studio.action.delete')} cancelLabel={t('common.action.cancel')} confirming={props.remove.pending} onConfirm={() => {
          props.remove.run();
        }} />
    </>
  );
}

/** `ConfirmDialog` in lỗi không kèm tiêu đề, nên câu "không làm được gì" đứng trước câu của máy chủ. */
function withTitle(title: string, error: string | null): string | null {
  return error === null ? null : `${title}. ${error}`;
}
