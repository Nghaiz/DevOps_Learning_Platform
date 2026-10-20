'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { count, t } from '@devops-platform/copy';
import { RailSection, saveStatusOf } from '../../../../components/author/studio';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import type { FieldIssue } from '../cluster-form';
import { emptyForm, type ProblemFormState } from '../problem-form';
import { toProblemDraft } from '../problem-draft';
import { ProblemEditor } from '../problem-editor';
import { publishIssues } from '../problem-validate';
import { SaveToolbar } from '../save-toolbar';
import { toast } from '@devops-platform/ds';

/**
 * `/author/problems/new`: soạn một bài mới. Luôn ra một bản NHÁP.
 *
 * ## Vì sao trang này KHÔNG có chế độ Xuất bản
 *
 * Bài chưa tồn tại thì chưa có mã, mà `problems.publish` định vị bài bằng mã.
 * Đường duy nhất: tạo nháp, máy chủ cấp mã, sang trang sửa, xuất bản. Một nút
 * "tạo và xuất bản luôn" ghép hai lời gọi vào một nút và mất trạng thái giữa
 * chừng khi lời gọi thứ hai đỏ.
 *
 * ## Lưu nháp chỉ đòi bài CHUYỂN ĐƯỢC sang payload
 *
 * `toProblemDraft` chỉ đỏ khi giá trị không serialise nổi (JSON hỏng, ô số không
 * phải số). Điều kiện xuất bản (mục tiêu, trần 150 từ) để dành cho trang sửa:
 * bắt hoàn thiện bài trước lần lưu đầu là mất công người đang viết dở. Cột kiểm
 * vẫn đếm trước số chỗ chặn xuất bản để người soạn biết đường còn bao xa.
 *
 * ⛔ Không dựng `<main>` (C6bis): vỏ ứng dụng sở hữu landmark đó.
 */
export function ProblemNewClient(): ReactElement {
  const router = useRouter();
  const utils = api.useUtils();

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `new-${String(keyCounter.current)}`;
  }, []);

  const [form, setForm] = useState<ProblemFormState>(() => emptyForm(nextKey));
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const gateCount = useMemo(() => publishIssues(form).length, [form]);

  const create = api.problems.create.useMutation({
    onSuccess: (problem) => {
      void utils.problems.mine.invalidate();
      toast.success(t('author.problem.new.created-title', { code: problem.code }), { description: t('author.problem.new.created-body') });
      router.push(`/author/problems/${encodeURIComponent(problem.code)}`);
    },
  });

  const status = saveStatusOf({
    persisted: false,
    dirty: true,
    saving: create.isPending,
    failed: create.error !== null,
  });

  const submit = (): void => {
    const draft = toProblemDraft(form);
    if (!draft.ok) {
      setIssues(draft.issues);
      return;
    }
    setIssues([]);
    create.mutate(draft.value);
  };

  return (
    <ProblemEditor
      form={form}
      onChange={setForm}
      nextKey={nextKey}
      code={null}
      state="draft"
      title={form.title.trim() === '' ? t('author.problem.new.title') : form.title}
      issues={issues}
      saveStatus={status}
      toolbar={(nav) => (
        <SaveToolbar
          status={status}
          label={t('author.studio.action.save-draft')}
          onSave={submit}
          pending={create.isPending}
          disabled={false}
          serverError={create.error === null ? null : describeTrpcError(create.error)}
          localIssues={issues}
          onJump={nav.jump}
        />
      )}
      readiness={() => (
        <RailSection title={t('author.studio.rail.readiness')} tone={gateCount > 0 ? 'warn' : 'accent'}>
          <p>{t('author.problem.new.submit-hint')}</p>
          {gateCount > 0 && (
            <p className="text-ink-2">{count('author.problem.publish.blocked-title', gateCount)}</p>
          )}
        </RailSection>
      )}
    />
  );
}
