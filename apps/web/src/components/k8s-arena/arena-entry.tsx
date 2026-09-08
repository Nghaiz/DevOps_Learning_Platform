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
import { LEVELS } from '@devops-platform/games';
import type { ArenaModeContext } from './arena-contract';
import { ArenaRoot } from './arena-root';
import { LevelPicker } from './level-picker';

export interface ArenaEntryProps {
  /** Từ `?problem=` trên route. `null` = chế độ level. */
  readonly problemCode: string | null;
}

export function ArenaEntry({ problemCode }: ArenaEntryProps): ReactElement {
  const [levelId, setLevelId] = useState<string | null>(null);

  /*
   * Chế độ suy MỘT LẦN ở đây rồi truyền xuống, đúng như hợp đồng yêu cầu. Không
   * component con nào được tự đọc `problemCode` để đoán chế độ.
   */
  const mode = useMemo<ArenaModeContext>(
    () => ({
      mode: problemCode === null ? 'level' : 'problem',
      problemCode,
      /* Bài OJ không dạy, nên không có ngăn tra cứu. */
      codexAvailable: problemCode === null,
      hintsCostPoints: problemCode !== null,
    }),
    [problemCode],
  );

  const level = useMemo(() => LEVELS.find((entry) => entry.id === levelId) ?? null, [levelId]);

  if (level === null) {
    return <LevelPicker levels={LEVELS} onPick={setLevelId} />;
  }

  return <ArenaRoot level={level} mode={mode} onExit={() => setLevelId(null)} />;
}
