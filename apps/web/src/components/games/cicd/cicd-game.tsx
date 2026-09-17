'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactElement } from 'react';
import { CICD_LEVELS } from '@devops-platform/games';

import { CicdCampaign } from './cicd-campaign';
import { CicdSandbox } from './cicd-sandbox';

/**
 * Màn làm bài OJ, nạp ĐỘNG — 19.J.3.1.
 *
 * ⛔ Đừng đổi thành một `import` tĩnh. File kia tự cấp `TrpcQueryProvider`, và
 * `app/games/layout.tsx` CỐ Ý không cấp nó để giữ ô "0 lời gọi backend trong lúc
 * chơi" (AC-2, AC-D6 — đo bằng network trace). Một import tĩnh kéo trọn tầng
 * mạng vào bundle của mọi người chơi level, kể cả người không mở bài OJ nào.
 *
 * `ssr: false` vì màn này chỉ có nghĩa sau khi đã gọi được máy chủ từ trình
 * duyệt; dựng sẵn nó ở máy chủ chỉ đổi lấy một khung trống trong HTML đầu tiên.
 */
const CicdProblemScreen = dynamic(
  async () => (await import('./cicd-problem')).CicdProblemScreen,
  { ssr: false },
);

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
   * ⛔ ĐỌC THẲNG PROP từ 19.J — trước đó nó là STATE, và lý do đã biến mất.
   *
   * Bản cũ giữ state vì màn "Chế độ làm bài chưa mở" có một nút *"Xem danh sách
   * màn"*, tức một đường RỜI chế độ làm bài mà không rời URL. Màn làm bài thật
   * không có nút đó: thoát khỏi một bài là `window.location.assign` sang
   * `/problems/<mã>` (xem `cicd-problem.tsx`), tức một lần điều hướng thật.
   *
   * Giữ state sau khi nút kia biến mất là giữ một `setProblemCode` không ai gọi
   * — `eslint` bắt được đúng chỗ đó, và nó đúng: một state chỉ đọc mà không bao
   * giờ ghi là một prop được chép lại, cộng thêm một cơ hội để hai giá trị lệch
   * nhau khi `?problem=` đổi mà component không remount.
   */
  const problemCode = initialProblemCode;

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
     * ✅ MỞ Ở 19.J. Trước đợt này nhánh này trả một màn "Chế độ làm bài chưa mở",
     * vì `CicdGameAction.evaluate` chỉ chở YAML — bảng núm retries/cache và bảng
     * chính sách CD không có đường tới bộ chấm, nên một lượt nộp sẽ được phát lại
     * thành một lượt chơi KHÁC lượt người ta vừa chơi. 19.J.1 đóng khe đó (action
     * chở đủ ba mảnh) và đây là nửa còn lại.
     *
     * ⛔ `next/dynamic` chứ không `import` tĩnh, và đó là điều kiện để AC-2 /
     * AC-D6 còn đứng: `cicd-problem.tsx` tự cấp `TrpcQueryProvider`, nên một
     * import tĩnh kéo trọn tầng mạng tRPC vào bundle của MỌI người chơi level —
     * kể cả người không bao giờ mở một bài OJ nào.
     */
    return <CicdProblemScreen code={problemCode} />;
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
