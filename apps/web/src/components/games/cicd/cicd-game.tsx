'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactElement } from 'react';

import { CicdCampaign } from './cicd-campaign';
import { CicdSandbox } from './cicd-sandbox';
import { LegacySkin } from '../legacy-skin';

/**
 * Màn làm bài OJ, nạp ĐỘNG (19.J.3.1).
 *
 * ⛔ Đừng đổi thành một `import` tĩnh. File kia tự cấp `TrpcQueryProvider`, và
 * `app/games/layout.tsx` CỐ Ý không cấp nó để giữ ô "0 lời gọi backend trong lúc
 * chơi" (AC-2, AC-D6, đo bằng network trace). Một import tĩnh kéo trọn tầng
 * mạng vào bundle của mọi người chơi level, kể cả người không mở bài OJ nào.
 *
 * `ssr: false` vì màn này chỉ có nghĩa sau khi đã gọi được máy chủ từ trình duyệt.
 */
const CicdProblemScreen = dynamic(
  async () => (await import('./cicd-problem')).CicdProblemScreen,
  { ssr: false },
);

/**
 * Vỏ client của `/games/cicd` (19.H). Một chuỗi `return` sớm CÓ THỨ TỰ, và thứ
 * tự là hợp đồng:
 *
 *   1. `?problem=`: địa chỉ cụ thể người dùng vừa bấm, thắng mọi đường vào khác.
 *   2. bàn thử tự do
 *   3. còn lại ⇒ danh sách màn
 *
 * ⚠ **MÀN CHƠI KHÔNG Ở ĐÂY** (19.D). Nó có route riêng `/games/cicd/<levelId>`
 * (`cicd-level-route.tsx`), vì vỏ ứng dụng quyết định immersive bằng `pathname`.
 * Danh sách màn dẫn tới đó bằng liên kết thật, không bằng state.
 *
 * ⛔ Đừng đưa `levelId` trở lại thành state ở đây. Nó sẽ chạy, sẽ không lỗi, và
 * sẽ âm thầm lấy lại thanh đầu trang của sân chơi.
 *
 * ⛔ **0 lời gọi backend trong lúc chơi.** Engine CI/CD chạy hoàn toàn trong bộ nhớ.
 */
export interface CicdGameProps {
  /**
   * Mã bài từ `?problem=`. `null` ⇒ không ở chế độ làm bài.
   *
   * ⚠ Chỉ `page.tsx` đọc tham số này: hai chỗ cùng đọc một tham số là hai chỗ có
   * thể bất đồng về việc đang ở chế độ nào.
   */
  readonly initialProblemCode: string | null;
}

export function CicdGame({ initialProblemCode }: CicdGameProps): ReactElement {
  const [sandbox, setSandbox] = useState(false);

  if (initialProblemCode !== null) {
    return (
      <LegacySkin>
        <CicdProblemScreen code={initialProblemCode} />
      </LegacySkin>
    );
  }
  if (sandbox) {
    return (
      <LegacySkin>
        <CicdSandbox
          onExit={() => {
            setSandbox(false);
          }}
        />
      </LegacySkin>
    );
  }
  return (
    <CicdCampaign
      onSandbox={() => {
        setSandbox(true);
      }}
    />
  );
}
