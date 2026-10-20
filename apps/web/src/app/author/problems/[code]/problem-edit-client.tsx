'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { count, t } from '@devops-platform/copy';
import { RailSection, saveStatusOf, type SaveStatus } from '../../../../components/author/studio';
import { Page } from '@devops-platform/ds';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import type { FieldIssue } from '../cluster-form';
import { pluginViewFor } from '../game-plugin-view';
import { formFromProblem, type ProblemFormState } from '../problem-form';
import { toProblemDraft } from '../problem-draft';
import { mergeIssues, toStudioIssues } from '../problem-issues';
import { PROBLEM_MODES } from '../problem-modes';
import { publishIssues } from '../problem-validate';
import { ProblemEditor, type EditorNav } from '../problem-editor';
import { ProblemPublishPanel } from '../publish-check';
import { SaveToolbar } from '../save-toolbar';
import { useProblemMutations } from './use-problem-mutations';
import { Button, ErrorBlock, Skeleton } from '@devops-platform/ds';

/** Payload đã serialise: thứ duy nhất đáng so để biết màn hình có lệch bản lưu không. */
function snapshotOf(form: ProblemFormState): string | null {
  const draft = toProblemDraft(form);
  return draft.ok ? JSON.stringify(draft.value) : null;
}

/**
 * `/author/problems/[code]`: sửa một bài đã lưu.
 *
 * ## Nạp MỘT lần cho mỗi mã
 *
 * `forEdit` được `invalidate` sau mỗi lượt lưu. Nếu effect nạp lại form mỗi lần
 * query trả về, nó ghi đè thứ người soạn đang gõ bằng bản vừa lưu. Cổng
 * `form !== null` chặn đúng chuyện đó.
 *
 * `forEdit`, KHÔNG `byCode`: `byCode` là đường của người xem và nó CHE gợi ý với
 * người không phải chủ bài. Trình soạn phải đọc được đúng thứ mình vừa viết.
 *
 * ## "Đã lưu" chỉ đến từ máy chủ
 *
 * `savedSnapshot` giữ PAYLOAD (không giữ state form, vì state mang khoá React đổi
 * mỗi lần thêm dòng) và chỉ được ghi trong `onSuccess`, bằng đúng payload đã gửi.
 * Bản cũ ghi nó trong lúc BẤM, trước khi máy chủ trả lời, nên một lượt lưu bị từ
 * chối vẫn hiện "Đã lưu" và mở khoá nút Xuất bản trên một bản máy chủ chưa có.
 *
 * ⛔ Không dựng `<main>` (C6bis). ⛔ Không `useInfiniteQuery`.
 */
export function ProblemEditClient({ code }: { readonly code: string }): ReactElement {
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `k-${String(keyCounter.current)}`;
  }, []);

  const query = api.problems.forEdit.useQuery({ code }, { retry: false });
  const [form, setForm] = useState<ProblemFormState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveIssues, setSaveIssues] = useState<readonly FieldIssue[]>([]);
  const loaded = query.data ?? null;
  const { update, saveError, publish, archive, remove, busy } = useProblemMutations(code);

  useEffect(() => {
    if (form !== null || loaded === null) return;
    const next = formFromProblem(loaded, nextKey);
    setForm(next);
    setSavedSnapshot(snapshotOf(next));
  }, [loaded, form, nextKey]);

  const gateIssues = useMemo(() => (form === null ? [] : publishIssues(form)), [form]);
  const currentSnapshot = useMemo(() => (form === null ? null : snapshotOf(form)), [form]);

  if (query.isPending) {
    return (
      <Page className="flex flex-col gap-4 py-10">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }

  if (query.isError || loaded === null || form === null) {
    return (
      <Page className="py-10">
        <ErrorBlock title={t('author.problem.edit.error-title')} retryLabel={t('common.action.retry')} onRetry={() => void query.refetch()} retrying={query.isFetching}>{query.error === null ? t('author.problem.edit.error-fallback') : describeTrpcError(query.error)}</ErrorBlock>
      </Page>
    );
  }

  const status: SaveStatus = saveStatusOf({
    persisted: true,
    dirty: savedSnapshot === null || currentSnapshot !== savedSnapshot,
    saving: update.isPending,
    failed: saveError !== null,
  });
  const specFields = pluginViewFor(form.gameId)?.authorFields ?? [];
  const fieldIssues = mergeIssues(saveIssues, gateIssues);

  const save = (): void => {
    const draft = toProblemDraft(form);
    if (!draft.ok) {
      setSaveIssues(draft.issues);
      return;
    }
    setSaveIssues([]);
    const sent = JSON.stringify(draft.value);
    update.mutate(
      { code, ...draft.value },
      {
        onSuccess: () => {
          setSavedSnapshot(sent);
        },
      },
    );
  };

  return (
    <ProblemEditor
      form={form}
      onChange={setForm}
      nextKey={nextKey}
      code={code}
      state={loaded.state}
      title={form.title === '' ? code : form.title}
      issues={fieldIssues}
      saveStatus={status}
      toolbar={(nav) => (
        <SaveToolbar
          status={status}
          label={t('common.action.save')}
          onSave={save}
          pending={update.isPending}
          disabled={busy}
          serverError={saveError}
          localIssues={saveIssues}
          onJump={nav.jump}
        />
      )}
      readiness={(nav) => <Readiness nav={nav} state={loaded.state} status={status} blockers={gateIssues.length} />}
      publish={(nav) => (
        <ProblemPublishPanel
          code={code}
          state={loaded.state}
          saveStatus={status}
          gateIssues={toStudioIssues(gateIssues, specFields)}
          busy={busy}
          publish={publish}
          archive={archive}
          remove={remove}
          onJump={nav.jump}
        />
      )}
    />
  );
}

/**
 * Khối độ sẵn sàng trong cột kiểm. Câu ở đây KHÁC câu trong chế độ Xuất bản: hai
 * câu giống hệt nhau trên một màn hình là hai kết quả cho cùng một phép tìm chữ,
 * và e2e luồng CI/CD tìm đúng câu của chế độ Xuất bản.
 */
function Readiness(props: {
  readonly nav: EditorNav;
  readonly state: 'draft' | 'published' | 'archived';
  readonly status: SaveStatus;
  readonly blockers: number;
}): ReactElement {
  const live = props.state === 'published';
  const saveFirst = props.status !== 'saved';
  const tone = live ? 'ok' : saveFirst ? 'warn' : props.blockers > 0 ? 'bad' : 'accent';
  return (
    <RailSection title={t('author.studio.rail.readiness')} tone={tone}>
      <p>
        {live
          ? t('author.problem.rail.live')
          : saveFirst
            ? t('author.studio.publish.save-first.title')
            : props.blockers > 0
              ? count('author.problem.publish.blocked-rail', props.blockers)
              : t('author.problem.rail.ready')}
      </p>
      <div>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            props.nav.open(PROBLEM_MODES.publish);
          }}
        >
          {t('author.problem.publish.open')}
        </Button>
      </div>
    </RailSection>
  );
}
