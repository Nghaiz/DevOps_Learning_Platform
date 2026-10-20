'use client';

import Link from 'next/link';
import { Button, ErrorBlock, Icon, Pill, Row, RowList, RowsSkeleton, Section } from '@devops-platform/ds';
import { err, renderCopy, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatWhen } from '../../lib/format-moment';
import { EXAM_WINDOW_KEYS, examWhen, examWindow } from '../../app/(session)/exams/exam-status';

/**
 * Kỳ thi đang mở hoặc sắp mở của lớp. Không có thì một câu ngắn, không vẽ khung
 * rỗng to: phần lớn sinh viên không có kỳ thi trong hầu hết các ngày.
 */
export function ClassExams({ headingLevel = 2 }: { readonly headingLevel?: 2 | 3 }) {
  const exams = api.examSitting.list.useQuery();
  const items =
    exams.data === undefined
      ? []
      : exams.data.items
          .map((item) => ({ item, window: examWindow(item, exams.data.serverNow) }))
          .filter(({ item, window }) => window !== 'closed' && item.submittedAt === null);

  return (
    <Section
      title={t('me.exams.title')}
      level={headingLevel}
      icon="timer"
      aside={
        <Link href="/exams" className="text-acc-ink hover:underline">
          {t('me.exams.all')}
        </Link>
      }
    >
      {exams.isPending ? <RowsSkeleton rows={1} label={t('me.exams.title')} /> : null}
      {/* Lỗi tải KHÔNG được làm cả khối biến mất: sinh viên có kỳ thi đang mở sẽ không thấy gì. */}
      {exams.isError ? (
        <ErrorBlock
          title={err('me.error.exams-load', { reason: describeTrpcError(exams.error) }).what}
          retryLabel={t('common.action.retry')}
          retrying={exams.isFetching}
          onRetry={() => void exams.refetch()}
        >
          {err('me.error.exams-load', { reason: describeTrpcError(exams.error) }).next}
        </ErrorBlock>
      ) : null}
      {exams.isSuccess && items.length === 0 ? <p className="text-sm text-ink-3">{t('me.exams.empty')}</p> : null}
      {items.length > 0 ? (
        <RowList label={t('me.exams.title')}>
          {items.map(({ item, window }) => (
            <Row
              key={item.id}
              leading={<Icon name="exam" size={26} tint="acc" className="text-acc-ink" />}
              title={item.title}
              link={<Link href={`/exams/${encodeURIComponent(item.id)}`}>{item.title}</Link>}
              description={`${item.className}. ${renderCopy(examWhen(item, (iso) => formatWhen(iso)))}`}
              below={
                /*
                 * Trạng thái và nút nằm DƯỚI mô tả chứ không ở cột phải: khung này thường đứng
                 * trong cột phụ hẹp, và hai thứ đó chiếm ngang làm tên kỳ thi bị cắt còn vài chữ.
                 */
                <div className="flex flex-wrap items-center gap-3">
                  <Pill tone={window === 'open' ? 'ok' : 'info'} dot live={window === 'open'}>
                    {t(EXAM_WINDOW_KEYS[window])}
                  </Pill>
                  {window === 'open' ? (
                    <Button asChild size="sm" variant="primary" className="relative z-10">
                      <Link href={`/exams/${encodeURIComponent(item.id)}`}>{t('me.exams.enter')}</Link>
                    </Button>
                  ) : null}
                </div>
              }
            />
          ))}
        </RowList>
      ) : null}
    </Section>
  );
}
