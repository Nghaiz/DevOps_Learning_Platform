'use client';

/**
 * Vỏ client của `/games/cicd/<levelId>` — 19.D.
 *
 * ## Vì sao màn chơi có route riêng thay vì một tham số truy vấn
 *
 * Quyết định #3 đòi sân chơi **toàn màn hình, đúng như game K8s**, và AC-D7 đo
 * bằng số: chiều rộng > 95% viewport. Vỏ `.practice-shell` chừa 224px sidebar
 * cho mọi route không-immersive, tức ~82.5% ở 1280px.
 *
 * `isImmersiveRoute()` chỉ nhận `pathname`, nên chừng nào màn chơi còn sống ở
 * `?level=` thì **không luật nào trong `immersive-routes.ts` thấy được nó** —
 * và nhét cả `/games/cicd` vào danh sách khớp-chính-nó sẽ kéo theo trang danh
 * mục, nơi `CicdCampaign` không có nút thoát nào.
 *
 * Tệ hơn nữa: `levelId` trước đây là **React state**, nên bấm một màn từ danh
 * sách KHÔNG đổi URL. Cùng một `/games/cicd` phục vụ cả hai trạng thái, và không
 * phép suy nào từ đường dẫn phân biệt được chúng. Đưa về đoạn con thật là cách
 * duy nhất làm cho vỏ trang đọc đúng thứ đang hiện.
 *
 * Lợi ích kèm theo, không phải lý do chính: deep-link tới từng màn, nút Back của
 * trình duyệt chạy đúng, và chia sẻ được một màn cụ thể.
 */

import { useRouter } from 'next/navigation';
import { useCallback, type ReactElement } from 'react';
import { CICD_LEVELS, type CicdLevel, type TheoryDoc } from '@devops-platform/games';

import { CicdLevelScreen } from './cicd-level-screen';

export interface CicdLevelRouteProps {
  readonly level: CicdLevel;
  /** Bài lý thuyết của màn. `null` khi level không khai `theoryId`. */
  readonly theory: TheoryDoc | null;
}

export function CicdLevelRoute({ level, theory }: CicdLevelRouteProps): ReactElement {
  const router = useRouter();

  const onExit = useCallback(() => {
    router.push('/games/cicd');
  }, [router]);

  /*
   * Màn kế tiếp đọc từ CICD_LEVELS chứ không từ một bảng "màn sau là màn nào"
   * chép tay: thứ tự chiến dịch đã nằm trong chính mảng đó, và một bảng thứ hai
   * sẽ trôi khỏi nó ngay lần đầu ai đó chèn một màn vào giữa.
   *
   * ⚠ `CICD_LEVELS`, không `CI_LEVELS` — đọc nửa CI ở tầng giao diện là giấu cả
   * chương CD mà không lỗi nào báo (chú thích ở `levels/index.ts`).
   */
  const index = CICD_LEVELS.findIndex((l) => l.id === level.id);
  const next = index >= 0 ? CICD_LEVELS[index + 1] : undefined;

  const onNext = useCallback(() => {
    if (next === undefined) return;
    router.push(`/games/cicd/${next.id}`);
  }, [router, next]);

  return (
    <CicdLevelScreen
      key={level.id}
      level={level}
      theory={theory}
      onExit={onExit}
      {...(next === undefined ? {} : { onNext })}
    />
  );
}
