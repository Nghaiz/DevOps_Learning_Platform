'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { CICD_LEVELS } from '@devops-platform/games';

import { CicdCampaign } from './cicd-campaign';
import { CicdSandbox } from './cicd-sandbox';

/**
 * Màn chơi của **Xưởng đường ống CI/CD** — 19.H, vỏ client của `/games/cicd`.
 *
 * Cùng hình dạng với `GitGame`: một chuỗi `return` sớm CÓ THỨ TỰ, không phải một
 * biến `screen`. Thứ tự là hợp đồng, và nó đọc từ trên xuống:
 *
 *   1. `?problem=` — địa chỉ cụ thể người dùng vừa bấm, thắng mọi đường vào khác.
 *   2. bàn thử tự do
 *   3. còn lại ⇒ danh sách màn
 *
 * ⚠ **MÀN CHƠI KHÔNG CÒN Ở ĐÂY** (19.D). Nó có route riêng,
 * `/games/cicd/<levelId>` — xem `cicd-level-route.tsx`. Trước đây `levelId` là
 * React state, nên bấm một màn từ danh sách KHÔNG đổi URL: cùng một
 * `/games/cicd` phục vụ cả trang danh mục lẫn màn chơi, và vỏ ứng dụng —
 * vốn quyết định immersive bằng `pathname` — không có cách nào phân biệt hai
 * trạng thái đó. Sân chơi vì thế không bao giờ toàn màn hình được (AC-D7).
 *
 * ⛔ Đừng đưa `levelId` trở lại thành state ở đây. Nó sẽ chạy, sẽ không lỗi, và
 * sẽ âm thầm lấy lại 224px sidebar của sân chơi.
 *
 * ⛔ **0 lời gọi backend trong lúc chơi.** `app/games/layout.tsx` CỐ Ý không cấp
 * `TrpcQueryProvider`, nên bất kỳ import nào kéo theo client tRPC ở đây sẽ nổ
 * lúc chạy chứ không lúc biên dịch. Engine CI/CD chạy hoàn toàn trong bộ nhớ.
 */

export interface CicdGameProps {
  /**
   * Mã bài từ `?problem=`. `null` ⇒ không ở chế độ làm bài.
   *
   * ⚠ Chỉ `page.tsx` đọc tham số này — cùng luật đã ghi cho đấu trường K8s và
   * game Git: hai chỗ cùng đọc một tham số là hai chỗ có thể bất đồng về việc
   * đang ở chế độ nào.
   */
  readonly initialProblemCode: string | null;
}

/*
 * ⚠ `theory` đã BỎ khỏi props (19.D), và đó không phải dọn dẹp tuỳ hứng.
 *
 * Bài lý thuyết chỉ có một chỗ đọc: màn chơi. Màn chơi nay sống ở
 * `/games/cicd/<levelId>`, và route đó tự gọi `loadCicdTheory()`. Giữ prop ở
 * đây thì trang DANH MỤC phải đọc toàn bộ bài lý thuyết từ đĩa cho một thứ nó
 * không bao giờ dùng tới.
 */
export function CicdGame({ initialProblemCode }: CicdGameProps): ReactElement {
  const router = useRouter();
  const [sandbox, setSandbox] = useState(false);
  /*
   * Mã bài là STATE chứ không đọc thẳng prop, vì màn dưới có một nút thoát khỏi
   * chế độ đó. Đọc thẳng prop thì nút ấy không làm được gì: prop không đổi, nên
   * lần render sau vẫn rơi vào đúng nhánh vừa muốn rời — một nút chết mà không
   * lỗi nào báo.
   */
  const [problemCode, setProblemCode] = useState<string | null>(initialProblemCode);

  /*
   * Chọn một màn = ĐIỀU HƯỚNG, không phải đổi state.
   *
   * `router.push` chứ không `<Link>` vì `CicdCampaign` nhận một callback
   * `onPick(id)` và không biết gì về route — giữ nó như vậy để danh sách màn còn
   * dùng lại được ở chỗ khác. Lọc qua `CICD_LEVELS` trước khi đẩy: một id lạ
   * lọt ra sẽ thành 404, và 404 do chính giao diện tự tạo thì khó lần hơn nhiều
   * so với việc không đi đâu cả.
   */
  const onPick = useCallback(
    (id: string) => {
      if (!CICD_LEVELS.some((l) => l.id === id)) return;
      router.push(`/games/cicd/${id}`);
    },
    [router],
  );

  if (problemCode !== null) {
    /*
     * ⚠ KHÔNG đổ người dùng vào danh sách màn ở nhánh này.
     *
     * Bộ chấm phía máy chủ ĐÃ có (`cicd/problem-plugin.ts`), nhưng màn này chưa
     * dựng `RunLog` và chưa nộp. Còn một câu phải quyết trước khi mở: nhật ký chỉ
     * chở YAML, nên retries/cache của bảng núm không tới được bộ chấm — xem
     * phase-19.md §0b "Đợt 3". Cho tới lúc đó, đường đúng là nói thẳng rằng địa
     * chỉ này chưa mở, kèm mã bài để người dùng biết mình không gõ nhầm. Chuyển
     * hướng lặng sang danh sách màn sẽ đọc ra thành "mã bài của tôi sai", và họ
     * sẽ đi sửa một thứ không hỏng.
     */
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-foreground">Chế độ làm bài chưa mở</h1>
        <p className="text-sm text-muted-foreground">
          Bài <span className="font-mono">{problemCode}</span> tồn tại, nhưng đấu trường
          CI/CD chưa nhận nộp bài. {CICD_LEVELS.length} màn của chiến dịch thì chơi được ngay.
        </p>
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setProblemCode(null);
            }}
          >
            Xem danh sách màn
          </Button>
        </div>
      </div>
    );
  }
  if (sandbox) {
    return (
      <CicdSandbox
        onExit={() => {
          setSandbox(false);
        }}
      />
    );
  }
  return (
    <CicdCampaign
      onPick={onPick}
      onSandbox={() => {
        setSandbox(true);
      }}
    />
  );
}
