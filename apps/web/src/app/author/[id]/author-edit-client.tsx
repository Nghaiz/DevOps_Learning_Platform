'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { renderCopy, t } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DraftFormView } from '../../../components/author/draft-form-view';
import { toDraftInput, type DraftFormState, type FieldIssue } from '../../../components/author/draft-form';
import { draftFromBody, draftFromPreview } from '../../../components/author/draft-from-preview';
import { AssetManager } from '../../../components/author/asset-manager';
import { PreviewPanel } from '../../../components/author/preview-panel';
import { PublishPanel } from '../../../components/author/publish-panel';
import { PUBLISH_POLL_INTERVAL_MS, publishPhase } from '../../../components/author/publish-machine';
import { basePublishedIdOf } from '../../../components/author/draft-id';
import { describeSaveOutcome } from '../../../components/author/save-outcome';
import { STATE_KEYS, type AuthoredItem } from '../../../components/author/content-state';
import { inlineServerIssues, toLessonIssues } from '../../../components/author/lesson-issues';
import {
  SaveState,
  StateChip,
  StudioEditorFrame,
  StudioPanel,
  focusFieldByPath,
  mustSaveBeforePublish,
  saveStatusOf,
} from '../../../components/author/studio';
import { LessonRail } from './lesson-rail';
import { BackLink, Button, ErrorBlock, Notice, Page, PageHeader, Skeleton, toast } from '@devops-platform/ds';

/** Payload so sánh được của một biểu mẫu; `null` khi biểu mẫu chưa thành payload hợp lệ. */
function snapshotOf(kind: AuthoredItem['kind'], form: DraftFormState): string | null {
  const payload = toDraftInput(kind, form);
  return payload.ok ? JSON.stringify(payload.value) : null;
}

/**
 * `/author/[id]`: sửa một bài.
 *
 * ## Bốn query, bốn câu hỏi, cố ý không gộp
 *
 * - `authoring.get`: thân bài để SỬA (qua `loadBodyForWrite`, mở lại được mọi bản
 *   nháp `create` cho lưu). Đường nạp DUY NHẤT của biểu mẫu.
 * - `authoring.preview`: thứ NGƯỜI HỌC sẽ thấy; `null` với bản nháp chưa qua
 *   schema xuất bản.
 * - `authoring.list`: trạng thái + siêu dữ liệu, và là query DUY NHẤT poll trong
 *   lúc chạy thử. `refetchInterval` dạng hàm tự hỏi "còn `publishing` không?" ở
 *   mỗi lượt, nên không kẹt (bản cũ dùng `pollingOn` + effect và tắt nhầm, đo
 *   2026-09-07). Không bao giờ tự suy lại luật "publishing treo" ở client.
 * - `authoring.check`: kiểm bản ĐÃ LƯU theo schema xuất bản, không tốn sandbox.
 *
 * ## "Chưa lưu" so bằng payload
 *
 * `savedSnapshot` là payload máy chủ đã NHẬN (lúc nạp, và trong `onSuccess` của
 * lượt lưu), không phải lúc bấm. Kiểm tra và Xuất bản đọc bản máy chủ, nên chúng
 * khoá khi màn hình lệch bản đó.
 *
 * ⛔ Không dựng `<main>`. ⛔ Không `useInfiniteQuery`.
 */
export function AuthorEditClient({ contentId }: { readonly contentId: string }): ReactElement {
  const router = useRouter();
  const utils = api.useUtils();

  const [publishStarted, setPublishStarted] = useState(false);
  const listQuery = api.authoring.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const row = query.state.data?.find((r) => r.id === contentId) ?? null;
      return row?.state === 'publishing' ? PUBLISH_POLL_INTERVAL_MS : false;
    },
  });
  const previewQuery = api.authoring.preview.useQuery({ id: contentId }, { retry: false });
  const bodyQuery = api.authoring.get.useQuery({ id: contentId }, { retry: false });
  const checkQuery = api.authoring.check.useQuery({ id: contentId }, { enabled: false, retry: false });

  const [form, setForm] = useState<DraftFormState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mode, setMode] = useState('soan');

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `new-${String(keyCounter.current)}`;
  }, []);

  const item: AuthoredItem | null = listQuery.data?.find((row) => row.id === contentId) ?? null;
  const previewData = previewQuery.data ?? null;
  const bodyData = bodyQuery.data ?? null;
  // Bài GỐC khi id đang mở là bản nháp kế nhiệm: đường đổi ngôi XOÁ bản nháp,
  // nên bằng chứng của lượt xuất bản ĐẠT chỉ còn ở hàng bài gốc.
  const baseId = basePublishedIdOf(contentId);
  const baseRow = baseId === null ? null : (listQuery.data?.find((row) => row.id === baseId) ?? null);
  const kind = item?.kind ?? null;

  // Nạp MỘT lần cho mỗi id: `get` hết hạn sau mỗi lượt lưu, và nạp lại sẽ ghi đè
  // những gì người soạn đang gõ.
  useEffect(() => {
    if (form !== null || bodyData === null || kind === null) return;
    const loaded = draftFromBody(bodyData.body);
    setForm(loaded);
    setSavedSnapshot(snapshotOf(kind, loaded));
  }, [bodyData, form, kind]);

  const update = api.authoring.update.useMutation({
    onSuccess: (result, variables) => {
      const { id: _id, ...sent } = variables as Record<string, unknown>;
      setSavedSnapshot(JSON.stringify(sent));
      setSavedAt(Date.now());
      setSaveError(null);
      void utils.authoring.list.invalidate();
      void utils.authoring.preview.invalidate();
      void utils.authoring.get.invalidate();
      const outcome = describeSaveOutcome(result, contentId);
      const options = outcome.detail === null ? undefined : { description: renderCopy(outcome.detail) };
      if (outcome.tone === 'warning') toast.warning(renderCopy(outcome.title), options);
      else toast.success(renderCopy(outcome.title), options);
      if (outcome.navigate) router.push(`/author/${encodeURIComponent(outcome.editId)}`);
    },
    onError: (error) => {
      setSaveError(describeTrpcError(error));
    },
  });

  const publish = api.authoring.publish.useMutation({
    onSuccess: () => {
      setPublishStarted(true);
      setPublishError(null);
      void utils.authoring.list.invalidate();
    },
    onError: (error) => {
      setPublishError(describeTrpcError(error));
    },
  });

  const archive = api.authoring.archive.useMutation({
    onSuccess: () => {
      setArchiveOpen(false);
      setArchiveError(null);
      void utils.authoring.list.invalidate();
      toast.success(t('author.edit.archived.title'), { description: t('author.edit.archived.body') });
    },
    onError: (error) => {
      setArchiveError(describeTrpcError(error));
    },
  });

  const dirty = form !== null && kind !== null && (savedSnapshot === null || snapshotOf(kind, form) !== savedSnapshot);
  const saveStatus = saveStatusOf({ persisted: true, dirty, saving: update.isPending, failed: saveError !== null });

  // Rời trang khi còn thay đổi chưa lưu: trình duyệt hỏi lại một lần.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  // Kết quả kiểm tra CŨ hơn lượt lưu gần nhất là kết quả về một bản đã không còn.
  const checkFresh = checkQuery.data !== undefined && checkQuery.dataUpdatedAt >= savedAt;
  const checkResult = checkFresh ? (checkQuery.data ?? null) : null;
  const allIssues = useMemo(
    () => (kind === null ? issues : [...issues, ...inlineServerIssues(kind, checkResult?.issues ?? [])]),
    [issues, kind, checkResult],
  );

  const phase = publishPhase({ started: publishStarted, submitting: publish.isPending, row: item, baseRow });

  const jump = (path: string): void => {
    setMode('soan');
    focusFieldByPath(path);
  };

  const onSave = (): void => {
    if (form === null || item === null) return;
    const payload = toDraftInput(item.kind, form);
    if (!payload.ok) {
      setIssues(payload.issues);
      return;
    }
    setIssues([]);
    update.mutate({ ...payload.value, id: contentId } as Parameters<typeof update.mutate>[0]);
  };

  if (listQuery.isPending) return <EditorSkeleton />;
  if (listQuery.isError || item === null) {
    return (
      <Page className="pb-16">
        <PageHeader
          back={
            <BackLink asChild>
              <Link href="/author">{t('shell.nav.author')}</Link>
            </BackLink>
          }
          title={listQuery.isError ? t('author.edit.load-error.title') : t('author.edit.not-found.title')}
        />
        <div className="flex flex-col items-start gap-4">
          <ErrorBlock
            className="w-full"
            title={listQuery.isError ? t('author.edit.load-error.title') : t('author.edit.not-found.title')}
            {...(listQuery.isError
              ? { onRetry: () => void listQuery.refetch(), retrying: listQuery.isFetching, retryLabel: t('common.action.retry') }
              : {})}
          >
            {listQuery.isError
              ? describeTrpcError(listQuery.error)
              : renderCopy({ key: 'author.edit.not-found.body', params: { id: contentId } })}
          </ErrorBlock>
          <Button variant="secondary" icon="arrow-left" asChild>
            <Link href="/author">{t('author.nav.back-to-list')}</Link>
          </Button>
        </div>
      </Page>
    );
  }

  const previewRejected = previewQuery.isSuccess && previewData !== null && draftFromPreview(previewData) === null;
  const railIssues = toLessonIssues(item.kind, allIssues);

  return (
    <StudioEditorFrame
      crumbs={[{ href: '/author', label: t('shell.nav.author') }, { label: item.id }]}
      title={item.title}
      status={<StateChip state={item.state} label={t(STATE_KEYS[item.state])} />}
      toolbar={
        <>
          <SaveState status={saveStatus} />
          <Button variant="primary" icon="save" onClick={onSave} loading={update.isPending} disabled={form === null}>
            {t('common.action.save')}
          </Button>
        </>
      }
      notice={
        <>
          {item.state === 'published' && (
            <Notice tone="warn" title={t('author.edit.live-warning.title')}>
                {renderCopy({ key: 'author.edit.live-warning.body', params: { draftId: `${item.id}__draft` } })}
              </Notice>
          )}
          {saveError !== null && (
            <Notice tone="bad" title={t('author.studio.action-error.save')}>{saveError}</Notice>
          )}
        </>
      }
      modes={[
        { value: 'soan', label: t('author.edit.tab.compose') },
        { value: 'xem-truoc', label: t('author.edit.tab.preview') },
        { value: 'tep', label: t('author.edit.tab.assets') },
        { value: 'xuat-ban', label: t('author.edit.tab.publish') },
      ]}
      mode={mode}
      onModeChange={setMode}
      rail={
        <LessonRail
          issues={railIssues}
          onJump={jump}
          state={item.state}
          stateLabel={t(STATE_KEYS[item.state])}
          saveStatus={saveStatus}
          checked={checkResult === null ? 'never' : checkResult.issues.length === 0 ? 'clean' : 'blocked'}
          phase={phase}
          onOpenPublish={() => {
            setMode('xuat-ban');
          }}
        />
      }
    >
      <StudioPanel value="soan">
        {bodyQuery.isPending && <Skeleton className="h-96 w-full" />}
        {bodyQuery.isError && (
          <ErrorBlock title={t('author.edit.body-error.title')} retryLabel={t('common.action.retry')} onRetry={() => void bodyQuery.refetch()} retrying={bodyQuery.isFetching}>{describeTrpcError(bodyQuery.error)}</ErrorBlock>
        )}
        {form !== null && (
          <DraftFormView
            kind={item.kind}
            value={form}
            onChange={setForm}
            issues={allIssues}
            disabled={update.isPending}
            nextKey={nextKey}
          />
        )}
      </StudioPanel>

      <StudioPanel value="xem-truoc">
        <p className="text-sm text-ink-2">{t('author.edit.preview.note')}</p>
        {previewQuery.isPending && <Skeleton className="h-96 w-full" />}
        {previewQuery.isError && (
          <ErrorBlock title={t('author.edit.preview.error.title')} retryLabel={t('common.action.retry')} onRetry={() => void previewQuery.refetch()} retrying={previewQuery.isFetching}>{describeTrpcError(previewQuery.error)}</ErrorBlock>
        )}
        {previewRejected && (
          <Notice tone="warn" title={t('author.edit.preview.rejected.title')}>{t('author.edit.preview.rejected.body')}</Notice>
        )}
        {previewData !== null && <PreviewPanel contentId={contentId} payload={previewData} />}
      </StudioPanel>

      <StudioPanel value="tep">
        <AssetManager contentId={contentId} />
      </StudioPanel>

      <StudioPanel value="xuat-ban">
        <PublishPanel
          kind={item.kind}
          phase={phase}
          preview={previewData}
          publishError={item.publishError}
          checkResult={checkResult}
          checking={checkQuery.isFetching}
          onCheck={() => void checkQuery.refetch()}
          onJump={jump}
          saveFirst={mustSaveBeforePublish(saveStatus)}
          onPublish={() => {
            setPublishError(null);
            publish.mutate({ id: contentId });
          }}
          actionError={publishError}
          canArchive={item.state !== 'archived'}
          archiving={archive.isPending}
          archiveOpen={archiveOpen}
          onArchiveOpenChange={(open) => {
            setArchiveOpen(open);
            if (!open) setArchiveError(null);
          }}
          onArchive={() => {
            setArchiveError(null);
            archive.mutate({ id: contentId });
          }}
          archiveError={archiveError}
        />
      </StudioPanel>
    </StudioEditorFrame>
  );
}

function EditorSkeleton(): ReactElement {
  return (
    <Page>
      <div className="flex flex-col gap-4 py-10" aria-hidden>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </Page>
  );
}
