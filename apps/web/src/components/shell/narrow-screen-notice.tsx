import { Alert, AlertDescription, AlertTitle, cn } from '@devops-platform/ui';
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
      <AlertTitle>Cần màn hình rộng hơn (≥{TERMINAL_MIN_WIDTH_PX}px) để mở terminal</AlertTitle>
      <AlertDescription>
        Terminal cần ít nhất 80 cột để lệnh không bị ngắt dòng giữa chừng. Hãy xoay ngang
        thiết bị hoặc mở lại trang này trên máy tính. Phần nội dung bài học phía trên vẫn
        đọc và học được bình thường.
      </AlertDescription>
    </Alert>
  );
}
