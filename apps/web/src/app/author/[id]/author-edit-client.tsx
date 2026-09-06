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
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DraftFormView } from '../../../components/author/draft-form-view';
import {
  emptyDraft,
  toDraftInput,
  type DraftFormState,
  type FieldIssue,
} from '../../../components/author/draft-form';
import { draftFromPreview } from '../../../components/author/draft-from-preview';
import { PreviewPanel } from '../../../components/author/preview-panel';
import { describeSaveOutcome } from '../../../components/author/save-outcome';
import {
  describeItem,
  STATE_BADGE,
  STATE_LABELS,
  type AuthoredItem,
} from '../../../components/author/content-state';

/**
 * `/author/[id]` — sửa một bài.
 *
 * ## Vì sao trang này đọc `list` chứ không đọc một `get`
 *
 * Router soạn bài KHÔNG có procedure trả về một bài theo id. Có `list` (tóm tắt
 * mọi bài của tôi) và `preview` (DTO đầy đủ, đi qua nguồn nội dung). Nên trạng
 * thái + loại của bài này được LỌC RA từ `list`, và thân bài nạp từ `preview`.
 *
 * ## Giới hạn phải nói ra: bản nháp chưa hợp lệ không nạp lại được
 *
 * `preview` đi qua `dbContentSource`, và nguồn đó `safeParse` bằng chính schema
 * xuất bản rồi trả `null` khi trượt. Một bản nháp viết dở (bài học 0 bước, lab
 * thiếu script chấm) vì thế không nạp được vào form.
 *
 * Cách xử lý ở đây là **không** hiện một form trống rồi để người soạn bấm Lưu:
 * `update` thay TOÀN BỘ nội dung, nên một lượt lưu như vậy xoá sạch bản nháp
 * đang có, im lặng và không hoàn tác được. Thay vào đó trang nói rõ chuyện gì
 * xảy ra, chỉ sang tab Xuất bản (nơi `check` chạy được trên MỌI bản nháp và nêu
 * đúng field thiếu), và chỉ mở form sau khi người soạn bấm một nút xác nhận
 * rằng họ muốn soạn lại từ đầu.
 *
 * ⛔ Không dựng `<main>` (C6bis). ⛔ Không `useInfiniteQuery`.
 */
export function AuthorEditClient({ contentId }: { readonly contentId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();

  const listQuery = api.authoring.list.useQuery();
  const previewQuery = api.authoring.preview.useQuery({ id: contentId }, { retry: false });

  const [form, setForm] = useState<DraftFormState | null>(null);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rebuildFromScratch, setRebuildFromScratch] = useState(false);
  const [tab, setTab] = useState('soan');

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `new-${String(keyCounter.current)}`;
  }, []);

  const item: AuthoredItem | null = listQuery.data?.find((row) => row.id === contentId) ?? null;
  const previewData = previewQuery.data ?? null;

  /**
   * Nạp MỘT lần cho mỗi id.
   *
   * `form !== null` là cổng chặn: `preview` được `invalidate` sau mỗi lượt lưu,
   * và nếu effect này chạy lại thì nó ghi đè những gì người soạn đang gõ bằng
   * bản vừa lưu — mọi thay đổi sau lượt lưu biến mất khi query trả về.
   */
  useEffect(() => {
    if (form !== null || previewData === null) {
      return;
    }
    const loaded = draftFromPreview(previewData);
    if (loaded !== null) {
      setForm(loaded);
    }
  }, [previewData, form]);

  const update = api.authoring.update.useMutation({
    onSuccess: (result) => {
      void utils.authoring.list.invalidate();
      void utils.authoring.preview.invalidate();
      const outcome = describeSaveOutcome(result, contentId);
      toast({
        title: outcome.title,
        ...(outcome.detail === null ? {} : { description: outcome.detail }),
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
          title="Không tải được bài"
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
          title="Không có bài đó"
          message={`Không tìm thấy "${contentId}" trong danh sách bài của bạn. Có thể id sai, hoặc bài thuộc về tác giả khác.`}
        />
        <Button variant="outline" asChild>
          <Link href="/author">Về danh sách bài</Link>
        </Button>
      </Shell>
    );
  }

  const previewRejected =
    previewQuery.isSuccess && previewData !== null && draftFromPreview(previewData) === null;
  const editable = form !== null;

  return (
    <Shell>
      <header className="flex flex-col gap-2">
        <Link href="/author" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Về danh sách bài
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{item.title}</h1>
          <Badge variant={STATE_BADGE[item.state]}>{STATE_LABELS[item.state]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {describeItem(item)} · <code className="font-mono">{item.id}</code>
        </p>
      </header>

      {item.state === 'published' && (
        <Alert variant="warning">
          <AlertTitle>Bài này đang chạy cho người học</AlertTitle>
          <AlertDescription>
            Lưu sẽ KHÔNG sửa bản đang chạy. Máy chủ tạo một bản nháp kế nhiệm{' '}
            <code className="font-mono">{item.id}__draft</code>; nội dung của nó chỉ thay thế bản đang chạy khi
            bạn xuất bản bản nháp đó.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="soan">Soạn</TabsTrigger>
          <TabsTrigger value="xem-truoc">Xem trước</TabsTrigger>
        </TabsList>

        <TabsContent value="soan" className="flex flex-col gap-6 pt-4">
          {previewQuery.isPending && <Loading />}

          {previewQuery.isError && (
            <ErrorState
              title="Không nạp được nội dung bài"
              message={describeTrpcError(previewQuery.error)}
              onRetry={() => void previewQuery.refetch()}
              retrying={previewQuery.isFetching}
            />
          )}

          {previewRejected && !editable && (
            <Alert variant="warning">
              <AlertTitle>Không nạp lại được bản nháp này vào form</AlertTitle>
              <AlertDescription>
                <p>
                  Nguồn nội dung chỉ trả về bài đã qua schema xuất bản, còn bản nháp này thì chưa. Đây là giới
                  hạn của API hiện tại, không phải mất dữ liệu — nội dung của bạn vẫn nằm nguyên trong cơ sở dữ
                  liệu.
                </p>
                <p className="mt-2">
                  Chạy <strong>Kiểm tra</strong> ở tab Xuất bản để biết chính xác field nào còn thiếu. Nếu muốn
                  soạn lại từ đầu, bấm nút dưới đây — lưu ý là lượt lưu kế tiếp sẽ THAY TOÀN BỘ nội dung hiện có.
                </p>
                <Button
                  variant="destructive"
                  className="mt-3"
                  onClick={() => {
                    setRebuildFromScratch(true);
                    setForm(emptyDraft());
                  }}
                >
                  Soạn lại từ đầu (ghi đè bản nháp)
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {rebuildFromScratch && (
            <Alert variant="destructive">
              <AlertDescription>
                Bạn đang soạn lại từ đầu. Bấm Lưu sẽ thay thế toàn bộ nội dung của{' '}
                <code className="font-mono">{item.id}</code>.
              </AlertDescription>
            </Alert>
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
                  <AlertTitle>Còn {issues.length} ô cần sửa</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">
                      {issues.map((issue) => (
                        <li key={issue.path}>
                          <code className="font-mono">{issue.path}</code> — {issue.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {serverError !== null && (
                <Alert variant="destructive">
                  <AlertTitle>Không lưu được</AlertTitle>
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button onClick={onSave} loading={update.isPending}>
                  Lưu
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="xem-truoc" className="flex flex-col gap-4 pt-4">
          {previewQuery.isPending && <Loading />}
          {previewQuery.isError && (
            <ErrorState
              title="Không xem trước được"
              message={describeTrpcError(previewQuery.error)}
              onRetry={() => void previewQuery.refetch()}
              retrying={previewQuery.isFetching}
            />
          )}
          {previewData !== null && <PreviewPanel contentId={contentId} payload={previewData} />}
          {previewRejected && (
            <Alert variant="warning">
              <AlertTitle>Bản nháp chưa qua schema xuất bản</AlertTitle>
              <AlertDescription>
                Nguồn nội dung từ chối bản nháp này nên không có gì để dựng. Chạy Kiểm tra ở tab Xuất bản để
                biết field nào còn thiếu.
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Xem trước dựng từ bản ĐÃ LƯU, không từ ô nhập đang gõ. Lưu trước rồi mở lại tab này để thấy thay
            đổi.
          </p>
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
