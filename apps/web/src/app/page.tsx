import { Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { HomeCta } from './home-cta';

/**
 * Trang chủ — Server Component. Một trong hai màn hình người lạ thấy đầu tiên.
 *
 * KHÔNG render `<main>`: vỏ ứng dụng (`components/shell/app-shell.tsx`) sở hữu
 * landmark đó cho mọi trang. Cũng KHÔNG `min-h-screen`: vỏ đã là
 * `min-h-dvh flex flex-col` và trang là ô co giãn bên trong — cộng thêm một
 * chiều cao bằng cả màn hình vào đó là luôn có thanh cuộn dư đúng bằng chiều
 * cao thanh điều hướng.
 */
const HIGHLIGHTS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Sandbox thật, không phải mô phỏng',
    body: 'Mỗi phiên là một pod riêng có Kubernetes và containerd chạy bên trong. Lệnh bạn gõ là lệnh thật, lỗi bạn gặp là lỗi thật — và không có gì phải cài trên máy bạn.',
  },
  {
    title: 'Chấm bằng cách chạy, không bằng cách đoán',
    body: 'Mỗi bước được kiểm bằng chính lệnh chạy trong sandbox của bạn. Sai ở đâu thì kết quả nói ra đúng chỗ đó, thay vì một dấu tích không giải thích gì.',
  },
  {
    title: 'Biết mình đang ở đâu',
    body: 'Lộ trình xếp bài theo thứ tự, quiz kiểm lại phần vừa học, và trang Của tôi cộng tiến độ lúc bạn mở — không phải một con số lưu sẵn từ tuần trước.',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12 min-[769px]:px-6 min-[769px]:py-16">
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground min-[769px]:text-4xl">
          Học DevOps bằng cách gõ lệnh thật
        </h1>
        <p className="max-w-2xl text-base text-pretty text-muted-foreground min-[769px]:text-lg">
          Bài học, lab và playground đều chạy trong một sandbox Kubernetes dựng riêng cho
          bạn, mở trong vài giây và tự dọn khi bạn xong.
        </p>
        <HomeCta />
      </section>

      <section aria-labelledby="vi-sao" className="flex flex-col gap-6">
        <h2 id="vi-sao" className="text-xl font-semibold text-foreground">
          Nền tảng này làm gì cho bạn
        </h2>
        <div className="grid gap-4 min-[769px]:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <Card key={item.title} className="flex flex-col gap-2">
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.body}</CardDescription>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
