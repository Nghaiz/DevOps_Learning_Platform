'use client';

import { useId, useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { err, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { Button, cn, Icon, Input, Label, Skeleton } from '@devops-platform/ds';

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
 * Gọi qua `utils.classes.list.fetch` để mỗi trang vẫn nằm trong cache tRPC.
 *
 * ## Khoá cache nằm DƯỚI khoá của `classes.list`
 *
 * Bản trước dùng một khoá tự đặt (`['admin', 'exam-form', 'all-classes']`), và
 * `utils.classes.list.invalidate()` (gọi sau mỗi lượt tạo lớp, thêm hay bỏ sinh
 * viên) so khớp theo TIỀN TỐ `[['classes', 'list']]`: khoá tự đặt không bao giờ
 * khớp, nên ô chọn lớp giữ danh sách cũ và lớp vừa tạo không chọn được tới khi
 * tải lại trang. Nay khoá bắt đầu bằng đúng khoá của procedure
 * (`getQueryKey(api.classes.list)`), nên mọi lượt `invalidate()` của
 * `classes.list` làm mới cả ô này mà không nơi gọi nào phải nhớ tới nó.
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
    queryKey: [...getQueryKey(api.classes.list), { picker: 'all-pages' }],
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
      <legend className="text-sm font-medium text-ink">{t('admin.exams.form.class-label')}</legend>

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
          <p className="text-xs text-ink-2">{t('admin.exams.form.class-loading')}</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : all.isError ? (
        <ClassesError reason={describeTrpcError(all.error)} onRetry={() => void all.refetch()} retrying={all.isFetching} />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-2">{t('admin.exams.form.class-none')}</p>
      ) : (
        <>
          <div id={listId} className={cn('relative overflow-y-auto rounded-md border border-rule-2 bg-paper', VISIBLE_ROWS_CLASS)}>
            {matches.length === 0 ? (
              <p className="p-3 text-sm text-ink-2">
                {t('admin.exams.form.class-no-match', { query: query.trim() })}
              </p>
            ) : (
              matches.map((item) => {
                const selected = item.id === props.value;
                return (
                  <label
                    key={item.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b border-rule px-3 py-2.5 text-sm last:border-b-0',
                      'transition-colors duration-150',
                      selected ? 'bg-acc-tint text-acc-ink' : 'hover:bg-well',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus',
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
                      {selected ? <Icon name="check" size={16} /> : null}
                    </span>
                    <span className="flex-1 font-medium">{item.name}</span>
                    <span className="text-xs tabular-nums">{item.memberCount}</span>
                  </label>
                );
              })
            )}
          </div>
          <p className="text-xs text-ink-3">
            {all.data.truncated
              ? t('admin.exams.form.class-truncated', { count: items.length })
              : t('admin.exams.form.class-count', { count: items.length })}
          </p>
        </>
      )}

      {picked === undefined ? null : (
        <p className="text-sm font-medium text-ink">{t('admin.exams.form.class-picked', { name: picked.name })}</p>
      )}
      {props.error === undefined ? null : (
        <p id={errorId} className="text-sm text-bad-ink">
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
    <div role="alert" className="flex flex-col items-start gap-2 border border-t-2 border-rule border-t-bad-mid bg-paper p-3 text-sm">
      <p className="text-bad-ink">{failure.what}</p>
      <p className="text-ink">{failure.next}</p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
        {t('admin.exams.form.class-retry')}
      </Button>
    </div>
  );
}
