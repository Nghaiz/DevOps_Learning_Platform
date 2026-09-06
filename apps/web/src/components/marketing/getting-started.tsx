import { HomeSection } from './home-section';

/**
 * "Bắt đầu thế nào" — ba bước.
 *
 * Câu hỏi đầu tiên của người mới không phải "nền tảng này tốt ở đâu" mà "tôi
 * phải làm gì bây giờ". Trang cũ trả lời câu đó bằng hai cái nút và không gì
 * khác, nên người chưa đăng nhập không biết sau khi bấm thì chuyện gì xảy ra.
 *
 * Nội dung ba bước KHÔNG phải lời hứa mới: cả ba đều nói lại đúng hành vi đã
 * mô tả ở dải "Nền tảng này làm gì cho bạn" và ở các trang danh mục — không
 * cam kết thời gian, không con số, không tính năng chưa có.
 *
 * `<ol>` chứ không phải `<div>`: thứ tự là NGHĨA ở đây, và thẻ danh sách có thứ
 * tự là thứ trình đọc màn hình thông báo được ("mục 2 trên 3"). Con số trong
 * hình tròn vì vậy `aria-hidden` — nó vẽ lại thứ tự mà thẻ đã mang, đọc lên là
 * đọc thừa.
 */
const STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Đăng nhập',
    body: 'Không cần cài gì trên máy bạn. Sandbox dựng phía máy chủ; bạn chỉ cần một trình duyệt.',
  },
  {
    title: 'Chọn một lộ trình, hoặc một bài lẻ',
    body: 'Lộ trình xếp sẵn thứ tự và mở khoá dần. Chưa biết bắt đầu từ đâu thì đi theo lộ trình; đã biết mình thiếu gì thì vào thẳng bài đó.',
  },
  {
    title: 'Gõ lệnh, hệ thống chấm bằng cách chạy',
    body: 'Mỗi bước kiểm bằng chính lệnh chạy trong sandbox của bạn, nên kết quả nói ra sai ở đâu. Xong thì phiên tự dọn.',
  },
];

export function GettingStarted() {
  return (
    <HomeSection tone="muted" labelledBy="bat-dau" innerClassName="flex flex-col gap-6">
      <h2 id="bat-dau" className="text-xl font-semibold text-foreground">
        Bắt đầu thế nào
      </h2>
      <ol className="grid gap-4 min-[769px]:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5 shadow-elevation-1"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
            >
              {index + 1}
            </span>
            <h3 className="text-base font-semibold text-balance text-foreground">{step.title}</h3>
            <p className="text-sm text-pretty text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
