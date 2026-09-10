import { t, type TextKey } from '@devops-platform/copy';
import { HomeSection } from './home-section';

/**
 * "Bắt đầu thế nào" — ba bước.
 *
 * Câu hỏi đầu tiên của người mới không phải "nền tảng này tốt ở đâu" mà "tôi
 * phải làm gì bây giờ". Trang cũ trả lời câu đó bằng hai cái nút và không gì
 * khác, nên người chưa đăng nhập không biết sau khi bấm thì chuyện gì xảy ra.
 *
 * ## Con số ba ở đây là ba THẬT, và nó được khai ra
 *
 * Luật giọng văn số 5 cấm liệt kê đúng ba ý trừ khi thật sự có ba, và cổng T3
 * của `packages/copy` bắt mọi nhóm ba khoá anh em. Nhóm này đi qua cổng bằng
 * hai dòng trong `homeIntentionalThree`, không phải bằng một cách đặt tên né
 * được bộ dò: `apps/web/src/proxy.ts` đặt đúng một cổng đăng nhập trước mọi
 * đường nội dung, nên chuỗi việc từ lúc mở trang tới lúc gõ được lệnh là đăng
 * nhập, chọn nội dung, vào phiên chạy. Bỏ cổng đó đi thì nhóm này còn hai bước.
 *
 * Nội dung ba bước KHÔNG phải lời hứa mới: cả ba đều nói lại đúng hành vi đã
 * mô tả ở dải "Nền tảng này làm gì cho bạn" và ở các trang danh mục, không cam
 * kết thời gian, không con số, không tính năng chưa có.
 *
 * `<ol>` chứ không phải `<div>`: thứ tự là NGHĨA ở đây, và thẻ danh sách có thứ
 * tự là thứ trình đọc màn hình thông báo được ("mục 2 trên 3"). Con số trong
 * hình tròn vì vậy `aria-hidden` — nó vẽ lại thứ tự mà thẻ đã mang, đọc lên là
 * đọc thừa.
 */
const STEPS: readonly {
  readonly id: string;
  readonly title: TextKey;
  readonly body: TextKey;
}[] = [
  { id: 'signin', title: 'home.step-title.signin', body: 'home.step-body.signin' },
  { id: 'pick', title: 'home.step-title.pick', body: 'home.step-body.pick' },
  { id: 'run', title: 'home.step-title.run', body: 'home.step-body.run' },
];

export function GettingStarted() {
  return (
    <HomeSection tone="muted" labelledBy="bat-dau" innerClassName="flex flex-col gap-6">
      <h2 id="bat-dau" className="text-xl font-semibold text-foreground">
        {t('home.step.heading')}
      </h2>
      <ol className="grid gap-4 min-[769px]:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5 shadow-elevation-1"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
            >
              {index + 1}
            </span>
            <h3 className="text-base font-semibold text-balance text-foreground">
              {t(step.title)}
            </h3>
            <p className="text-sm text-pretty text-muted-foreground">{t(step.body)}</p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
