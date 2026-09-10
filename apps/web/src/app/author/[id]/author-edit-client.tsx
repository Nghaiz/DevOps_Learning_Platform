'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ErrorState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@devops-platform/ui';
import { count, renderCopy, t } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DraftFormView } from '../../../components/author/draft-form-view';
import {
  toDraftInput,
  type DraftFormState,
  type FieldIssue,
} from '../../../components/author/draft-form';
import { draftFromBody, draftFromPreview } from '../../../components/author/draft-from-preview';
import { AssetManager } from '../../../components/author/asset-manager';
import { PreviewPanel } from '../../../components/author/preview-panel';
import { PublishPanel } from '../../../components/author/publish-panel';
import {
  PUBLISH_POLL_INTERVAL_MS,
  publishPhase,
} from '../../../components/author/publish-machine';
import { basePublishedIdOf } from '../../../components/author/draft-id';
import { describeSaveOutcome } from '../../../components/author/save-outcome';
import {
  describeItem,
  STATE_BADGE,
  STATE_KEYS,
  type AuthoredItem,
} from '../../../components/author/content-state';

/**
 * `/author/[id]` — sửa một bài.
 *
 * ## Ba query, ba câu hỏi khác nhau — cố ý không gộp
 *
 * - `authoring.get` — **thân bài để SỬA**. Đọc qua `loadBodyForWrite`, KHÔNG
 *   qua schema xuất bản, nên nó mở lại được mọi bản nháp mà `authoring.create`
 *   cho lưu: bài học 0 bước, lab chưa có script chấm, chưa chọn độ khó. Đây là
 *   đường nạp DUY NHẤT của form.
 * - `authoring.preview` — **thứ NGƯỜI HỌC sẽ thấy**. Đi qua nguồn nội dung hợp
 *   nhất, và trả `null` cho bản nháp chưa qua schema xuất bản. Đó là câu trả
 *   lời ĐÚNG cho câu hỏi của nó, nên tab Xem trước và tab Xuất bản vẫn hỏi nó.
 * - `authoring.list` — **trạng thái + siêu dữ liệu** (`state`, `stepCount`,
 *   `publishError`, `publishedAt`), và là query DUY NHẤT được `refetchInterval`
 *   trong lúc chạy thử.
 *
 * ## Vì sao trạng thái vẫn đọc từ `list` dù `get` cũng trả `state`
 *
 * Hai chỗ đó KHÔNG tự tính lại luật "publishing đã treo kể là draft" — cả hai
 * gọi cùng `reportedState` ở server (06510f6), nên chúng không thể lệch nhau.
 * Chính vì thế trang này không cần lấy `state` từ cả hai: `list` là query đang
 * poll trong lúc xuất bản, nên nó luôn mới hơn, và đọc thêm `get.state` chỉ
 * dựng thêm một nguồn thứ hai cho cùng một sự thật trên cùng một màn hình.
 *
 * ⛔ Tuyệt đối không tự suy lại luật treo đó ở client: nó là hàm của
 * `publishStartedAt` và đồng hồ, và một bản chép ở đây sẽ nói "đang xuất bản"
 * trong khi danh sách nói "nháp" — rồi khoá tác giả ra khỏi chính bài của họ.
 *
 * ⛔ Không dựng `<main>` (C6bis). ⛔ Không `useInfiniteQuery`.
 */
export function AuthorEditClient({ contentId }: { readonly contentId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();

  // `started` phải sống qua các lượt render: nó phân biệt "nháp sạch vì chưa
  // ai bấm gì" với "nháp sạch vì lượt chạy thử biến mất không kết quả".
  const [publishStarted, setPublishStarted] = useState(false);

  /**
   * Hỏi lại `list` CHỈ khi bài đang chạy thử — quyết định từ CHÍNH dữ liệu vừa
   * về, không từ một `useState` chạy song song.
   *
   * ## Vì sao không còn `pollingOn` + `useEffect`
   *
   * Bản trước giữ `const [pollingOn, setPollingOn]`, bật ở `onSuccess` của
   * mutation và tắt trong một effect `if (pollingOn && !shouldKeepPolling(phase))`.
   * Effect đó chỉ biết TẮT, không biết BẬT lại — và có đúng một khoảnh khắc nó
   * tắt nhầm:
   *
   *   1. mutation `publish` trả về ⇒ `isPending` false, `publishStarted` true;
   *   2. render kế tiếp vẫn đọc CACHE CŨ, ở đó `row.state === 'draft'`;
   *   3. `publishPhase` với `draft` + `started` ⇒ `{ kind: 'lost' }`;
   *   4. `shouldKeepPolling('lost')` false ⇒ effect tắt polling;
   *   5. lượt refetch của `invalidate` về sau đó với `publishing` ⇒ phase
   *      `running` — nhưng không ai bật lại.
   *
   * Đo trên cụm 2026-09-07 bằng trình duyệt thật: sau lượt `invalidate` là
   * **không còn một request `authoring.list` nào** trong hơn 60 giây, trong khi
   * DB đã `published` từ giây thứ ~4. Người soạn ngồi nhìn "Đang chạy thử trong
   * sandbox" vĩnh viễn cho tới khi tự tải lại trang; luồng 5 của e2e đỏ sau 10
   * phút chờ đúng vì vậy.
   *
   * Dạng hàm phá được vòng phụ thuộc (options cần `phase`, `phase` cần dữ liệu)
   * và không thể kẹt ở trạng thái sai: mỗi lượt fetch tự hỏi lại "còn
   * `publishing` không?". Nó cũng làm đúng điều `publish-machine.ts` đã hứa ở
   * `case 'publishing'` — thấy được lượt chạy thử do TAB KHÁC hoặc admin bấm,
   * chuyện bản cũ không làm nổi vì tab này chưa từng bấm nút nên chưa bao giờ
   * bật `pollingOn`.
   */
  const listQuery = api.authoring.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const row = query.state.data?.find((r) => r.id === contentId) ?? null;
      return row?.state === 'publishing' ? PUBLISH_POLL_INTERVAL_MS : false;
    },
  });
  const previewQuery = api.authoring.preview.useQuery({ id: contentId }, { retry: false });
  const bodyQuery = api.authoring.get.useQuery({ id: contentId }, { retry: false });

  const [form, setForm] = useState<DraftFormState | null>(null);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tab, setTab] = useState('soan');

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `new-${String(keyCounter.current)}`;
  }, []);

  const item: AuthoredItem | null = listQuery.data?.find((row) => row.id === contentId) ?? null;
  const previewData = previewQuery.data ?? null;
  const bodyData = bodyQuery.data ?? null;

  // Bài GỐC khi id đang mở là một bản nháp kế nhiệm. Cần nó để đọc được lượt
  // xuất bản ĐẠT: đường đổi ngôi XOÁ bản nháp, nên hàng ta theo dõi biến mất và
  // bằng chứng duy nhất còn lại nằm ở hàng bài gốc.
  const baseId = basePublishedIdOf(contentId);
  const baseRow: AuthoredItem | null =
    baseId === null ? null : (listQuery.data?.find((row) => row.id === baseId) ?? null);

  /**
   * Nạp MỘT lần cho mỗi id.
   *
   * `form !== null` là cổng chặn: `get` được `invalidate` sau mỗi lượt lưu, và
   * nếu effect này chạy lại thì nó ghi đè những gì người soạn đang gõ bằng bản
   * vừa lưu — mọi thay đổi sau lượt lưu biến mất khi query trả về.
   *
   * Không còn nhánh "nạp không được": `get` trả thân của MỌI bài tồn tại, và
   * câu hỏi "bài này có tồn tại không" đã được trả lời trước đó bằng
   * `NOT_FOUND`. Field còn thiếu là ô trống điền được, không phải lý do đóng
   * form.
   */
  useEffect(() => {
    if (form !== null || bodyData === null) {
      return;
    }
    setForm(draftFromBody(bodyData.body));
  }, [bodyData, form]);

  const update = api.authoring.update.useMutation({
    onSuccess: (result) => {
      void utils.authoring.list.invalidate();
      void utils.authoring.preview.invalidate();
      // `get` cũng phải hết hạn: một lượt lưu ĐẠT làm thân trong cache khác thân
      // trong DB, và bản cũ đó là thứ form nạp lại nếu người soạn mở lại trang.
      void utils.authoring.get.invalidate();
      const outcome = describeSaveOutcome(result, contentId);
      toast({
        title: renderCopy(outcome.title),
        ...(outcome.detail === null ? {} : { description: renderCopy(outcome.detail) }),
        variant: outcome.tone === 'warning' ? 'default' : 'success',
      });
      if (outcome.navigate) {
        router.push(`/author/${encodeURIComponent(outcome.editId)}`);
      }
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });

  const checkQuery = api.authoring.check.useQuery({ id: contentId }, { enabled: false, retry: false });

  const publish = api.authoring.publish.useMutation({
    onSuccess: () => {
      setPublishStarted(true);
      // `invalidate` là lượt hỏi lại ĐẦU TIÊN. Nhịp sau đó do `refetchInterval`
      // lo, và nó tự bật vì `phase` sẽ là `running` (server đã lật `publishing`
      // TRƯỚC khi trả về mutation này — xem `authoring.ts`).
      void utils.authoring.list.invalidate();
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });

  const archive = api.authoring.archive.useMutation({
    onSuccess: () => {
      void utils.authoring.list.invalidate();
      toast({ title: t('author.edit.archived.title'), description: t('author.edit.archived.body') });
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });

  const phase = publishPhase({
    started: publishStarted,
    submitting: publish.isPending,
    row: item,
    baseRow,
  });


  const onSave = (): void => {
    if (form === null || item === null) {
      return;
    }
    setServerError(null);
    const payload = toDraftInput(item.kind, form);
    if (!payload.ok) {
      setIssues(payload.issues);
      return;
    }
    setIssues([]);
    update.mutate({ ...payload.value, id: contentId } as Parameters<typeof update.mutate>[0]);
  };

  if (listQuery.isPending) {
    return <Loading />;
  }
  if (listQuery.isError) {
    return (
      <Shell>
        <ErrorState
          title={t('author.edit.load-error.title')}
          message={describeTrpcError(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      </Shell>
    );
  }
  if (item === null) {
    return (
      <Shell>
        <ErrorState
          title={t('author.edit.not-found.title')}
          message={renderCopy({ key: 'author.edit.not-found.body', params: { id: contentId } })}
        />
        <Button variant="outline" asChild>
          <Link href="/author">{t('author.nav.back-to-list')}</Link>
        </Button>
      </Shell>
    );
  }

  // Chỉ còn tab Xem trước dùng cờ này. `draftFromPreview(...) === null` LÀ định
  // nghĩa của "nguồn nội dung từ chối bản nháp" (xem docstring của hàm đó), nên
  // dùng lại nó thay vì chép một `switch` thứ hai trên `PreviewPayload` ở đây.
  const previewRejected =
    previewQuery.isSuccess && previewData !== null && draftFromPreview(previewData) === null;

  return (
    <Shell>
      <header className="flex flex-col gap-2">
        <Link href="/author" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {'← '}
          {t('author.nav.back-to-list')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{item.title}</h1>
          <Badge variant={STATE_BADGE[item.state]}>{t(STATE_KEYS[item.state])}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {renderCopy(describeItem(item))} · <code className="font-mono">{item.id}</code>
        </p>
      </header>

      {item.state === 'published' && (
        <Alert variant="warning">
          <AlertTitle>{t('author.edit.live-warning.title')}</AlertTitle>
          <AlertDescription>
            {renderCopy({ key: 'author.edit.live-warning.body', params: { draftId: `${item.id}__draft` } })}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="soan">{t('author.edit.tab.compose')}</TabsTrigger>
          <TabsTrigger value="xem-truoc">{t('author.edit.tab.preview')}</TabsTrigger>
          <TabsTrigger value="tep">{t('author.edit.tab.assets')}</TabsTrigger>
          <TabsTrigger value="xuat-ban">{t('author.edit.tab.publish')}</TabsTrigger>
        </TabsList>

        <TabsContent value="soan" className="flex flex-col gap-6 pt-4">
          {bodyQuery.isPending && <Loading />}

          {bodyQuery.isError && (
            <ErrorState
              title={t('author.edit.body-error.title')}
              message={describeTrpcError(bodyQuery.error)}
              onRetry={() => void bodyQuery.refetch()}
              retrying={bodyQuery.isFetching}
            />
          )}

          {form !== null && (
            <>
              <DraftFormView
                kind={item.kind}
                value={form}
                onChange={setForm}
                issues={issues}
                disabled={update.isPending}
                nextKey={nextKey}
              />

              {issues.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>{count('author.issues.title', issues.length)}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">
                      {issues.map((issue) => (
                        <li key={issue.path}>
                          <code className="font-mono">{issue.path}</code>
                          {renderCopy({ key: 'author.issues.row', params: { message: issue.message } })}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {serverError !== null && (
                <Alert variant="destructive">
                  <AlertTitle>{t('author.edit.save-error.title')}</AlertTitle>
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button onClick={onSave} loading={update.isPending}>
                  {t('common.action.save')}
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="xem-truoc" className="flex flex-col gap-4 pt-4">
          {previewQuery.isPending && <Loading />}
          {previewQuery.isError && (
            <ErrorState
              title={t('author.edit.preview.error.title')}
              message={describeTrpcError(previewQuery.error)}
              onRetry={() => void previewQuery.refetch()}
              retrying={previewQuery.isFetching}
            />
          )}
          {previewData !== null && <PreviewPanel contentId={contentId} payload={previewData} />}
          {previewRejected && (
            <Alert variant="warning">
              <AlertTitle>{t('author.edit.preview.rejected.title')}</AlertTitle>
              <AlertDescription>{t('author.edit.preview.rejected.body')}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">{t('author.edit.preview.note')}</p>
        </TabsContent>

        <TabsContent value="tep" className="pt-4">
          <AssetManager contentId={contentId} />
        </TabsContent>

        <TabsContent value="xuat-ban" className="pt-4">
          <PublishPanel
            phase={phase}
            preview={previewData}
            publishError={item.publishError}
            checkResult={checkQuery.data ?? null}
            checking={checkQuery.isFetching}
            onCheck={() => void checkQuery.refetch()}
            onPublish={() => {
              setServerError(null);
              publish.mutate({ id: contentId });
            }}
            onArchive={() => {
              setServerError(null);
              archive.mutate({ id: contentId });
            }}
            archiving={archive.isPending}
            canArchive={item.state !== 'archived'}
          />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function Shell({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">{children}</div>;
}

function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
