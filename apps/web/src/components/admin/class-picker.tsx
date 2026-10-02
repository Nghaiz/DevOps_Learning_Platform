'use client';

import { useId, useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { err, t } from '@devops-platform/copy';
import { Button, Input, Label, Skeleton, cn } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';

/**
 * Ô chọn lớp của form ra đề: TÌM được, và đọc HẾT các trang của `classes.list`.
 *
 * ## Lỗi cũ mà ô này sửa
 *
 * Bản trước gọi `classes.list.useQuery({})` một lần và đổ `items` vào một
 * `<select>`. `listInputSchema` mặc định 20 dòng mỗi trang, nên lớp thứ 21 trở
 * đi KHÔNG BAO GIỜ chọn được, và không có câu nào nói ra điều đó.
 *
 * ## Đọc hết bằng vòng cursor, có trần, và trần thì nói ra
 *
 * Mỗi lượt lấy `CLASSES_PAGE_LIMIT` dòng (trần `MAX_LIST_LIMIT` của máy chủ)
 * tới khi `nextCursor` là `null`. `CLASSES_MAX_PAGES` chặn một vòng vô tận nếu
 * máy chủ lỡ trả lại cùng một cursor; chạm trần thì danh sách hiện câu
 * "mới đọc N lớp đầu tiên, còn nữa" thay vì giả vờ là đủ.
 *
 * Gọi qua `utils.classes.list.fetch` để mỗi trang vẫn nằm trong cache tRPC, và
 * `invalidate()` sau lượt tạo lớp làm mới được cả ô này.
 */
const CLASSES_PAGE_LIMIT = 100;
const CLASSES_MAX_PAGES = 20;

/** Số dòng hiện cùng lúc trước khi danh sách cuộn. */
const VISIBLE_ROWS_CLASS = 'max-h-72';

interface PickerClass {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
}

export function ClassPicker(props: {
  readonly value: string;
  readonly onChange: (classId: string) => void;
  readonly error?: string | undefined;
  /** id của ô đầu tiên, để form đưa tiêu điểm vào khi bước này còn lỗi. */
  readonly inputId: string;
}): ReactElement {
  const utils = api.useUtils();
  const [query, setQuery] = useState('');
  const listId = useId();
  const errorId = useId();

  const all = useQuery({
    queryKey: ['admin', 'exam-form', 'all-classes'],
    queryFn: async (): Promise<{ readonly items: readonly PickerClass[]; readonly truncated: boolean }> => {
      const items: PickerClass[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < CLASSES_MAX_PAGES; page += 1) {
        const result = await utils.classes.list.fetch(
          cursor === undefined ? { limit: CLASSES_PAGE_LIMIT } : { limit: CLASSES_PAGE_LIMIT, cursor },
        );
        items.push(...result.items.map((row) => ({ id: row.id, name: row.name, memberCount: row.memberCount })));
        if (result.nextCursor === null) {
          return { items, truncated: false };
        }
        cursor = result.nextCursor;
      }
      return { items, truncated: true };
    },
  });

  const needle = query.trim().toLocaleLowerCase('vi');
  const items = useMemo(() => all.data?.items ?? [], [all.data]);
  const matches = useMemo(
    () => (needle === '' ? items : items.filter((item) => item.name.toLocaleLowerCase('vi').includes(needle))),
    [items, needle],
  );
  const picked = items.find((item) => item.id === props.value);

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={props.error === undefined ? undefined : errorId}>
      <legend className="text-sm font-semibold text-foreground">{t('admin.exams.form.class-label')}</legend>

      <Label htmlFor={props.inputId} className="sr-only">
        {t('admin.exams.form.class-search')}
      </Label>
      <Input
        id={props.inputId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('admin.exams.form.class-search')}
        aria-controls={listId}
        aria-invalid={props.error === undefined ? undefined : true}
      />

      {all.isPending ? (
        <div className="flex flex-col gap-1" aria-busy="true">
          <p className="text-xs text-muted-foreground">{t('admin.exams.form.class-loading')}</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : all.isError ? (
        <ClassesError reason={describeTrpcError(all.error)} onRetry={() => void all.refetch()} retrying={all.isFetching} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.exams.form.class-none')}</p>
      ) : (
        <>
          <div id={listId} className={cn('overflow-y-auto border border-border bg-card', VISIBLE_ROWS_CLASS)}>
            {matches.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t('admin.exams.form.class-no-match', { query: query.trim() })}
              </p>
            ) : (
              matches.map((item) => {
                const selected = item.id === props.value;
                return (
                  <label
                    key={item.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0',
                      'transition-colors duration-(--motion-fast)',
                      selected ? 'bg-ink text-ink-foreground' : 'hover:bg-muted',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-inset',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${listId}-class`}
                      value={item.id}
                      checked={selected}
                      onChange={() => props.onChange(item.id)}
                      className="sr-only"
                    />
                    <span aria-hidden="true" className="flex size-4 items-center justify-center">
                      {selected ? <Check className="size-4" /> : null}
                    </span>
                    <span className="flex-1 font-medium">{item.name}</span>
                    <span className="font-mono text-xs opacity-70 tabular-nums">{item.memberCount}</span>
                  </label>
                );
              })
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {all.data.truncated
              ? t('admin.exams.form.class-truncated', { count: items.length })
              : t('admin.exams.form.class-count', { count: items.length })}
          </p>
        </>
      )}

      {picked === undefined ? null : (
        <p className="text-sm font-medium text-foreground">{t('admin.exams.form.class-picked', { name: picked.name })}</p>
      )}
      {props.error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}

function ClassesError({
  reason,
  onRetry,
  retrying,
}: {
  readonly reason: string;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const failure = err('admin.error.exam-classes', { reason });
  return (
    <div role="alert" className="flex flex-col items-start gap-2 border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <p className="text-destructive">{failure.what}</p>
      <p className="text-foreground">{failure.next}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} loading={retrying}>
        {t('admin.exams.form.class-retry')}
      </Button>
    </div>
  );
}
