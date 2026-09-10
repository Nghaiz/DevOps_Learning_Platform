import { Boxes, CircleCheckBig, Laptop, Route, type LucideIcon } from 'lucide-react';
import { t, type TextKey } from '@devops-platform/copy';
import { Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { HomeSection } from './home-section';

/**
 * "Nền tảng này làm gì cho bạn" — BỐN luận điểm, không phải ba.
 *
 * Bản trước có ba, và chú thích của chính nó tự khai "ba luận điểm". Đó đúng là
 * hình dạng mà luật giọng văn số 5 tồn tại để chặn: không liệt kê đúng ba ý trừ
 * khi thật sự có ba. Luận điểm thứ tư không phải chữ độn để lấp cho đủ bốn:
 * "không cài gì trên máy bạn" là câu trả lời cho phản đối đầu tiên của người
 * mới, và trước đây nó bị chôn trong thân bước một ở dải "Bắt đầu thế nào".
 *
 * Đưa nó lên đúng hạng kéo theo một sửa ở dải kia: bước một nay nói việc mà
 * bước một thật sự làm (phiên gắn với tài khoản, tiến độ đi theo bạn) thay vì
 * lặp lại câu này lần thứ hai.
 *
 * Ô icon dùng `bg-accent text-accent-foreground`, cặp đã nằm trong `TEXT_PAIRS`
 * của `packages/ui/src/theme/tokens.contract.test.ts` (15.53 sáng / 14.48 tối)
 * nên không sinh cặp màu mới.
 *
 * `shadow-elevation-1` đè `shadow-sm` mặc định của `Card`, để bốn thẻ này ngang
 * bậc với bốn ô số liệu và ba ô bước ở hai dải kia. ⚠ Đây là đè TẠI CHỖ GỌI,
 * không phải cách đúng lâu dài: mặc định của `Card` nên chuyển sang
 * `shadow-elevation-1` ngay trong `packages/ui/src/card.tsx`, và khi ấy
 * `className` ở đây bỏ đi được. File đó thuộc lane khác, nên ghi vào report
 * thay vì tự sửa. Ghi chú này đã có từ lượt trước và vẫn chưa được đóng.
 */
const HIGHLIGHTS: readonly {
  readonly id: string;
  readonly title: TextKey;
  readonly body: TextKey;
  readonly icon: LucideIcon;
}[] = [
  {
    id: 'sandbox',
    title: 'home.value-title.sandbox',
    body: 'home.value-body.sandbox',
    icon: Boxes,
  },
  {
    id: 'grading',
    title: 'home.value-title.grading',
    body: 'home.value-body.grading',
    icon: CircleCheckBig,
  },
  {
    id: 'progress',
    title: 'home.value-title.progress',
    body: 'home.value-body.progress',
    icon: Route,
  },
  {
    id: 'local',
    title: 'home.value-title.local',
    body: 'home.value-body.local',
    icon: Laptop,
  },
];

export function ValueProps() {
  return (
    <HomeSection labelledBy="vi-sao" innerClassName="flex flex-col gap-6">
      <h2 id="vi-sao" className="text-xl font-semibold text-foreground">
        {t('home.value.heading')}
      </h2>
      {/*
        Bốn cột ở màn rộng, hai ở màn vừa. Không ba: một lưới ba cột cho bốn thẻ
        để lại một thẻ lẻ ở hàng dưới, và mắt đọc thẻ lẻ đó ra là kém quan trọng
        hơn ba thẻ trên.
      */}
      <div className="grid gap-4 sm:grid-cols-2 min-[1024px]:grid-cols-4">
        {HIGHLIGHTS.map(({ id, title, body, icon: Icon }) => (
          <Card key={id} className="flex flex-col gap-3 shadow-elevation-1">
            {/* Icon thuần trang trí — tiêu đề ngay dưới đã nói nội dung. */}
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
            >
              <Icon className="size-5" />
            </span>
            <CardTitle className="text-balance">{t(title)}</CardTitle>
            <CardDescription className="text-pretty">{t(body)}</CardDescription>
          </Card>
        ))}
      </div>
    </HomeSection>
  );
}
