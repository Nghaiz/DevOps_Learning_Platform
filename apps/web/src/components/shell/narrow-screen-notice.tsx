import { Alert, AlertDescription, AlertTitle, cn } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { TERMINAL_MIN_WIDTH_PX } from './breakpoints';

/**
 * Thứ hiện **thay cho** terminal khi khung nhìn hẹp hơn `TERMINAL_MIN_WIDTH_PX`
 * (plan 13.B mục 8: "≤768px hạ cấp có chủ ý — đọc nội dung được, terminal hiện
 * cảnh báo thay vì vỡ").
 *
 * Đặt ở `components/shell/**` vì lane B sở hữu hợp đồng điểm ngắt; lane D1/D2
 * (trình học) **import** component này thay vì tự viết câu cảnh báo riêng — ba
 * câu khác nhau cho cùng một tình huống là ba câu sẽ trôi khỏi nhau.
 */
export function NarrowScreenNotice({ className }: { readonly className?: string }) {
  return (
    <Alert variant="warning" className={cn('m-4', className)}>
      <AlertTitle>{t('shell.narrow.title', { minWidth: TERMINAL_MIN_WIDTH_PX })}</AlertTitle>
      <AlertDescription>{t('shell.narrow.body')}</AlertDescription>
    </Alert>
  );
}
