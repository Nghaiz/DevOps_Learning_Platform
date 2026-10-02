'use client';

import type { ReactElement } from 'react';
import { CircleAlert, Save, TriangleAlert } from 'lucide-react';
import { count, t } from '@devops-platform/copy';
import { Button } from '@devops-platform/ui';
import { SaveState, type SaveStatus } from '../../../components/author/studio';
import type { FieldIssue } from './cluster-form';

/**
 * Cụm lưu trên thanh chế độ dính của trình soạn đề: lỗi của lượt lưu, ô trạng
 * thái lưu, nút lưu. Dùng chung cho trang tạo mới (nút "Lưu bản nháp") lẫn trang
 * sửa (nút "Lưu").
 *
 * Hai loại "không lưu được", hai câu khác nhau, cùng đứng CẠNH nút vừa bấm:
 *
 * - `localIssues`: biểu mẫu chưa chuyển nổi sang payload (JSON hỏng, ô số không
 *   phải số). Lượt lưu CHƯA rời máy. Câu đếm là một nút đưa focus về ô đầu tiên.
 * - `serverError`: máy chủ đã nhận và từ chối. Câu của máy chủ hiện nguyên văn,
 *   và ô trạng thái lưu chuyển sang "Không lưu được" (`saveStatusOf`).
 */
export function SaveToolbar(props: {
  readonly status: SaveStatus;
  readonly label: string;
  readonly onSave: () => void;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly serverError: string | null;
  readonly localIssues: readonly FieldIssue[];
  readonly onJump: (path: string) => void;
}): ReactElement {
  const first = props.localIssues[0];
  return (
    <>
      {props.serverError !== null && !props.pending && (
        <p role="alert" className="flex max-w-md animate-rise items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="flex flex-col">
            <span className="font-semibold">{t('author.studio.action-error.save')}</span>
            <span>{props.serverError}</span>
          </span>
        </p>
      )}
      {first !== undefined && (
        <button
          type="button"
          onClick={() => {
            props.onJump(first.path);
          }}
          className="inline-flex h-8 animate-rise items-center gap-1.5 px-1 text-xs font-medium text-destructive underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          {count('author.problem.new.issues-title', props.localIssues.length)}
        </button>
      )}
      <SaveState status={props.status} />
      <Button
        type="button"
        onClick={props.onSave}
        loading={props.pending}
        disabled={props.disabled}
        iconLeft={<Save aria-hidden className="size-4" />}
      >
        {props.label}
      </Button>
    </>
  );
}
