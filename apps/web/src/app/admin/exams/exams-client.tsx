'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import {
  Button,
  CursorPager,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from '@devops-platform/ui';

import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { AdminNote, AdminSection } from '../../../components/admin/admin-section';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { formatDay } from '../../../lib/format-moment';

type ExamSummary = inferRouterOutputs<AppRouter>['exams']['list']['items'][number];

/**
 * `/admin/exams` (§18.G.2) , danh sách kỳ thi và ô ra đề.
 *
 * ## ⛔ `useQuery` + cursor thủ công, KHÔNG `useInfiniteQuery`
 *
 * Cùng bẫy đã ghi ở `admin/classes` và `admin/users`: `useInfiniteQuery` của
 * `@trpc/react-query` nhét `direction` vào INPUT gửi lên, mà `listInputSchema`
 * là `.strict()`, nên request thật của trình duyệt trả 400 `unrecognized_keys`
 * trong khi mọi test mức API vẫn xanh. Ngăn xếp cursor dùng lại
 * `lib/cursor-stack.ts` (hàm thuần, đã có test).
 *
 * ## Mã bài nhập bằng TEXTAREA, mỗi dòng một mã
 *
 * Một ô chọn nhiều từ danh mục sẽ đẹp hơn, và nó cần một truy vấn tìm bài, một
 * hộp gợi ý, và một trạng thái "đã chọn" phải giữ đúng THỨ TỰ , tức ba thứ nữa
 * để hỏng. Cổng soạn đề ở máy chủ đã từ chối mã không tồn tại, mã chưa xuất
 * bản, và mã trùng, kèm câu gọi đúng tên mã sai. Một ô văn bản cộng một cổng
 * nói được là đủ dùng cho vài chục bài, và nó giữ thứ tự bằng chính thứ tự dòng.
 */
export function AdminExamsClient(): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);

  // `exactOptionalPropertyTypes: true` + Zod `.strict()`: "trang đầu" phải là
  // VẮNG MẶT key, không phải `cursor: undefined`.
  const query = api.exams.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminSection title={t('admin.exams.title')} description={t('admin.exams.description')}>
      <details className="practice-exam-create">
        <summary>{t('admin.exams.create-disclosure')}</summary>
        <CreateExamForm onCreated={() => setStack(FIRST_PAGE)} />
      </details>
      <ExamsBody
        page={pageNumber(stack)}
        items={query.data?.items ?? null}
        pending={query.isPending}
        error={query.isError ? describeTrpcError(query.error) : null}
        fetching={query.isFetching}
        hasNext={query.data?.nextCursor != null}
        onRetry={() => void query.refetch()}
        onNext={() => setStack((prev) => pushCursor(prev, query.data?.nextCursor ?? null))}
        onFirst={() => setStack(FIRST_PAGE)}
      />
    </AdminSection>
  );
}

function CreateExamForm({ onCreated }: { readonly onCreated: () => void }): ReactElement {
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [codes, setCodes] = useState('');
  const [duration, setDuration] = useState('60');
  const [strategy, setStrategy] = useState<'fixed' | 'per-student'>('fixed');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const classes = api.classes.list.useQuery({});

  const create = api.exams.create.useMutation({
    onSuccess: (created) => {
      toast({ variant: 'success', title: t('admin.exams.created-toast', { title: created.title }) });
      // Đọc lại từ máy chủ thay vì chèn vào cache: danh sách sắp theo thời gian
      // tạo giảm dần, và tự chèn là tự khẳng định một vị trí mà chỉ máy chủ
      // biết chắc.
      void utils.exams.list.invalidate();
      void utils.admin.audit.list.invalidate();
      setTitle('');
      setCodes('');
      onCreated();
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setServerError(null);
      /*
       * Tách dòng rồi bỏ dòng trống: người ta dán từ một file và gần như luôn
       * có một dòng trống ở cuối. Gửi nó lên sẽ thành một mã rỗng, và cổng máy
       * chủ sẽ báo "không có bài nào mang mã " , một câu đúng nhưng vô nghĩa.
       */
      const problemCodes = codes
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      create.mutate({
        classId,
        title: title.trim(),
        problemCodes,
        durationMinutes: Number(duration),
        seedStrategy: strategy,
        opensAt: toIsoOrNull(opensAt),
        closesAt: toIsoOrNull(closesAt),
      });
    },
    [classId, closesAt, codes, create, duration, opensAt, strategy, title],
  );

  const ready = title.trim() !== '' && classId !== '' && codes.trim() !== '';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-exam-title">{t('admin.exams.create-title-label')}</Label>
          <Input
            id="admin-exam-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('admin.exams.create-title-placeholder')}
            maxLength={200}
            required
          />
        </div>
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label htmlFor="admin-exam-class">{t('admin.exams.create-class-label')}</Label>
          <select
            id="admin-exam-class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            required
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('admin.exams.create-class-placeholder')}</option>
            {(classes.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-36 flex-col gap-1.5">
          <Label htmlFor="admin-exam-duration">{t('admin.exams.create-duration-label')}</Label>
          <Input
            id="admin-exam-duration"
            type="number"
            min={1}
            max={720}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-exam-codes">{t('admin.exams.create-problems-label')}</Label>
        <Textarea
          id="admin-exam-codes"
          value={codes}
          onChange={(event) => setCodes(event.target.value)}
          placeholder={t('admin.exams.create-problems-placeholder')}
          rows={4}
          required
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-exam-opens">{t('admin.exams.create-opens-label')}</Label>
          <Input
            id="admin-exam-opens"
            type="datetime-local"
            value={opensAt}
            onChange={(event) => setOpensAt(event.target.value)}
          />
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-exam-closes">{t('admin.exams.create-closes-label')}</Label>
          <Input
            id="admin-exam-closes"
            type="datetime-local"
            value={closesAt}
            onChange={(event) => setClosesAt(event.target.value)}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-foreground">
          {t('admin.exams.create-strategy-label')}
        </legend>
        {(['fixed', 'per-student'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="seed-strategy"
              value={value}
              checked={strategy === value}
              onChange={() => setStrategy(value)}
            />
            {value === 'fixed'
              ? t('admin.exams.strategy-fixed')
              : t('admin.exams.strategy-per-student')}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t('admin.exams.strategy-note')}</p>
      </fieldset>

      <div>
        <Button type="submit" loading={create.isPending} disabled={!ready}>
          {t('admin.exams.create-submit')}
        </Button>
      </div>

      {serverError === null ? null : (
        // `role="alert"` chứ không `status`: đây là một thao tác vừa THẤT BẠI,
        // và người dùng cần biết ngay thay vì đợi tới lượt đọc kế tiếp.
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
    </form>
  );
}

function ExamsBody(props: {
  readonly page: number;
  readonly items: readonly ExamSummary[] | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly fetching: boolean;
  readonly hasNext: boolean;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
}): ReactElement {
  if (props.pending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (props.error !== null) {
    return (
      <ErrorState
        message={props.error}
        onRetry={props.onRetry}
        retrying={props.fetching}
      />
    );
  }
  const items = props.items ?? [];
  if (items.length === 0) {
    return <EmptyState title={t('admin.exams.empty-title')} description={t('admin.exams.empty-body')} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('admin.exams.col-title')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-class')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-problems')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-duration')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-attempts')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-created')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableHead scope="row" className="font-medium text-foreground">
                {item.title}
              </TableHead>
              <TableCell>{item.className}</TableCell>
              {/* `tabular-nums` để cột số không đổi bề rộng giữa các trang. */}
              <TableCell className="tabular-nums">{item.problemCodes.length}</TableCell>
              <TableCell className="tabular-nums">{item.durationMinutes}</TableCell>
              <TableCell className="tabular-nums">{item.attemptCount}</TableCell>
              <TableCell>{formatDay(item.createdAt)}</TableCell>
              <TableCell>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/exams/${item.id}`}>{t('admin.exams.open')}</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AdminNote>
        {t('admin.exams.note', { count: items.length, page: props.page })}
        {props.hasNext ? t('admin.exams.note-more') : null}
      </AdminNote>

      <CursorPager
        page={props.page}
        hasNext={props.hasNext}
        loading={props.fetching}
        onNext={props.onNext}
        onReset={props.onFirst}
      />
    </div>
  );
}

/**
 * `datetime-local` -> ISO, hoặc `null` khi để trống.
 *
 * ⚠ `datetime-local` trả một chuỗi KHÔNG có múi giờ (`2026-09-15T09:00`), và
 * `new Date(...)` diễn giải nó theo giờ ĐỊA PHƯƠNG của trình duyệt. Đó là hành
 * vi đúng ở đây: giảng viên gõ "9 giờ sáng" là 9 giờ sáng chỗ họ ngồi.
 * `.toISOString()` quy về UTC trước khi gửi, nên máy chủ không bao giờ phải
 * đoán múi giờ của ai.
 *
 * Trả `null` cho chuỗi rỗng, không trả `''`: `z.string().datetime()` sẽ từ chối
 * chuỗi rỗng bằng một câu lỗi nói về định dạng, trong khi ý người dùng là "không
 * đặt mốc này".
 */
function toIsoOrNull(local: string): string | null {
  if (local.trim() === '') {
    return null;
  }
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
