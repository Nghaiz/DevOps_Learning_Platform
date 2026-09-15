'use client';

/**
 * Cửa vào đấu trường: chọn level, và dựng ngữ cảnh chế độ.
 *
 * Tách khỏi `arena-root.tsx` vì hai việc khác nhau: file này quyết định CHƠI BÀI
 * NÀO, còn `ArenaRoot` lo việc chơi. Gộp lại thì mỗi lần đổi level sẽ dựng lại
 * cả cây cảnh 3D.
 *
 * ⚠ `LEVELS` và `createSession` phải được import ở phía client, không truyền từ
 * Server Component xuống: hàm không serialize qua ranh giới server-client, và
 * `createSession` là một hàm.
 */

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import { LEVELS } from '@devops-platform/games';
import type { ArenaModeContext } from './arena-contract';
import type { HintReveal } from '../../lib/use-hint-reveal';
import { ArenaRoot } from './arena-root';
import { LevelPicker } from './level-picker';

/**
 * Một Map rỗng DÙNG CHUNG cho mọi lần render của chế độ `level`.
 *
 * Hằng ở module scope chứ không phải `new Map()` trong `useMemo`: mảng phụ
 * thuộc của `mode` là rỗng, nên một Map dựng tại chỗ vẫn ổn định — nhưng viết
 * hằng ra ngoài làm điều đó ĐÚNG TỰ THÂN thay vì đúng nhờ một chi tiết của
 * `useMemo` mà lần sửa sau có thể đánh rơi.
 */
const HINT_REVEALS_RONG: ReadonlyMap<number, HintReveal> = new Map();

/**
 * Chế độ làm bài nạp LƯỜI, và đó là điều kiện để giữ lời hứa của trụ cột game.
 *
 * `arena-problem.tsx` kéo theo client tRPC + TanStack Query. `app/games/layout.tsx`
 * cố ý không cấp `TrpcQueryProvider` vì game phải chạy với 0 lời gọi backend;
 * một `import` tĩnh ở đây sẽ đưa cả tầng mạng vào bundle của người chơi level,
 * tức trả giá cho một thứ họ không dùng. Cùng khuôn `games/git/git-game.tsx`.
 *
 * `ssr: false` vì màn đó chỉ tồn tại sau khi truy vấn về — render nó ở máy chủ
 * là dựng một khung "đang tải" rồi vứt đi.
 */
const ArenaProblemScreen = dynamic(
  () => import('./arena-problem').then((m) => m.ArenaProblemScreen),
  { ssr: false },
);

export interface ArenaEntryProps {
  /** Từ `?problem=` trên route. `null` = chế độ level. */
  readonly problemCode: string | null;
}

export function ArenaEntry({ problemCode }: ArenaEntryProps): ReactElement {
  /*
   * ⛔ Chế độ `problem` RẼ TRƯỚC MỌI THỨ KHÁC, và trước cả hook chọn level.
   *
   * Bản trước dựng `mode` rồi vẫn rơi xuống `LevelPicker` khi chưa chọn level —
   * nên một người mở `?problem=K8S-0001` được mời chọn một level trong `LEVELS`,
   * chơi nó, và nộp một nhật ký mang `levelId: 'k8s-NN-…'`. Máy chủ so trường đó
   * với `problem.code` và từ chối; không lượt nộp K8s nào từng qua được cổng ấy.
   *
   * Hai chế độ nay là hai cây component tách hẳn: chế độ `level` giữ nguyên
   * đường cũ (0 lời gọi mạng), chế độ `problem` đi qua `arena-problem.tsx` — nơi
   * level được DỰNG TỪ ĐỀ BÀI chứ không được chọn.
   */
  if (problemCode !== null) {
    return <ArenaProblemScreen code={problemCode} />;
  }
  return <ArenaLevelEntry />;
}

/**
 * Cửa vào chế độ `level`: chọn một bài trong `LEVELS` rồi chơi.
 *
 * Tách thành component riêng vì `ArenaEntry` phải rẽ chế độ TRƯỚC khi gọi hook
 * nào — `useState`/`useMemo` gọi có điều kiện là vi phạm luật hook. Tách ra là
 * cách duy nhất vừa rẽ sớm vừa giữ hook hợp lệ.
 */
function ArenaLevelEntry(): ReactElement {
  const [levelId, setLevelId] = useState<string | null>(null);

  /*
   * Chế độ suy MỘT LẦN ở đây rồi truyền xuống, đúng như hợp đồng yêu cầu. Không
   * component con nào được tự đọc `problemCode` để đoán chế độ.
   */
  const mode = useMemo<ArenaModeContext>(
    () => ({
      mode: 'level',
      problemCode: null,
      /* Ngăn tra cứu chỉ có ở chế độ dạy. */
      codexAvailable: true,
      hintsCostPoints: false,
      // Chế độ `level` không có đề bài nào — `null` là đúng nghĩa, không phải
      // chỗ giữ chỗ.
      problem: null,
      /*
       * Chữ gợi ý của chế độ `level` nằm sẵn trong `LEVELS`, nên không có gì để
       * xin máy chủ. `null` chứ không phải một hàm rỗng: một hàm rỗng luôn trả
       * `null` sẽ đọc ra thành "xin thất bại" ở chỗ gọi, và nút gợi ý của chế độ
       * dạy sẽ ngừng hoạt động.
       */
      hintReveals: HINT_REVEALS_RONG,
      onRevealHint: null,
    }),
    [],
  );

  const level = useMemo(() => LEVELS.find((entry) => entry.id === levelId) ?? null, [levelId]);

  if (level === null) {
    return <LevelPicker levels={LEVELS} onPick={setLevelId} />;
  }

  return <ArenaRoot level={level} mode={mode} onExit={() => setLevelId(null)} />;
}
