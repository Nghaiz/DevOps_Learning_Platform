import { Boxes, CircleCheckBig, Route, type LucideIcon } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { HomeSection } from './home-section';

/**
 * "Nền tảng này làm gì cho bạn" — ba luận điểm.
 *
 * Ba đoạn chữ giữ NGUYÊN VĂN bản cũ; chúng nói đúng và cụ thể. Thay đổi là
 * PHÂN CẤP: mỗi thẻ mở bằng một ô icon, rồi tiêu đề, rồi đoạn mô tả — ba bậc
 * đọc ra được từ xa, thay cho ba khối chữ cùng cỡ nằm cạnh nhau.
 *
 * Ô icon dùng `bg-accent text-accent-foreground`, cặp đã nằm trong `TEXT_PAIRS`
 * của `packages/ui/src/theme/tokens.contract.test.ts` (đo lại trên giá trị sau
 * 95efe1f: 15.53 sáng / 14.48 tối) — không sinh cặp màu mới.
 *
 * `shadow-elevation-1` đè `shadow-sm` mặc định của `Card`, để ba thẻ này ngang
 * bậc với bốn ô số liệu và ba ô bước ở hai dải kia — cùng một trang thì cùng
 * một mặt phẳng. ⚠ Đây là đè TẠI CHỖ GỌI, không phải cách đúng lâu dài: mặc
 * định của `Card` nên chuyển sang `shadow-elevation-1` ngay trong
 * `packages/ui/src/card.tsx`, và khi ấy `className` ở đây bỏ đi được. File đó
 * thuộc lane khác — đã ghi vào report thay vì tự sửa.
 */
const HIGHLIGHTS: readonly {
  readonly title: string;
  readonly body: string;
  readonly icon: LucideIcon;
}[] = [
  {
    title: 'Sandbox thật, không phải mô phỏng',
    body: 'Mỗi phiên là một pod riêng có Kubernetes và containerd chạy bên trong. Lệnh bạn gõ là lệnh thật, lỗi bạn gặp là lỗi thật — và không có gì phải cài trên máy bạn.',
    icon: Boxes,
  },
  {
    title: 'Chấm bằng cách chạy, không bằng cách đoán',
    body: 'Mỗi bước được kiểm bằng chính lệnh chạy trong sandbox của bạn. Sai ở đâu thì kết quả nói ra đúng chỗ đó, thay vì một dấu tích không giải thích gì.',
    icon: CircleCheckBig,
  },
  {
    title: 'Biết mình đang ở đâu',
    body: 'Lộ trình xếp bài theo thứ tự, quiz kiểm lại phần vừa học, và trang Của tôi cộng tiến độ lúc bạn mở — không phải một con số lưu sẵn từ tuần trước.',
    icon: Route,
  },
];

export function ValueProps() {
  return (
    <HomeSection labelledBy="vi-sao" innerClassName="flex flex-col gap-6">
      <h2 id="vi-sao" className="text-xl font-semibold text-foreground">
        Nền tảng này làm gì cho bạn
      </h2>
      <div className="grid gap-4 min-[769px]:grid-cols-3">
        {HIGHLIGHTS.map(({ title, body, icon: Icon }) => (
          <Card key={title} className="flex flex-col gap-3 shadow-elevation-1">
            {/* Icon thuần trang trí — tiêu đề ngay dưới đã nói nội dung. */}
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
            >
              <Icon className="size-5" />
            </span>
            <CardTitle className="text-balance">{title}</CardTitle>
            <CardDescription className="text-pretty">{body}</CardDescription>
          </Card>
        ))}
      </div>
    </HomeSection>
  );
}
